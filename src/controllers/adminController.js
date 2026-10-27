const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const Contact = require('../models/Contact');
const { asyncHandler, ApiError } = require('../utils/api');
const { slugify } = require('../utils/helpers');
const { storeImage } = require('../middleware/upload');

/* ============================================================ DASHBOARD */
/* --------------------------------------------------- GET /api/admin/stats */
const stats = asyncHandler(async (_req, res) => {
  const paidOrCod = { 'payment.status': { $in: ['paid', 'cod_pending'] } };

  const [revenueAgg, orderCount, customerCount, productCount, byStatus, last14Days, topProducts, recentOrders, pendingReturns, lowStock] =
    await Promise.all([
      Order.aggregate([{ $match: paidOrCod }, { $group: { _id: null, revenue: { $sum: '$totalPrice' }, orders: { $sum: 1 } } }]),
      Order.countDocuments(),
      User.countDocuments({ role: 'user' }),
      Product.countDocuments({ isActive: true }),
      Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Order.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$totalPrice' },
            orders: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Order.aggregate([
        { $unwind: '$items' },
        { $group: { _id: '$items.title', units: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } },
        { $sort: { units: -1 } },
        { $limit: 5 },
      ]),
      Order.find().sort({ createdAt: -1 }).limit(8).populate('user', 'mobile name').lean(),
      Order.countDocuments({ 'returnRequest.status': 'requested' }),
      Product.aggregate([
        { $match: { isActive: true } },
        { $unwind: '$sizes' },
        { $match: { 'sizes.stock': { $lte: 3 } } },
        { $project: { title: 1, size: '$sizes.size', stock: '$sizes.stock' } },
        { $limit: 10 },
      ]),
    ]);

  res.json({
    success: true,
    data: {
      revenue: revenueAgg[0]?.revenue || 0,
      totalOrders: orderCount,
      paidOrders: revenueAgg[0]?.orders || 0,
      customers: customerCount,
      products: productCount,
      pendingReturns,
      ordersByStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.count])),
      salesLast14Days: last14Days,
      topProducts: topProducts.map((p) => ({ title: p._id, units: p.units, revenue: p.revenue })),
      recentOrders,
      lowStock,
    },
  });
});

/* ============================================================ PRODUCTS */
/* ------------------------------------------------------ POST /api/admin/products */
const createProduct = asyncHandler(async (req, res) => {
  const body = { ...req.body };

  // Accept multipart uploads (files) in addition to pre-uploaded URLs.
  if (req.files?.length) {
    const urls = await Promise.all(req.files.map((f) => storeImage(f, req)));
    body.images = [...(body.images || []), ...urls.map((url) => ({ url, alt: body.title }))];
  }
  if (typeof body.images === 'string') body.images = JSON.parse(body.images);
  if (typeof body.sizes === 'string') body.sizes = JSON.parse(body.sizes);
  if (typeof body.colors === 'string') body.colors = String(body.colors).split(',').map((c) => c.trim()).filter(Boolean);
  if (typeof body.tags === 'string') body.tags = String(body.tags).split(',').map((t) => t.trim()).filter(Boolean);

  let slug = slugify(body.title);
  const clash = await Product.exists({ slug });
  if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const product = await Product.create({ ...body, slug });
  res.status(201).json({ success: true, message: 'Product created', data: product });
});

/* ----------------------------------------------------- PUT /api/admin/products/:id */
const updateProduct = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  if (req.files?.length) {
    const urls = await Promise.all(req.files.map((f) => storeImage(f, req)));
    body.images = [...(body.images || []), ...urls.map((url) => ({ url, alt: body.title }))];
  }
  if (typeof body.images === 'string') body.images = JSON.parse(body.images);
  if (typeof body.sizes === 'string') body.sizes = JSON.parse(body.sizes);
  if (typeof body.colors === 'string') body.colors = String(body.colors).split(',').map((c) => c.trim()).filter(Boolean);
  if (typeof body.tags === 'string') body.tags = String(body.tags).split(',').map((t) => t.trim()).filter(Boolean);
  if (body.title) body.slug = slugify(body.title);

  const product = await Product.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
  if (!product) throw ApiError.notFound('Product not found');
  res.json({ success: true, message: 'Product updated', data: product });
});

/* -------------------------------------------------- DELETE /api/admin/products/:id */
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');
  res.json({ success: true, message: `"${product.title}" deleted` });
});

/* ---------------------------------------------------- GET /api/admin/products/:id */
/** Raw product document (including inactive) for the edit form. */
const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');
  res.json({ success: true, data: product });
});

/* ---------------------------------------------------- GET /api/admin/products */
/** Includes inactive products and low-stock info. */
const listAllProducts = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const filter = {};
  if (req.query.search) filter.title = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (req.query.active === 'true') filter.isActive = true;
  if (req.query.active === 'false') filter.isActive = false;

  const [items, total] = await Promise.all([
    Product.find(filter).populate('category', 'name slug').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Product.countDocuments(filter),
  ]);

  res.json({
    success: true,
    data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
  });
});

