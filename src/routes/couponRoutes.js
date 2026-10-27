const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { optionalAuth } = require('../middleware/auth');
const { validateCoupon, activeCoupons } = require('../controllers/couponController');

const router = Router();

const limiter = rateLimit({ windowMs: 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });

router.get('/active', activeCoupons);
router.post(
  '/validate',
  limiter,
  optionalAuth,
  validate(z.object({ code: z.string().trim().min(3).max(24), subtotal: z.coerce.number().min(0) })),
  validateCoupon
);

module.exports = router;
