const Product = require('../models/Product');
const Category = require('../models/Category');
const env = require('../config/env');

const escapeXml = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

/** Static sitemap.xml built from the public pages + live products/categories. */
async function renderSitemap() {
  const base = env.clientUrl.replace(/\/$/, '');
  const today = new Date().toISOString().slice(0, 10);

  const staticRoutes = [
    ['', '1.0'],
    ['/shop', '0.9'],
    ['/about', '0.5'],
    ['/contact', '0.5'],
    ['/shipping-returns', '0.5'],
    ['/privacy', '0.3'],
  ];

  const [products, categories] = await Promise.all([
    Product.find({ isActive: true }).select('slug updatedAt').sort({ updatedAt: -1 }).limit(5000).lean(),
    Category.find({ isActive: true }).select('slug').lean(),
  ]);

  const urls = [
    ...staticRoutes.map(([path, priority]) => ({ loc: `${base}${path}`, lastmod: today, priority })),
    ...categories.map((c) => ({ loc: `${base}/shop?category=${escapeXml(c.slug)}`, lastmod: today, priority: '0.7' })),
    ...products.map((p) => ({
      loc: `${base}/product/${escapeXml(p.slug)}`,
      lastmod: (p.updatedAt || new Date()).toISOString().slice(0, 10),
      priority: '0.8',
    })),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) => `  <url><loc>${u.loc}</loc><lastmod>${u.lastmod}</lastmod><priority>${u.priority}</priority></url>`
  )
  .join('\n')}
</urlset>`;
}

module.exports = { renderSitemap };
