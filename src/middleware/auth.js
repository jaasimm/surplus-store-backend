const jwt = require('jsonwebtoken');
const { asyncHandler, ApiError } = require('../utils/api');
const { verifyAccess } = require('../utils/tokens');
const User = require('../models/User');

/**
 * requireAuth  – must be logged in (reads the httpOnly ss_access cookie).
 * optionalAuth – attaches req.user when a valid token exists, otherwise continues.
 * adminOnly    – must be logged in with role === 'admin'.
 */
const authenticate = ({ required = true, role = null }) =>
  asyncHandler(async (req, _res, next) => {
    const token = req.cookies?.ss_access;
    if (!token) {
      if (!required) return next();
      throw ApiError.unauthorized();
    }

    let payload;
    try {
      payload = verifyAccess(token);
    } catch (err) {
      // Optional mode: an expired OR a corrupted cookie just means "treat as guest".
      if (!required) return next();
      throw ApiError.unauthorized(
        err.name === 'TokenExpiredError' ? 'Session expired, please log in again' : 'Invalid session, please log in again'
      );
    }

    const user = await User.findById(payload.sub).select('role name mobile email addresses wishlist isActive');
    if (!user || !user.isActive) {
      if (!required) return next();
      throw ApiError.unauthorized('Account not found or disabled');
    }

    if (role && user.role !== role) throw ApiError.forbidden();
    req.user = user;
    next();
  });

/** Also accept a guest cart id so guest carts can be merged after login. */
function attachGuestId(req, _res, next) {
  req.guestId = req.body?.guestId || req.query?.guestId || req.headers['x-guest-id'] || '';
  next();
}

module.exports = {
  requireAuth: authenticate({ required: true }),
  adminOnly: authenticate({ required: true, role: 'admin' }),
  optionalAuth: authenticate({ required: false }),
  attachGuestId,
};
