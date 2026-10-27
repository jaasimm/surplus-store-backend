const Coupon = require('../models/Coupon');
const { asyncHandler, ApiError } = require('../utils/api');

/**
 * Look up a coupon and return the discount it applies to `subtotal`.
 * Never trusts the client: the discount is always recomputed server-side.
 */
async function resolveCoupon(code, subtotal, userId = null) {
  if (!code) return null;
  const coupon = await Coupon.findOne({ code: String(code).toUpperCase().trim() });
  if (!coupon || !coupon.active) throw ApiError.badRequest('Invalid coupon code');
  if (coupon.startsAt && coupon.startsAt.getTime() > Date.now()) throw ApiError.badRequest('This coupon is not active yet');
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) throw ApiError.badRequest('This coupon has expired');
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) throw ApiError.badRequest('This coupon has been fully used');
  if (subtotal < coupon.minOrder) throw ApiError.badRequest(`This coupon requires a minimum order of ₹${coupon.minOrder}`);

  const discount = coupon.computeDiscount(subtotal);
  if (discount <= 0) throw ApiError.badRequest('This coupon does not apply to your order');

  return { code: coupon.code, discount, description: coupon.description };
}

/* ------------------------------------------- POST /api/coupons/validate */
const validateCoupon = asyncHandler(async (req, res) => {
  const { code, subtotal } = req.body;
  const coupon = await resolveCoupon(code, Number(subtotal) || 0, req.user?._id);
  res.json({ success: true, message: `Coupon applied — you saved ₹${coupon.discount}`, data: coupon });
});

/* ----------------------------------------------- GET /api/coupons/active */
/** Public list of currently valid coupons (used for the offers strip). */
const activeCoupons = asyncHandler(async (_req, res) => {
  const now = new Date();
  const coupons = await Coupon.find({
    active: true,
    startsAt: { $lte: now },
    $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
  })
    .select('code description type value minOrder maxDiscount expiresAt')
    .limit(10)
    .lean();
  res.json({ success: true, data: coupons });
});

module.exports = { validateCoupon, activeCoupons, resolveCoupon };
