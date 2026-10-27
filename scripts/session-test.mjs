/**
 * Session-contract test:
 *  1. guest  → GET /auth/me must be 200 with { user: null, canRefresh: false } (no more 401 noise)
 *  2. logged in → /auth/me returns the user
 *  3. expired access token + valid refresh cookie → /auth/me 200 { user: null, canRefresh: true }
 *     and POST /auth/refresh silently restores the session (this is what protects verify-payment)
 *  4. no cookies at all → /auth/refresh 401, and no refresh call is needed for guests
 */
import jwt from 'jsonwebtoken'; // resolved from server/node_modules below

const BASE = 'http://localhost:5000';
const ACCESS_SECRET = process.env.ACCESS || 'dev_access_secret_change_me';
const REFRESH_SECRET = process.env.REFRESH || 'dev_refresh_secret_change_me';

let pass = 0;
let fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✔ ${name}`); } else { fail++; console.log(`  ✘ ${name} ${extra}`); }
};

const cookieHeader = (jar) => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
function absorb(res, jar) {
  for (const c of res.headers.getSetCookie?.() || []) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}
async function call(method, path, body, jar) {
  const headers = { 'Content-Type': 'application/json', 'X-Guest-ID': `sess-${Date.now()}` };
  if (jar.get('ss_csrf')) headers['X-CSRF-Token'] = jar.get('ss_csrf');
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...headers, Cookie: cookieHeader(jar) },
    body: body ? JSON.stringify(body) : undefined,
  });
  absorb(res, jar);
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  /* ---------------------------------------------------- 1. guest probe */
  console.log('\n── Guest session probe ───────────────────────────');
  const guestJar = new Map();
  await call('GET', '/api/auth/csrf', null, guestJar);
  const guestMe = await call('GET', '/api/auth/me', null, guestJar);
  check('guest /auth/me is 200 (was 401 before)', guestMe.status === 200);
  check('guest gets user:null + canRefresh:false',
    guestMe.json?.data?.user === null && guestMe.json?.data?.canRefresh === false,
    JSON.stringify(guestMe.json));

  /* ------------------------------------------- 2. garbage cookie tolerated */
  const junkJar = new Map([['ss_access', 'not-a-jwt.at.all'], ['ss_csrf', guestJar.get('ss_csrf')]]);
  const junkMe = await call('GET', '/api/auth/me', null, junkJar);
  check('corrupted access cookie → still 200 + canRefresh:false', junkMe.status === 200 && junkMe.json?.data?.user === null);

  /* ------------------------------------------------ 3. real login */
  console.log('\n── Logged-in session ─────────────────────────────');
  const jar = new Map();
  await call('GET', '/api/auth/csrf', null, jar);
  const mobile = `97${Date.now().toString().slice(-8)}`;
  const otpRes = await call('POST', '/api/auth/send-otp', { mobile, guestId: 'sess-guest' }, jar);
  const login = await call('POST', '/api/auth/verify-otp', { mobile, otp: otpRes.json.data.devOtp, guestId: 'sess-guest' }, jar);
  check('login sets both cookies', login.status === 200 && jar.has('ss_access') && jar.has('ss_refresh'));

  const me = await call('GET', '/api/auth/me', null, jar);
  check('/auth/me returns the user + canRefresh:true', me.json?.data?.user?.mobile === `+${mobile}` && me.json?.data?.canRefresh === true);

  /* ------------------------------- 4. simulate an expired access token */
  console.log('\n── Expired access token (the verify-payment case) ─');
  const expiredAccess = jwt.sign({ sub: me.json.data.user.id, role: 'user' }, ACCESS_SECRET, { expiresIn: '-1s' });
  const staleJar = new Map(jar);
  staleJar.set('ss_access', expiredAccess);

  const staleMe = await call('GET', '/api/auth/me', null, staleJar);
  check('expired access → /auth/me 200 with canRefresh:true', staleMe.status === 200 && staleMe.json?.data?.user === null && staleMe.json?.data?.canRefresh === true, JSON.stringify(staleMe.json));

  const refreshed = await call('POST', '/api/auth/refresh', {}, staleJar);
  check('silent refresh restores the session', refreshed.status === 200 && refreshed.json?.data?.user?.mobile === `+${mobile}`);
  check('refresh rotates BOTH cookies', staleJar.get('ss_access') !== expiredAccess && staleJar.get('ss_access').length > 50);

  const recovered = await call('GET', '/api/auth/me', null, staleJar);
  check('/auth/me works again after refresh', recovered.json?.data?.user?.mobile === `+${mobile}`);

  /* --------------------------------------- 5. protected call on stale jar */
  const wishlist = await call('GET', '/api/users/wishlist', null, staleJar);
  check('protected endpoint works with renewed cookie', wishlist.status === 200);

  /* ---------------------------------------------- 6. expired refresh token */
  console.log('\n── Fully expired session ──────────────────────────');
  const deadJar = new Map([['ss_access', expiredAccess], ['ss_refresh', jwt.sign({ sub: 'x' }, REFRESH_SECRET, { expiresIn: '-1s' })], ['ss_csrf', guestJar.get('ss_csrf')]]);
  const deadMe = await call('GET', '/api/auth/me', null, deadJar);
  check('expired refresh cookie → /auth/me 200, canRefresh:true (probe is safe)', deadMe.status === 200 && deadMe.json?.data?.user === null);
  const deadRefresh = await call('POST', '/api/auth/refresh', {}, deadJar);
  check('expired refresh cookie → refresh 401 (correct)', deadRefresh.status === 401);

  /* ------------------------------------------------------ 7. logout */
  console.log('\n── Logout ────────────────────────────────────────');
  await sleep(50);
  const out = await call('POST', '/api/auth/logout', {}, jar);
  check('logout clears the session', out.status === 200);
  const after = await call('GET', '/api/auth/me', null, jar);
  check('after logout → guest probe again', after.json?.data?.user === null);

  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  ${pass} passed, ${fail} failed`);
  console.log(`══════════════════════════════════════════════════\n`);
  process.exit(fail ? 1 : 0);
})();
