const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');
const { optionalAuth, attachGuestId } = require('../middleware/auth');
const { sendOtp, verifyOtp, refresh, logout, me } = require('../controllers/authController');

const router = Router();

/* ----------------------------------------------------------- rate limiting */
// Global per-IP limit for the OTP endpoints (abuse / SMS pumping protection).
const otpIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many OTP requests. Please wait a few minutes and try again.' },
});

// Per-mobile-number cooldown (in-memory; use Redis in a multi-instance deployment).
const lastSent = new Map();
const OTP_COOLDOWN_MS = 30000;

const mobileCooldown = (req, res, next) => {
  const key = String(req.body?.mobile || '');
  const last = lastSent.get(key) || 0;
  const waitMs = OTP_COOLDOWN_MS - (Date.now() - last);
  if (waitMs > 0) {
    return res.status(429).json({
      success: false,
      message: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another OTP`,
      retryAfter: Math.ceil(waitMs / 1000),
    });
  }
  lastSent.set(key, Date.now());
  // prevent unbounded memory growth
  if (lastSent.size > 5000) {
    const cutoff = Date.now() - OTP_COOLDOWN_MS;
    for (const [k, v] of lastSent) if (v < cutoff) lastSent.delete(k);
  }
  next();
};

/* ------------------------------------------------------------------ routes */
/** Bootstrap endpoint: sets the CSRF cookie so the first POST can succeed. */
router.get('/csrf', (req, res) => {
  res.json({ success: true, data: { csrfToken: req.csrfToken } });
});

router.post('/send-otp', otpIpLimiter, mobileCooldown, attachGuestId, validate(schemas.sendOtp), sendOtp);
router.post('/verify-otp', otpIpLimiter, attachGuestId, validate(schemas.verifyOtp), verifyOtp);
router.post('/refresh', refresh);
router.post('/logout', logout);
// `optionalAuth` — never 401s; guests get { user: null, canRefresh: false }.
router.get('/me', optionalAuth, me);

module.exports = router;
