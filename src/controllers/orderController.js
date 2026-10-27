const Order = require('../models/Order');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const User = require('../models/User');
const { asyncHandler, ApiError } = require('../utils/api');
const { computeTotals } = require('../utils/helpers');
const { resolveCoupon } = require('./couponController');
const { createRazorpayOrder, verifyPaymentSignature, isConfigured, fetchPayment, MOCK_SIGNATURE } = require('../utils/razorpay');
const { sendOrderConfirmation } = require('../utils/notify');
const env = require('../config/env');

/* ------------------------------------------------------------ helpers */
const serialize = (o) => ({
  id: String(o._id),
  orderNumber: o.orderNumber,
  items: o.items.map((i) => ({ ...i.toObject?.() || i, product: String(i.product) })),
  shippingAddress: o.shippingAddress,
  payment: o.payment,
  itemsPrice: o.itemsPrice,
  shippingPrice: o.shippingPrice,
  codFee: o.codFee,
  discount: o.discount,
  couponCode: o.couponCode,
  totalPrice: o.totalPrice,
  status: o.status,
  statusHistory: o.statusHistory,
  cancelReason: o.cancelReason,
  returnRequest: o.returnRequest,
  createdAt: o.createdAt,
  deliveredAt: o.deliveredAt,
});

/** Put reserved units back into the products' size stock. */
async function restock(order) {
  for (const item of order.items) {
    await Product.updateOne(
      { _id: item.product, 'sizes.size': item.size },
      { $inc: { 'sizes.$.stock': item.qty } }
    );
  }
}

/** Reduce stock + record popularity once an order is committed. */
async function commitStock(order) {
  const ops = [];
  for (const item of order.items) {
    ops.push(
      Product.updateOne(
        { _id: item.product, 'sizes.size': item.size },
        { $inc: { 'sizes.$.stock': -item.qty, soldCount: item.qty } }
      )
    );
  }
  await Promise.all(ops);
}

async function clearUserCart(userId) {
  await Cart.deleteMany({ user: userId });
}

function pickAddress(user, { addressId, address }) {
  if (addressId) {
    const saved = user.addresses.id(addressId);
    if (!saved) throw ApiError.notFound('Saved address not found');
    return {
      name: saved.name,
      phone: saved.phone,
      pincode: saved.pincode,
      line1: saved.line1,
      line2: saved.line2,
      city: saved.city,
      state: saved.state,
    };
  }
  return {
    name: address.name,
    phone: address.phone,
    pincode: address.pincode,
    line1: address.line1,
    line2: address.line2 || '',
    city: address.city,
    state: address.state,
  };
}

/* ------------------------------------------------ POST /api/orders */
/**
 * Create an order from the user's server-side cart.
 * Stock is reserved immediately (and released if a Razorpay payment fails).
 */