/* ============================================================== ORDERS */
/* ------------------------------------------------------ GET /api/admin/orders */
const listOrders = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.payment) filter['payment.status'] = req.query.payment;
  if (req.query.search) {
    const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ orderNumber: rx }, { 'shippingAddress.phone': rx }, { 'shippingAddress.name': rx }];
  }

  const [items, total] = await Promise.all([
    Order.find(filter).populate('user', 'mobile name email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Order.countDocuments(filter),
  ]);

  res.json({ success: true, data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
});

/* ------------------------------------------- PATCH /api/admin/orders/:id/status */
/** Update fulfilment status; cancelling restores the stock. */
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  const order = await Order.findById(req.params.id);
  if (!order) throw ApiError.notFound('Order not found');

  if (order.status === 'cancelled') throw ApiError.badRequest('This order was cancelled and cannot be changed');

  order.status = status;
  if (status === 'delivered') {
    order.deliveredAt = new Date();
    if (order.payment.method === 'cod') order.payment.status = 'paid';
  }
  order.statusHistory.push({ status, note: note || `Marked as ${status}`, at: new Date() });
  await order.save();

  if (status === 'cancelled') {
    for (const item of order.items) {
      await Product.updateOne({ _id: item.product, 'sizes.size': item.size }, { $inc: { 'sizes.$.stock': item.qty } });
    }
    if (order.payment.status === 'paid') {
      order.payment.status = 'refunded';
      await order.save();
    }
  }

  res.json({ success: true, message: `Order marked as ${status}`, data: order });
});

/* ---------------------------------------- PATCH /api/admin/orders/:id/return */
const handleReturnRequest = asyncHandler(async (req, res) => {
  const { action, note } = req.body; // approve | reject | received
  const order = await Order.findById(req.params.id);
  if (!order) throw ApiError.notFound('Order not found');
  if (!order.returnRequest?.requested) throw ApiError.badRequest('No return request on this order');

  const map = { approve: 'approved', reject: 'rejected', received: 'received' };
  if (!map[action]) throw ApiError.badRequest('Unknown action');

  order.returnRequest.status = map[action];
  order.statusHistory.push({
    status: order.status,
    note: note || `Return ${map[action]}`,
    at: new Date(),
  });
  if (action === 'reject') order.returnRequest.reason = order.returnRequest.reason;
  if (action === 'received' && order.payment.status === 'paid') order.payment.status = 'refunded';
  await order.save();

  res.json({ success: true, message: `Return ${map[action]}`, data: order });
});

/* =========================================================== CUSTOMERS */
/* -------------------------------------------------- GET /api/admin/customers */
const listCustomers = asyncHandler(async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const filter = { role: 'user' };
  if (req.query.search) {
    const rx = new RegExp(String(req.query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ mobile: rx }, { name: rx }, { email: rx }];
  }

  const [customers, total, spend] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
    Order.aggregate([
      { $match: { 'payment.status': { $in: ['paid', 'cod_pending'] } } },
      { $group: { _id: '$user', orders: { $sum: 1 }, spent: { $sum: '$totalPrice' }, lastOrder: { $max: '$createdAt' } } },
    ]),
  ]);

  const statsMap = Object.fromEntries(spend.map((s) => [String(s._id), s]));
  const items = customers.map((c) => ({
    ...c,
    orders: statsMap[String(c._id)]?.orders || 0,
    spent: statsMap[String(c._id)]?.spent || 0,
    lastOrderAt: statsMap[String(c._id)]?.lastOrder || null,
  }));

  res.json({ success: true, data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
});

/* ------------------------------------------------- PATCH /api/admin/customers/:id */
const updateCustomer = asyncHandler(async (req, res) => {
  const { isActive, name, role } = req.body;
  const customer = await User.findById(req.params.id);
  if (!customer) throw ApiError.notFound('Customer not found');
  if (String(customer._id) === String(req.user._id)) throw ApiError.badRequest('You cannot modify your own account here');

  if (isActive !== undefined) customer.isActive = Boolean(isActive);
  if (name) customer.name = name;
  if (role && ['user', 'admin'].includes(role)) customer.role = role;
  await customer.save();
  res.json({ success: true, message: 'Customer updated', data: customer });
});

/* ============================================================= COUPONS */
const listCoupons = asyncHandler(async (_req, res) => {
  const coupons = await Coupon.find().sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: coupons });
});

const createCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.create(req.body);
  res.status(201).json({ success: true, message: 'Coupon created', data: coupon });
});

const updateCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!coupon) throw ApiError.notFound('Coupon not found');
  res.json({ success: true, message: 'Coupon updated', data: coupon });
});

const deleteCoupon = asyncHandler(async (req, res) => {
  const coupon = await Coupon.findByIdAndDelete(req.params.id);
  if (!coupon) throw ApiError.notFound('Coupon not found');
  res.json({ success: true, message: `Coupon ${coupon.code} deleted` });
});

/* ============================================================== UPLOADS */
/* ---------------------------------------------------- POST /api/admin/uploads */
const uploadImages = asyncHandler(async (req, res) => {
  if (!req.files?.length) throw ApiError.badRequest('No image received');
  const urls = await Promise.all(req.files.map((f) => storeImage(f, req)));
  res.status(201).json({ success: true, data: { urls } });
});

/* ============================================================== MESSAGES */
const listContacts = asyncHandler(async (_req, res) => {
  const messages = await Contact.find().sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, data: messages });
});

const resolveContact = asyncHandler(async (req, res) => {
  const message = await Contact.findByIdAndUpdate(req.params.id, { resolved: true }, { new: true });
  if (!message) throw ApiError.notFound('Message not found');
  res.json({ success: true, data: message });
});

module.exports = {
  stats,
  createProduct,
  updateProduct,
  deleteProduct,
  getProduct,
  listAllProducts,
  listOrders,
  updateOrderStatus,
  handleReturnRequest,
  listCustomers,
  updateCustomer,
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  uploadImages,
  listContacts,
  resolveContact,
};
