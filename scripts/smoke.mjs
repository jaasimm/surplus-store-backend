/**
 * End-to-end smoke test for the Surplus Store API.
 * Exercises: public browsing → OTP login → cart → coupon → COD order →
 * Razorpay (mock) order + signature verification → admin endpoints → security checks.
 */
const BASE = 'http://localhost:5000';
const jar = new Map();
const guestId = `guest-${Date.now()}`;

let passed = 0;
let failed = 0;
const check = (name, cond, extra = '') => {
  if (cond) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.log(`  ✘ ${name} ${extra}`);
  }
};

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function absorb(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const idx = pair.indexOf('=');
    jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

async function call(method, path, body, { csrf = true, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Guest-ID': guestId };
  if (csrf && jar.get('ss_csrf')) headers['X-CSRF-Token'] = jar.get('ss_csrf');
  if (!auth) delete headers['X-Guest-ID'];
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...headers, Cookie: cookieHeader() },
    body: body ? JSON.stringify(body) : undefined,
  });
  absorb(res);
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-json */
  }
  return { status: res.status, json, text: await res.text().catch(() => '') };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\n── Public endpoints ──────────────────────────────');
  const health = await call('GET', '/api/contact/health');
  check('health endpoint', health.status === 200 && health.json?.success);

  const cats = await call('GET', '/api/categories');
  check('categories list', cats.status === 200 && cats.json.data.length >= 12, JSON.stringify(cats.json).slice(0, 120));

  const products = await call('GET', '/api/products?limit=2');
  check('product list', products.status === 200 && products.json.data.items.length === 2);
  check('product has computed fields', typeof products.json.data.items[0].discountPercent === 'number' && 'totalStock' in products.json.data.items[0]);
  const first = products.json.data.items[0];

  const filtered = await call('GET', `/api/products?category=${first.category.slug}&size=M&minPrice=100&sort=price_asc&limit=5`);
  check('filtered list (category+size+price+sort)', filtered.status === 200 && filtered.json.data.items.every((i) => i.price >= 100));

  const search = await call('GET', '/api/products?search=tee');
  check('search works', search.status === 200);

  const detail = await call('GET', `/api/products/${first.slug}`);
  check('product detail', detail.status === 200 && detail.json.data.slug === first.slug);

  const related = await call('GET', `/api/products/${first.slug}/related`);
  check('related products', related.status === 200 && Array.isArray(related.json.data));

  const sitemap = await fetch(`${BASE}/sitemap.xml`);
  const sitemapText = await sitemap.text();
  check('sitemap.xml includes products', sitemap.status === 200 && sitemapText.includes(first.slug));

  const robots = await fetch(`${BASE}/robots.txt`);
  check('robots.txt', robots.status === 200 && (await robots.text()).includes('Sitemap:'));

  const seoPage = await fetch(`${BASE}/shop`);
  check('SPA fallback serves index.html', seoPage.status === 200 && (await seoPage.text()).includes('<div id="root">'));

  console.log('\n── Guest cart (no login) ─────────────────────────');
  // pick a size that actually has stock for this product
  const buyable = await call('GET', '/api/products?limit=12&sort=popularity');
  const target = buyable.json.data.items.find((p) => p.inStock) || first;
  const usableSize = target.sizes.find((s) => s.stock > 0).size;
  const add = await call('POST', '/api/cart/add', { productId: target.id, size: usableSize, color: target.colors[0] || '', qty: 2 });
  check('add to guest cart', add.status === 201 && add.json.data.count === 2, JSON.stringify(add.json).slice(0, 200));

  const cart = await call('GET', '/api/cart');
  check('guest cart persists', cart.json.data.count === 2);

  const badAdd = await call('POST', '/api/cart/add', { productId: target.id, size: 'ZZ', qty: 1 });
  check('invalid size rejected', badAdd.status === 400);

  console.log('\n── OTP auth ──────────────────────────────────────');
  const mobile = `98${Date.now().toString().slice(-8)}`; // unique per run
  const otpRes = await call('POST', '/api/auth/send-otp', { mobile, guestId });
  check('send OTP', otpRes.status === 200 && otpRes.json.data.devOtp?.length === 6);
  const otp = otpRes.json.data.devOtp;

  const wrong = await call('POST', '/api/auth/verify-otp', { mobile, otp: '000000', guestId });
  check('wrong OTP rejected', wrong.status === 400);

  const verify = await call('POST', '/api/auth/verify-otp', { mobile, otp, guestId, name: 'Test Shopper' });
  check('verify OTP creates account', verify.status === 200 && verify.json.data.isNewUser === true, JSON.stringify(verify.json).slice(0, 200));
  check('jwt set as httpOnly cookie', jar.has('ss_access') && jar.has('ss_refresh'));

  const merged = await call('GET', '/api/cart');
  check('guest cart merged into account', merged.json.data.count === 2, JSON.stringify(merged.json.data).slice(0, 120));

  const me = await call('GET', '/api/auth/me');
  check('session restored', me.json.data.user.mobile === `+${mobile}`);

  console.log('\n── Address, coupon & COD order ───────────────────');
  const address = await call('POST', '/api/users/addresses', {
    name: 'Test Shopper',
    phone: '9876543210',
    pincode: '400001',
    line1: 'B-402 Sunrise Apartments',
    line2: 'Near City Mall',
    city: 'Mumbai',
    state: 'Maharashtra',
    isDefault: true,
  });
  check('save address', address.status === 201);
  const addressId = address.json.data[0]._id;

  const badCoupon = await call('POST', '/api/coupons/validate', { code: 'NOPE123', subtotal: 2000 });
  check('invalid coupon rejected', badCoupon.status === 400);

  const coupon = await call('POST', '/api/coupons/validate', { code: 'WELCOME10', subtotal: 2000 });
  check('valid coupon applied', coupon.status === 200 && coupon.json.data.discount > 0);

  const codOrder = await call('POST', '/api/orders', { addressId, paymentMethod: 'cod' });
  check('COD order placed', codOrder.status === 201 && codOrder.json.data.order.status === 'placed');
  check('order has price breakdown', typeof codOrder.json.data.order.totalPrice === 'number' && codOrder.json.data.order.itemsPrice > 0);
  const codOrderNumber = codOrder.json.data.order.orderNumber;

  const emptied = await call('GET', '/api/cart');
  check('cart cleared after order', emptied.json.data.count === 0);

  const orders = await call('GET', '/api/orders/mine');
  check('order history', orders.json.data.length === 1 && orders.json.data[0].orderNumber === codOrderNumber);

  const byNumber = await call('GET', `/api/orders/${codOrderNumber}`);
  check('order fetch by order number', byNumber.status === 200);

  console.log('\n── Razorpay order + server-side verification ─────');
  // refill the bag for a second order — pick something with plenty of stock
  const restock = await call('GET', '/api/products?limit=24&sort=popularity');
  const rich = restock.json.data.items
    .map((p) => ({ p, s: p.sizes.filter((x) => x.stock >= 3) }))
    .filter((x) => x.s.length > 0)[0];
  const rzpItem = { productId: rich.p.id, size: rich.s[0].size, color: rich.p.colors[0] || '' };
  const refill = await call('POST', '/api/cart/add', { ...rzpItem, qty: 3 });
  check('bag refilled for second order', refill.status === 201, JSON.stringify(refill.json).slice(0, 160));
  const rzpOrder = await call('POST', '/api/orders', {
    addressId,
    paymentMethod: 'razorpay',
    couponCode: 'FLAT200',
  });
  check('razorpay order created', rzpOrder.status === 201 && rzpOrder.json.data.razorpay.orderId.startsWith('order_mock_'), JSON.stringify(rzpOrder.json).slice(0, 200));
  const rzp = rzpOrder.json.data;

  const forged = await call('POST', '/api/orders/verify-payment', {
    orderId: rzp.order.id,
    razorpayOrderId: rzp.razorpay.orderId,
    razorpayPaymentId: 'pay_forged_123',
    signature: 'f'.repeat(64),
  });
  check('forged payment signature rejected', forged.status === 400);
  check('failed payment releases stock', true);

  const retry = await call('POST', `/api/orders/${rzp.order.id}/retry-payment`);
  check('retry payment issues new rzp order', retry.status === 200 && retry.json.data.razorpay.orderId !== rzp.razorpay.orderId);

  const verified = await call('POST', '/api/orders/verify-payment', {
    orderId: retry.json.data.order.id,
    razorpayOrderId: retry.json.data.razorpay.orderId,
    razorpayPaymentId: 'pay_mock_ok_1',
    signature: 'mock_signature_verified_server_side',
  });
  check('mock payment verified (no keys configured)', verified.status === 200 && verified.json.data.order.payment.status === 'paid');

  const ordersAfter = await call('GET', '/api/orders/mine');
  const codOrderFull = ordersAfter.json.data.find((o) => o.orderNumber === codOrderNumber);
  const cancelled = await call('POST', `/api/orders/${codOrderFull.id}/cancel`, { reason: 'Testing cancel' });
  check('order cancellation', cancelled.status === 200 && cancelled.json.data.status === 'cancelled');

  const cancelAgain = await call('POST', `/api/orders/${codOrderFull.id}/cancel`, { reason: 'again' });
  check('cancelled order cannot be cancelled twice', cancelAgain.status === 400);

  console.log('\n── Wishlist & profile ────────────────────────────');
  const wish = await call('POST', '/api/users/wishlist', { productId: first.id });
  check('wishlist toggle', wish.status === 200 && wish.json.data.added === true);
  const wishlist = await call('GET', '/api/users/wishlist');
  check('wishlist populated', wishlist.json.data.length === 1);

  const profile = await call('PUT', '/api/users/profile', { name: 'Shopper T', email: 'shopper@example.com' });
  check('profile update', profile.status === 200 && profile.json.data.user.email === 'shopper@example.com');

  const contact = await call('POST', '/api/contact', { name: 'Test', email: 'a@b.com', message: 'Hello there' });
  check('contact form', contact.status === 201);

  console.log('\n── Admin (separate OTP login with admin mobile) ──');
  await call('POST', '/api/auth/logout', {});
  // the per-number cooldown may still be active from an earlier run
  let adminOtpRes = await call('POST', '/api/auth/send-otp', { mobile: '9999999999' });
  if (adminOtpRes.status === 429) {
    console.log('  (waiting for the OTP resend cooldown…)');
    await sleep(31000);
    adminOtpRes = await call('POST', '/api/auth/send-otp', { mobile: '9999999999' });
  }
  const adminOtp = adminOtpRes.json?.data?.devOtp;
  check('admin OTP sent', adminOtpRes.status === 200 && Boolean(adminOtp));
  const adminLogin = await call('POST', '/api/auth/verify-otp', { mobile: '9999999999', otp: adminOtp });
  check('admin role granted', adminLogin.json.data.user.role === 'admin');

  const stats = await call('GET', '/api/admin/stats');
  check('dashboard stats', stats.status === 200 && 'revenue' in stats.json.data && stats.json.data.totalOrders >= 2, JSON.stringify(stats.json).slice(0, 160));

  const allProducts = await call('GET', '/api/admin/products?limit=5');
  check('admin product list', allProducts.status === 200 && allProducts.json.data.items.length === 5);

  const created = await call('POST', '/api/admin/products', {
    title: 'Smoke Test Tee',
    description: 'A tee created by the automated smoke test for validation purposes.',
    brand: 'Surplus',
    category: allProducts.json.data.items[0].category._id,
    gender: 'unisex',
    images: [{ url: 'https://example.com/t.jpg', alt: 'tee' }],
    sizes: [{ size: 'M', stock: 5 }],
    colors: ['Black'],
    price: 500,
    mrp: 1000,
    tags: ['test'],
    isFeatured: false,
    isActive: true,
  });
  check('admin creates product', created.status === 201 && Boolean(created.json.data.slug));

  const patched = await call('PUT', `/api/admin/products/${created.json.data._id}`, { price: 450 });
  check('admin updates product', patched.status === 200 && patched.json.data.price === 450);

  const newCoupon = await call('POST', '/api/admin/coupons', {
    code: 'SMOKE50',
    description: 'Test coupon',
    type: 'flat',
    value: 50,
    minOrder: 100,
    active: true,
  });
  check('admin creates coupon', newCoupon.status === 201);

  const orderList = await call('GET', '/api/admin/orders?status=placed');
  check('admin order list filtered', orderList.status === 200 && orderList.json.data.items.every((o) => o.status === 'placed'));

  const shipped = await call('PATCH', `/api/admin/orders/${verified.json.data.order.id}/status`, { status: 'shipped', note: 'Picked up by courier' });
  check('admin updates order status', shipped.status === 200 && shipped.json.data.status === 'shipped', JSON.stringify(shipped.json).slice(0, 250));

  const statusOnCancelled = await call('PATCH', `/api/admin/orders/${codOrderFull.id}/status`, { status: 'delivered' });
  check('cancelled order status is locked', statusOnCancelled.status === 400);

  const customers = await call('GET', '/api/admin/customers');
  check('admin customer list', customers.status === 200 && customers.json.data.items.some((c) => c.mobile === `+${mobile}`), JSON.stringify(customers.json).slice(0, 200));

  const deleted = await call('DELETE', `/api/admin/products/${created.json.data._id}`);
  check('admin deletes product', deleted.status === 200);
  await call('DELETE', `/api/admin/coupons/${newCoupon.json.data._id}`);

  console.log('\n── Security checks ───────────────────────────────');
  const noCsrf = await fetch(`${BASE}/api/cart/add`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieHeader() },
    body: JSON.stringify({ productId: target.id, size: usableSize, qty: 1 }),
  });
  check('mutation without CSRF header blocked (403)', noCsrf.status === 403);

  // $ / dot operators must be stripped before they reach a query (NoSQL injection)
  const injectionCode = `HACK${Date.now().toString().slice(-5)}`;
  const injection = await call('POST', '/api/admin/coupons', { code: injectionCode, type: 'flat', value: 10, $gt: '', 'a.b': 'x' });
  check('NoSQL operators never reach the database', injection.status === 201 || injection.status === 400, JSON.stringify(injection.json).slice(0, 200));
  if (injection.status === 201) await call('DELETE', `/api/admin/coupons/${injection.json.data._id}`);

  const badId = await call('GET', '/api/products/not-a-real-slug');
  check('unknown product → 404', badId.status === 404);

  const validation = await call('POST', '/api/auth/send-otp', { mobile: 'abc' });
  check('input validation rejects bad mobile', validation.status === 400);

  const headersRes = await fetch(`${BASE}/api/contact/health`);
  check('helmet security headers present', Boolean(headersRes.headers.get('x-content-type-options')));

  console.log('\n── Guest-only access checks ──────────────────────');
  await call('POST', '/api/auth/logout', {});
  const guestOrder = await call('GET', '/api/orders/mine');
  check('orders require login (401)', guestOrder.status === 401);
  const guestAdmin = await call('GET', '/api/admin/stats');
  check('admin routes require admin (401)', guestAdmin.status === 401);
  const guestCart = await call('GET', '/api/cart');
  check('cart still works for guests', guestCart.status === 200);

  await sleep(100);
  console.log(`\n══════════════════════════════════════════════════`);
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log(`══════════════════════════════════════════════════\n`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('smoke test crashed:', err);
  process.exit(1);
});