const createOrder = asyncHandler(async (req, res) => {
  const { paymentMethod, couponCode } = req.body;
  const shippingAddress = pickAddress(req.user, req.body);

  const cart = await Cart.findOne({ user: req.user._id });
  if (!cart || cart.items.length === 0) throw ApiError.badRequest('Your bag is empty');

  /* ---- re-validate every line against live product data (never trust the client) ---- */
  const orderItems = [];
  for (const line of cart.items) {
    const product = await Product.findById(line.product);
    if (!product || !product.isActive) throw ApiError.badRequest(`"${line.title}" is no longer available`);

    const variant = product.sizes.find((s) => s.size === line.size);
    if (!variant) throw ApiError.badRequest(`Size ${line.size} is unavailable for ${product.title}`);
    if (variant.stock < line.qty) {
      throw ApiError.badRequest(`Only ${variant.stock} left for ${product.title} (${line.size})`);
    }

    orderItems.push({
      product: product._id,
      title: product.title,
      image: product.images[0]?.url || '',
      size: line.size,
      color: line.color,
      price: product.price, // always the current price
      mrp: product.mrp,
      qty: line.qty,
    });
  }

  /* ---- totals ---- */
  const coupon = await resolveCoupon(couponCode || cart.couponCode, orderItems.reduce((s, i) => s + i.price * i.qty, 0), req.user._id);
  const totals = computeTotals(orderItems, coupon, paymentMethod);

  const order = new Order({
    user: req.user._id,
    items: orderItems,
    shippingAddress,
    payment: { method: paymentMethod, status: paymentMethod === 'cod' ? 'cod_pending' : 'pending' },
    ...totals,
    couponCode: coupon?.code || '',
    status: 'placed',
    statusHistory: [{ status: 'placed', note: 'Order placed', at: new Date() }],
  });

  /* ---- payment branch ---- */
  if (paymentMethod === 'razorpay') {
    const rzpOrder = await createRazorpayOrder({
      amountPaise: Math.round(totals.totalPrice * 100),
      receipt: order.orderNumber,
      notes: { userId: String(req.user._id), mobile: req.user.mobile },
    });
    order.payment.razorpayOrderId = rzpOrder.id;
  }

  await order.save();
  await commitStock(order);

  if (paymentMethod === 'cod') {
    // COD is committed immediately → record coupon usage now
    if (coupon) await bumpCouponUsage(coupon.code, req.user._id);
    await clearUserCart(req.user._id);
    sendOrderConfirmation(order, req.user).catch(() => {});
    return res.status(201).json({
      success: true,
      message: 'Order placed successfully! Pay on delivery.',
      data: { order: serialize(order), redirect: `/order-success/${order.orderNumber}` },
    });
  }

  res.status(201).json({
    success: true,
    message: 'Order created, complete the payment',
    data: {
      order: serialize(order),
      razorpay: {
        keyId: env.razorpay.keyId,
        orderId: order.payment.razorpayOrderId,
        amount: Math.round(totals.totalPrice * 100),
        currency: env.commerce.currency,
        mock: !isConfigured(),
        prefill: { name: shippingAddress.name, contact: shippingAddress.phone, email: req.user.email || undefined },
      },
    },
  });
});

/* ------------------------------- POST /api/orders/verify-payment */
/**
 * SERVER-SIDE verification of the Razorpay checkout signature.
 * The order is marked paid only when HMAC(order_id|payment_id) matches.
 */
const verifyPayment = asyncHandler(async (req, res) => {
  const { orderId, razorpayOrderId, razorpayPaymentId, signature } = req.body;

  const order = await Order.findOne({ _id: orderId, user: req.user._id });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.payment.status === 'paid') {
    return res.json({ success: true, message: 'Payment already verified', data: { order: serialize(order) } });
  }
  if (order.payment.razorpayOrderId !== razorpayOrderId) throw ApiError.badRequest('Order id mismatch');

  // Mock mode (no Razorpay keys configured): the offline checkout sheet sends a
  // fixed signature. Only orders WE created with a mock id can use this path.
  const isMock = String(razorpayOrderId).startsWith('order_mock_');
  let valid = false;

  if (isMock) {
    valid = signature === MOCK_SIGNATURE;
  } else {
    valid = verifyPaymentSignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature,
    });
    if (valid) {
      // Extra safety: confirm with Razorpay that the payment actually succeeded.
      const payment = await fetchPayment(razorpayPaymentId);
      if (payment && payment.status !== 'captured' && payment.status !== 'authorized') valid = false;
    }
  }
  if (!valid) {
    order.payment.status = 'failed';
    await order.save();
    await restock(order);
    throw ApiError.badRequest('Payment verification failed. You have not been charged.');
  }

  order.payment.status = 'paid';
  order.payment.razorpayPaymentId = razorpayPaymentId;
  order.payment.signature = signature;
  order.payment.paidAt = new Date();
  order.statusHistory.push({ status: 'placed', note: 'Payment received', at: new Date() });
  await order.save();

  if (order.couponCode) await bumpCouponUsage(order.couponCode, req.user._id);
  await clearUserCart(req.user._id);
  sendOrderConfirmation(order, req.user).catch(() => {});

  res.json({ success: true, message: 'Payment verified — order confirmed!', data: { order: serialize(order) } });
});

async function bumpCouponUsage(code, userId) {
  const Coupon = require('../models/Coupon');
  await Coupon.updateOne({ code }, { $inc: { usedCount: 1 } });
  void userId;
}

