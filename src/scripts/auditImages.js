/**
 * Audit every image URL stored in the database.
 *
 *   npm run audit:images
 *   PUBLIC_API_URL=https://surplus-store-backend.onrender.com npm run audit:images
 *
 * Relative paths (`/uploads/seed/…`) are resolved against PUBLIC_API_URL
 * (default http://localhost:<PORT>), so point that at the API whose files you
 * want to verify. Every URL is fetched over HTTP and reported when it is
 * missing or does not return an image — that is your re-upload list.
 *
 * Exit code 1 when anything is broken (CI friendly).
 */
const env = require('../config/env');
const connectDB = require('../config/db');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');

const ORIGIN = (env.publicApiUrl || `http://localhost:${env.port}`).replace(/\/+$/, '');

const absolutise = (url) => {
  if (!url) return '';
  if (/^(https?:|data:)/i.test(url) || url.startsWith('//')) return url;
  try {
    return new URL(url, `${ORIGIN}/`).href;
  } catch {
    return url;
  }
};

/** HEAD-less check: one GET, cancel the body as soon as headers arrive. */
async function check(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const type = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (res.body) await res.body.cancel().catch(() => {});
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    // Netlify-style SPA fallbacks answer 200 text/html — that still breaks <img>.
    if (!type.startsWith('image/')) return { ok: false, reason: `not an image (${type || 'no content-type'})` };
    return { ok: true, reason: type };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/** Run the checker with a small concurrency window (CDNs dislike bursts). */
async function checkAll(items, limit = 6) {
  const results = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      results.push({ ...item, ...(await check(item.url)) });
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

(async () => {
  await connectDB();

  const refs = [];
  const add = (label, url) => {
    if (url) refs.push({ label, url: absolutise(url) });
  };

  const products = await Product.find().select('title images').lean();
  products.forEach((p) => (p.images || []).forEach((img, i) => add(`${p.title} [${i + 1}]`, img.url)));

  const categories = await Category.find().select('name image').lean();
  categories.forEach((c) => add(`Category: ${c.name}`, c.image));

  const orders = await Order.find().select('orderNumber items').lean();
  orders.forEach((o) => (o.items || []).forEach((it, i) => add(`Order ${o.orderNumber} [${i + 1}] ${it.title}`, it.image)));

  // Unique URLs, but keep every label that points at them.
  const byUrl = new Map();
  for (const ref of refs) {
    if (!byUrl.has(ref.url)) byUrl.set(ref.url, { url: ref.url, labels: [] });
    byUrl.get(ref.url).labels.push(ref.label);
  }

  const unique = [...byUrl.values()];
  console.log(`\n[audit] origin: ${ORIGIN}`);
  console.log(`[audit] ${refs.length} image references (${unique.length} unique URLs)`);
  console.log(`[audit] checking…\n`);

  const results = await checkAll(unique);
  const broken = results.filter((r) => !r.ok).sort((a, b) => b.labels.length - a.labels.length);
  const healthy = results.filter((r) => r.ok);

  if (broken.length) {
    console.log(`✗ BROKEN (${broken.length}) — these products need re-uploading:\n`);
    for (const r of broken) {
      console.log(`   ${r.reason.padEnd(22)} ${r.url}`);
      r.labels.forEach((l) => console.log(`      · ${l}`));
    }
    console.log('');
  }

  console.log(`✓ healthy: ${healthy.length}/${results.length}\n`);

  await require('mongoose').disconnect();
  process.exit(broken.length ? 1 : 0);
})().catch((err) => {
  console.error('[audit] failed:', err.message);
  process.exit(1);
});
