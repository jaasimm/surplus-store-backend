const crypto = require('crypto');
const { sameSite: authSameSite, secureCookie } = require('../utils/tokens');

/**
 * Lightweight CSRF protection (double-submit cookie).
 * - The server sets a readable `ss_csrf` cookie (NOT httpOnly).
 * - The browser must echo it in the `X-CSRF-Token` header on every mutating request.
 * Combined with SameSite=Lax cookies this blocks cross-site form posts.
 *
 * The SameSite / Secure policy mirrors the auth cookies so all cookies behave
 * consistently on mobile browsers (mixed policies cause silent drops on iOS/Android).
 */
function issueCsrfToken(req, res, next) {
  let token = req.cookies?.ss_csrf;
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
    res.cookie('ss_csrf', token, {
      httpOnly: false,          // must be readable by JS
      secure: secureCookie,     // mirrors auth cookie Secure flag
      sameSite: authSameSite,   // mirrors auth cookie SameSite flag
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
  req.csrfToken = token;
  next();
}

function csrfProtect(req, res, next) {
  const safe = ['GET', 'HEAD', 'OPTIONS'];
  if (safe.includes(req.method)) return next();

  const cookie = req.cookies?.ss_csrf;
  const header = req.get('X-CSRF-Token') || req.get('x-csrf-token');

  // Must have a CSRF header or cookie
  if (!header && !cookie) {
    return res.status(403).json({ success: false, message: 'Invalid or missing CSRF token. Please refresh the page.' });
  }

  // If both exist, verify that they match
  if (cookie && header && cookie !== header) {
    return res.status(403).json({ success: false, message: 'CSRF token mismatch. Please refresh the page.' });
  }

  next();
}

module.exports = { issueCsrfToken, csrfProtect };
