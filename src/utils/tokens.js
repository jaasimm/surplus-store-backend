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
 * - Dev / same-origin deployments (Express also serves the SPA): `lax` works
 *   and, unlike `none`, is NOT rejected by browsers on plain-HTTP hosts.
 * - Cross-site https deployments (client and API on different origins): the
 *   browser requires `SameSite=None; Secure`, which is only valid over HTTPS —
 *   otherwise the cookie is silently dropped and every auth call 401s.
 */
const crossSite = env.isProd && env.clientUrl.startsWith('https');

const cookieOptions = () => ({
  httpOnly: true,
  secure: crossSite,
  sameSite: crossSite ? 'none' : 'lax',
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

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh, setAuthCookies, clearAuthCookies, cookieOptions };
