const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { asyncHandler, ApiError } = require('../utils/api');
const { getCart, MAX_QTY_PER_LINE } = require('../utils/cartMerge');
const { computeTotals } = require('../utils/helpers');

const ctx = (req) => ({ userId: req.user?._id, guestId: req.guestId });

/** Build the JSON payload the frontend renders (totals included). */
function cartPayload(cart) {
  if (!cart) return { items: [], count: 0, itemsPrice: 0, shippingPrice: 0, totalPrice: 0 };
  const totals = computeTotals(cart.items, null, 'razorpay');
  return {
    id: String(cart._id),
    items: cart.items.map((i) => ({ ...i.toObject(), id: String(i._id) })),
    count: cart.items.reduce((s, i) => s + i.qty, 0),
    itemsPrice: totals.itemsPrice,
    mrpTotal: totals.mrpTotal,
    shippingPrice: totals.shippingPrice,
    totalPrice: totals.totalPrice,
  };
}

/* -------------------------------------------------------------- GET /api/cart */
const getMyCart = asyncHandler(async (req, res) => {
  const cart = await getCart(ctx(req));
  res.json({ success: true, data: cartPayload(cart) });
});

/* ------------------------------------------------------------- POST /api/cart */
/** Add an item (or increase quantity of an identical line). */
const addToCart = asyncHandler(async (req, res) => {
  const { productId, size, color, qty } = req.body;

  const product = await Product.findById(productId).populate('category', 'name slug');
  if (!product || !product.isActive) throw ApiError.notFound('Product not found');

  const variant = product.sizes.find((s) => s.size.toUpperCase() === String(size || '').toUpperCase());
  if (!variant) throw ApiError.badRequest(`Please select a size (${product.sizes.map((s) => s.size).join(', ')})`);
  if (variant.stock < qty) throw ApiError.badRequest(`Only ${variant.stock} left in size ${variant.size}`);

  const cart = await getCart(ctx(req));
  const existing = cart.items.find(
    (i) => String(i.product) === String(product._id) && i.size === variant.size && i.color === (color || '')
  );

  const newQty = (existing?.qty || 0) + qty;
  if (newQty > variant.stock) throw ApiError.badRequest(`Only ${variant.stock} available in size ${variant.size}`);

  if (existing) {
    existing.qty = Math.min(MAX_QTY_PER_LINE, newQty);
  } else {
    cart.items.push({
      product: product._id,
      title: product.title,
      image: product.images[0]?.url || '',
      price: product.price,
      mrp: product.mrp,
      size: variant.size,
      color: color || '',
      qty,
    });
  }

  await cart.save();
  res.status(201).json({ success: true, message: `${product.title} added to bag`, data: cartPayload(cart) });
});

/* -------------------------------------------------------------- PUT /api/cart */
const updateCartItem = asyncHandler(async (req, res) => {
  const { itemId, qty } = req.body;
  const cart = await getCart(ctx(req));
  const item = cart.items.id(itemId);
  if (!item) throw ApiError.notFound('Item not in your bag');

  // Re-check live stock before changing the quantity.
  const product = await Product.findById(item.product);
  const variant = product?.sizes.find((s) => s.size === item.size);
  if (variant && qty > variant.stock) throw ApiError.badRequest(`Only ${variant.stock} left in size ${item.size}`);

  item.qty = qty;
  await cart.save();
  res.json({ success: true, data: cartPayload(cart) });
});

/* ----------------------------------------------------------- DELETE /api/cart */
const removeCartItem = asyncHandler(async (req, res) => {
  const { itemId } = req.body;
  const cart = await getCart(ctx(req));
  const item = cart.items.id(itemId);
  if (!item) throw ApiError.notFound('Item not in your bag');
  item.deleteOne();
  await cart.save();
  res.json({ success: true, message: 'Removed from bag', data: cartPayload(cart) });
});

const clearCart = asyncHandler(async (req, res) => {
  const cart = await getCart(ctx(req));
  cart.items = [];
  cart.couponCode = '';
  await cart.save();
  res.json({ success: true, data: cartPayload(cart) });
});

module.exports = { getMyCart, addToCart, updateCartItem, removeCartItem, clearCart, cartPayload };