/* -------------------------- POST /api/orders/:id/payment-failed */
/** Client reports a failed/cancelled checkout → release the reserved stock. */
const paymentFailed = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.payment.status !== 'pending') return res.json({ success: true, data: { order: serialize(order) } });

  order.payment.status = 'failed';
  order.statusHistory.push({ status: order.status, note: 'Payment failed', at: new Date() });
  await order.save();
  await restock(order);
  res.json({ success: true, data: { order: serialize(order) } });
});

/* ------------------------- POST /api/orders/:id/retry-payment */
/** Start a fresh Razorpay attempt for an existing unpaid order. */
const retryPayment = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.payment.status === 'paid') throw ApiError.badRequest('This order is already paid');
  if (order.status === 'cancelled') throw ApiError.badRequest('This order was cancelled');

  // Re-check availability, then re-reserve the stock we released on failure.
  for (const item of order.items) {
    const product = await Product.findById(item.product);
    const variant = product?.sizes.find((s) => s.size === item.size);
    if (!variant || variant.stock < item.qty) {
      throw ApiError.badRequest(`"${item.title}" (${item.size}) is out of stock right now`);
    }
  }
  await commitStock(order);

  const rzpOrder = await createRazorpayOrder({
    amountPaise: Math.round(order.totalPrice * 100),
    receipt: order.orderNumber,
    notes: { userId: String(order.user) },
  });

  order.payment.razorpayOrderId = rzpOrder.id;
  order.payment.status = 'pending';
  await order.save();

  res.json({
    success: true,
    data: {
      order: serialize(order),
      razorpay: {
        keyId: env.razorpay.keyId,
        orderId: rzpOrder.id,
        amount: Math.round(order.totalPrice * 100),
        currency: env.commerce.currency,
        mock: !isConfigured(),
        prefill: { name: order.shippingAddress.name, contact: order.shippingAddress.phone },
      },
    },
  });
});

/* -------------------------------------------- GET /api/orders/mine */
const myOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: orders.map(serialize) });
});

/* --------------------------------------------- GET /api/orders/:id */
const getOrder = asyncHandler(async (req, res) => {
  const byNumber = /^[A-Z]{2}-\d{8}-[A-Z0-9]{6}$/.test(req.params.id);
  const query = byNumber ? { orderNumber: req.params.id } : { _id: req.params.id };
  const order = await Order.findOne(query);
  if (!order) throw ApiError.notFound('Order not found');
  // Owners and admins only.
  const isOwner = String(order.user) === String(req.user?._id);
  if (!isOwner && req.user?.role !== 'admin') throw ApiError.forbidden();
  res.json({ success: true, data: serialize(order) });
});

/* ------------------------------ POST /api/orders/:id/cancel */
const cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!order) throw ApiError.notFound('Order not found');
  if (!['placed', 'packed'].includes(order.status)) {
    throw ApiError.badRequest('Only orders that are not yet shipped can be cancelled');
  }

  order.status = 'cancelled';
  order.cancelReason = req.body.reason || 'Cancelled by customer';
  if (order.payment.method === 'razorpay' && order.payment.status === 'paid') {
    order.payment.status = 'refunded';
  }
  order.statusHistory.push({ status: 'cancelled', note: order.cancelReason, at: new Date() });
  await order.save();
  await restock(order);

  res.json({ success: true, message: 'Order cancelled', data: serialize(order) });
});

/* ------------------------------- POST /api/orders/:id/return */
const requestReturn = asyncHandler(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!order) throw ApiError.notFound('Order not found');
  if (order.status !== 'delivered') throw ApiError.badRequest('Returns are only available for delivered orders');

  const deliveredAt = order.deliveredAt || order.createdAt;
  const withinWindow = Date.now() - deliveredAt.getTime() <= 7 * 24 * 60 * 60 * 1000;
  if (!withinWindow) throw ApiError.badRequest('The 7-day return window for this order has passed');

  order.returnRequest = {
    requested: true,
    reason: req.body.reason,
    status: 'requested',
    requestedAt: new Date(),
  };
  order.statusHistory.push({ status: order.status, note: `Return requested: ${req.body.reason}`, at: new Date() });
  await order.save();

  res.json({ success: true, message: 'Return request submitted. Our team will contact you shortly.', data: serialize(order) });
});

module.exports = {
  createOrder,
  verifyPayment,
  paymentFailed,
  retryPayment,
  myOrders,
  getOrder,
  cancelOrder,
  requestReturn,
  serialize,
};
