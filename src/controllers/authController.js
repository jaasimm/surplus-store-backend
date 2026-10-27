const env = require('../config/env');
const Otp = require('../models/Otp');
const User = require('../models/User');
const { asyncHandler, ApiError } = require('../utils/api');
const { hash, generateCode, sendSms } = require('../utils/otp');
const { normalizeMobile } = require('../utils/helpers');
const { setAuthCookies, clearAuthCookies, verifyRefresh } = require('../utils/tokens');
const { mergeGuestCart } = require('../utils/cartMerge');

const publicUser = (u) => ({
  id: String(u._id),
  mobile: u.mobile,
  name: u.name,
  email: u.email,
  role: u.role,
  addresses: u.addresses || [],
  wishlist: (u.wishlist || []).map(String),
  createdAt: u.createdAt,
});

/* ------------------------------------------------------------- POST /api/auth/send-otp */
/**
 * Step 1: request an OTP for a mobile number.
 * Rate limiting lives in the route (per IP + per number).
 * In development with OTP_PROVIDER=console the code is returned in the response.
 */
const sendOtp = asyncHandler(async (req, res) => {
  const mobile = normalizeMobile(req.body.mobile);
  const ttlMs = env.otp.ttlMinutes * 60 * 1000;

  // Only one active OTP per number at a time.
  await Otp.deleteMany({ mobile, consumed: false });

  const code = generateCode();
  await Otp.create({
    mobile,
    codeHash: hash(code),
    purpose: 'login',
    expiresAt: new Date(Date.now() + ttlMs),
    ip: req.ip,
  });

  await sendSms(mobile, `Your Surplus Store login code is ${code}. Valid for ${env.otp.ttlMinutes} minutes.`);

  const user = await User.findOne({ mobile }).select('name');
  res.json({
    success: true,
    message: `OTP sent to ${mobile}`,
    data: {
      mobile,
      resendSeconds: env.otp.resendSeconds,
      otpTtlMinutes: env.otp.ttlMinutes,
      isNewUser: !user,
      // DEV / Console helper – shown when using simulated console SMS
      devOtp: (!env.isProd || env.otp.provider === 'console') ? code : undefined,
    },
  });
});

/* ---------------------------------------------------------- POST /api/auth/verify-otp */
/**
 * Step 2: verify the OTP.
 * - Creates the account automatically when the number is new.
 * - Issues JWT httpOnly cookies.
 * - Merges the guest cart into the user cart.
 */
const verifyOtp = asyncHandler(async (req, res) => {
  const mobile = normalizeMobile(req.body.mobile);
  const { otp, guestId, name } = req.body;

  const record = await Otp.findOne({ mobile, consumed: false }).sort({ createdAt: -1 });
  if (!record) throw ApiError.badRequest('No OTP requested for this number. Please request a new code.');

  if (record.expiresAt.getTime() < Date.now()) {
    await record.deleteOne();
    throw ApiError.badRequest('This OTP has expired. Please request a new one.');
  }

  if (record.attempts >= env.otp.maxAttempts) {
    await record.deleteOne();
    throw ApiError.tooMany('Too many incorrect attempts. Please request a new OTP.');
  }

  if (record.codeHash !== hash(otp)) {
    record.attempts += 1;
    await record.save();
    const left = env.otp.maxAttempts - record.attempts;
    throw ApiError.badRequest(`Incorrect OTP. ${left > 0 ? `${left} attempt(s) left.` : 'Please request a new one.'}`);
  }

  record.consumed = true;
  await record.save();

  let user = await User.findOne({ mobile });
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    user = await User.create({
      mobile,
      name: typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : '',
      role: mobile === normalizeMobile(env.seed.adminMobile) ? 'admin' : 'user',
      lastLoginAt: new Date(),
    });
  } else if (!user.isActive) {
    throw ApiError.forbidden('This account has been disabled. Please contact support.');
  } else {
    user.lastLoginAt = new Date();
    if (!user.name && typeof name === 'string' && name.trim()) user.name = name.trim().slice(0, 60);
    await user.save();
  }

  // Merge guest cart → user cart (so the shopper keeps everything they added)
  await mergeGuestCart(user._id, guestId);

  setAuthCookies(res, user);
  res.json({
    success: true,
    message: isNewUser ? 'Welcome to Surplus Store! Your account has been created.' : `Welcome back${user.name ? `, ${user.name}` : ''}!`,
    data: { user: publicUser(user), isNewUser },
  });
});

/* -------------------------------------------------------------- POST /api/auth/refresh */
/** Rotate the access token using the refresh cookie. */
const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.ss_refresh;
  if (!token) throw ApiError.unauthorized('No session found');

  let payload;
  try {
    payload = verifyRefresh(token);
  } catch {
    throw ApiError.unauthorized('Session expired, please log in again');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw ApiError.unauthorized('Account not found');

  setAuthCookies(res, user);
  res.json({ success: true, data: { user: publicUser(user) } });
});

/* --------------------------------------------------------------- POST /api/auth/logout */
const logout = asyncHandler(async (req, res) => {
  clearAuthCookies(res);
  res.json({ success: true, message: 'Logged out' });
});

/* ----------------------------------------------------------------- GET /api/auth/me */
/**
 * Session probe — ALWAYS returns 200 so guests never see a scary 401.
 * - `user`       → the logged-in account (null for guests / expired access token)
 * - `canRefresh` → a refresh cookie exists, so the client may silently renew
 */
const me = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: {
      user: req.user ? publicUser(req.user) : null,
      canRefresh: Boolean(req.cookies?.ss_refresh),
    },
  });
});

module.exports = { sendOtp, verifyOtp, refresh, logout, me, publicUser };
