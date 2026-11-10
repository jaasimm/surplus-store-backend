const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Tokens are returned to the client ONLY inside httpOnly cookies.
 * Access token: 15 min. Refresh token: 7 days (rotated on every refresh).
 */
const signAccess = (user) =>
  jwt.sign({ sub: String(user._id), role: user.role }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtl,
  });

const signRefresh = (user) =>
  jwt.sign({ sub: String(user._id), v: 1 }, env.jwt.refreshSecret, { expiresIn: env.jwt.refreshTtl });

const verifyAccess = (token) => jwt.verify(token, env.jwt.accessSecret);
const verifyRefresh = (token) => jwt.verify(token, env.jwt.refreshSecret);

/**
 * Cookie policy.
 *
 * SameSite rules that actually work on mobile browsers:
 *
 * 1. Same-site HTTPS (client and API on the same domain or subdomains, e.g.
 *    surplusstore.in / api.surplusstore.in):
 *      SameSite=Lax; Secure=true
 *    `Lax` allows top-level navigations and GET-driven flows, and is NOT
 *    blocked by browsers on plain-HTTP proxies the way `None` can be.
 *    This is the safe default for most production deploys.
 *
 * 2. Truly cross-site HTTPS (client and API on completely different
 *    registered domains, e.g. Vercel front-end + Render back-end):
 *      SameSite=None; Secure=true
 *    Required so the browser sends cookies on cross-origin XHR. Works ONLY
 *    over HTTPS; without Secure the cookie is silently dropped by every
 *    modern browser, especially on mobile.
 *
 * Rule: set COOKIE_SAME_SITE=none in the server env only when the client and
 * API are on different registered domains. For everything else leave it unset
 * (defaults to lax + secure when in prod/https).
 */

// Explicit override from env (set to "none" for truly cross-origin deploys).
const _envSameSite = (process.env.COOKIE_SAME_SITE || '').toLowerCase();

// Detect whether we are running over HTTPS in production.
const isHttpsProd = env.isProd && env.clientUrl.startsWith('https');

// Choose sameSite.  "none" requires Secure=true (HTTPS only).
const sameSite = _envSameSite === 'none' ? 'none' : (isHttpsProd ? 'lax' : 'lax');
const secureCookie = _envSameSite === 'none' ? true : isHttpsProd;

const cookieOptions = () => ({
  httpOnly: true,
  secure: secureCookie,
  sameSite,
  path: '/',
});

/** Send the token pair as httpOnly cookies. */
function setAuthCookies(res, user) {
  const access = signAccess(user);
  const refresh = signRefresh(user);
  res.cookie('ss_access', access, { ...cookieOptions(), maxAge: 15 * 60 * 1000 });
  res.cookie('ss_refresh', refresh, { ...cookieOptions(), maxAge: 7 * 24 * 60 * 60 * 1000 });
  return { access, refresh };
}

function clearAuthCookies(res) {
  res.clearCookie('ss_access', cookieOptions());
  res.clearCookie('ss_refresh', cookieOptions());
}

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh, setAuthCookies, clearAuthCookies, cookieOptions, sameSite, secureCookie };
