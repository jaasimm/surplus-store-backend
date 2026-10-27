const User = require('../models/User');
const Product = require('../models/Product');
const { asyncHandler, ApiError } = require('../utils/api');

/* --------------------------------------------------------- GET /api/users/profile */
const getProfile = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { user: req.user } });
});

/* ------------------------------------------------------ PUT /api/users/profile */
const updateProfile = asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  const user = await User.findById(req.user._id);
  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  await user.save();
  res.json({ success: true, message: 'Profile updated', data: { user } });
});

/* ------------------------------------------------------ GET /api/users/addresses */
const listAddresses = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user.addresses || [] });
});

/* ----------------------------------------------------- POST /api/users/addresses */
const addAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user.addresses.length >= 8) throw ApiError.badRequest('You can save up to 8 addresses');

  if (req.body.isDefault) user.addresses.forEach((a) => (a.isDefault = false));
  const isFirst = user.addresses.length === 0;
  user.addresses.push({ ...req.body, isDefault: req.body.isDefault || isFirst });
  await user.save();
  res.status(201).json({ success: true, message: 'Address saved', data: user.addresses });
});

/* --------------------------------------------------- PUT /api/users/addresses/:id */
const updateAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const address = user.addresses.id(req.params.id);
  if (!address) throw ApiError.notFound('Address not found');

  if (req.body.isDefault) user.addresses.forEach((a) => (a.isDefault = false));
  Object.assign(address, req.body);
  await user.save();
  res.json({ success: true, message: 'Address updated', data: user.addresses });
});

/* ------------------------------------------------ DELETE /api/users/addresses/:id */
const deleteAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const address = user.addresses.id(req.params.id);
  if (!address) throw ApiError.notFound('Address not found');

  const wasDefault = address.isDefault;
  address.deleteOne();
  if (wasDefault && user.addresses.length) user.addresses[0].isDefault = true;
  await user.save();
  res.json({ success: true, message: 'Address removed', data: user.addresses });
});

/* ------------------------------------------------------ POST /api/users/addresses/:id/default */
const setDefaultAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const address = user.addresses.id(req.params.id);
  if (!address) throw ApiError.notFound('Address not found');
  user.addresses.forEach((a) => (a.isDefault = String(a._id) === String(address._id)));
  await user.save();
  res.json({ success: true, data: user.addresses });
});

/* ------------------------------------------------------------- GET /api/users/wishlist */
const getWishlist = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).populate({
    path: 'wishlist',
    match: { isActive: true },
    populate: { path: 'category', select: 'name slug' },
  });
  res.json({ success: true, data: user.wishlist.filter(Boolean) });
});

/* -------------------------------------------------------- POST /api/users/wishlist */
/** Toggle a product in/out of the wishlist. */
const toggleWishlist = asyncHandler(async (req, res) => {
  const { productId } = req.body;
  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Product not found');

  const user = await User.findById(req.user._id);
  const exists = user.wishlist.some((id) => String(id) === String(productId));
  if (exists) {
    user.wishlist = user.wishlist.filter((id) => String(id) !== String(productId));
  } else {
    user.wishlist.push(productId);
  }
  await user.save();

  res.json({
    success: true,
    message: exists ? 'Removed from wishlist' : 'Added to wishlist',
    data: { wishlist: user.wishlist.map(String), added: !exists },
  });
});

module.exports = {
  getProfile,
  updateProfile,
  listAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getWishlist,
  toggleWishlist,
};
