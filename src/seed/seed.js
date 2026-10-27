/**
 * Seed script — creates categories, ~24 demo products and the admin user.
 * Run with:  npm run seed
 *
 * Product images are generated as local SVG files in server/uploads/seed
 * so the demo works fully offline. Replace them from the admin panel.
 */
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');

const env = require('../config/env');
const connectDB = require('../config/db');
const { slugify, normalizeMobile } = require('../utils/helpers');

const Category = require('../models/Category');
const Product = require('../models/Product');
const User = require('../models/User');
const Coupon = require('../models/Coupon');

const SEED_DIR = path.join(__dirname, '..', '..', 'uploads', 'seed');

/* --------------------------------------------------------- SVG image maker */
const PALETTES = {
  men: [['#1f2937', '#4b5563'], ['#0f172a', '#334155'], ['#3f2d1f', '#8b6f47'], ['#1e3a5f', '#3b82f6']],
  women: [['#831843', '#db2777'], ['#4a044e', '#a855f7'], ['#7c2d12', '#f97316'], ['#0f766e', '#14b8a6']],
  kids: [['#065f46', '#10b981'], ['#92400e', '#f59e0b'], ['#1d4ed8', '#60a5fa'], ['#be185d', '#f472b6']],
  accessories: [['#111827', '#6b7280'], ['#312e81', '#6366f1']],
};

function writeSvg(file, { title, sub, colors, idx }) {
  const [c1, c2] = colors;
  const initials = title
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1125" viewBox="0 0 900 1125">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
    <pattern id="p" width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
      <rect width="60" height="60" fill="none"/><rect width="26" height="60" fill="#ffffff" opacity="0.04"/>
    </pattern>
  </defs>
  <rect width="900" height="1125" fill="url(#g)"/>
  <rect width="900" height="1125" fill="url(#p)"/>
  <circle cx="720" cy="180" r="190" fill="#ffffff" opacity="0.06"/>
  <circle cx="140" cy="960" r="240" fill="#ffffff" opacity="0.05"/>
  <text x="72" y="540" font-family="Georgia, serif" font-size="230" font-weight="700" fill="#ffffff" opacity="0.92">${initials}</text>
  <rect x="72" y="600" width="120" height="8" rx="4" fill="#ffffff" opacity="0.7"/>
  <text x="72" y="700" font-family="Helvetica, Arial, sans-serif" font-size="52" font-weight="600" fill="#ffffff">${title}</text>
  <text x="72" y="760" font-family="Helvetica, Arial, sans-serif" font-size="34" fill="#ffffff" opacity="0.75">${sub} · view ${idx + 1}</text>
  <text x="72" y="1050" font-family="Helvetica, Arial, sans-serif" font-size="30" letter-spacing="6" fill="#ffffff" opacity="0.6">SURPLUS STORE</text>
</svg>`;

  fs.writeFileSync(path.join(SEED_DIR, file), svg);
  return file;
}

function makeImages(title, sub, group, key) {
  const palette = PALETTES[group] || PALETTES.men;
  return [0, 1, 2].map((i) => {
    const file = writeSvg(`${key}-${i}.svg`, { title, sub, colors: palette[i % palette.length], idx: i });
    // served statically by Express at /uploads/seed/<file>
    return { url: `/uploads/seed/${file}`, alt: `${title} - view ${i + 1}` };
  });
}

/* --------------------------------------------------------------- catalog */
const CATEGORIES = [
  { name: 'T-Shirts', group: 'men', gender: 'men' },
  { name: 'Shirts', group: 'men', gender: 'men' },
  { name: 'Jeans', group: 'men', gender: 'men' },
  { name: 'Jackets', group: 'men', gender: 'men' },
  { name: 'Dresses', group: 'women', gender: 'women' },
  { name: 'Tops & Tees', group: 'women', gender: 'women' },
  { name: 'Kurtis', group: 'women', gender: 'women' },
  { name: 'Women Jeans', group: 'women', gender: 'women' },
  { name: 'Boys Clothing', group: 'kids', gender: 'kids' },
  { name: 'Girls Clothing', group: 'kids', gender: 'kids' },
  { name: 'Bags', group: 'accessories', gender: 'unisex' },
  { name: 'Watches', group: 'accessories', gender: 'unisex' },
];

const APPAREL_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const KIDS_SIZES = ['2-3Y', '4-5Y', '6-7Y', '8-9Y'];

const PRODUCTS = [
  // ---------------------------------------------------------------- MEN
  ['Premium Cotton Crew Neck Tee', 'T-Shirts', 'men', 499, 999, ['Black', 'White', 'Olive'], 'Everyday comfort meets clean design in this heavyweight 240 GSM combed-cotton tee that keeps its shape wash after wash.'],
  ['Oversized Drop Shoulder Tee', 'T-Shirts', 'men', 649, 1299, ['Charcoal', 'Sand', 'Sage'], 'Trend-led oversized fit with dropped shoulders, ribbed collar and a boxy hem. Pre-shrunk fabric.'],
  ['Striped Polo T-Shirt', 'T-Shirts', 'men', 799, 1599, ['Navy', 'Maroon'], 'A classic two-button polo in soft pique cotton — smart enough for Fridays, comfortable enough for Sunday.'],
  ['Slim Fit Oxford Shirt', 'Shirts', 'men', 1099, 2199, ['Sky Blue', 'White', 'Pink'], 'Tailored slim fit in breathable cotton oxford. Perfect spread collar, natural shell buttons.'],
  ['Casual Linen Look Shirt', 'Shirts', 'men', 949, 1899, ['Beige', 'Sage', 'Terracotta'], 'Airy linen-blend weave with a relaxed cut — the easiest way to look put together in the heat.'],
  ['Denim Casual Shirt', 'Shirts', 'men', 1299, 2599, ['Indigo', 'Washed Blue'], 'Mid-weight 8 oz denim with a soft wash, chest pockets and a comfortable regular fit.'],
  ['Skinny Fit Stretch Jeans', 'Jeans', 'men', 1399, 2799, ['Dark Blue', 'Jet Black'], 'Two-way stretch denim that moves with you. 5-pocket styling with a tapered leg.'],
  ['Relaxed Fit Jeans', 'Jeans', 'men', 1499, 2999, ['Stone Blue', 'Mid Blue'], 'Roomy through the thigh with a straight leg, crafted from rigid-look comfort denim.'],
  ['Washed Denim Jacket', 'Jackets', 'men', 2199, 4499, ['Vintage Blue'], 'A timeless trucker jacket in washed denim with metal buttons and an adjustable waist tab.'],
  ['Lightweight Bomber Jacket', 'Jackets', 'men', 1899, 3799, ['Black', 'Olive'], 'Water-resistant nylon bomber with ribbed cuffs and a sleek zip front. Year-round layering.'],

  // -------------------------------------------------------------- WOMEN
  ['Floral Fit & Flare Dress', 'Dresses', 'women', 1299, 2599, ['Red Floral', 'Blue Floral'], 'A breezy midi dress with a flattering fit-and-flare silhouette, smocked waist and side pockets.'],
  ['Ribbed Bodycon Dress', 'Dresses', 'women', 999, 1999, ['Black', 'Wine'], 'Stretch rib knit that hugs in all the right places — day-to-night in one outfit.'],
  ['Chiffon Wrap Dress', 'Dresses', 'women', 1599, 3199, ['Mustard', 'Teal'], 'Feather-light chiffon with a self-tie wrap waist and flutter sleeves.'],
  ['Basic Round Neck Tee', 'Tops & Tees', 'women', 449, 899, ['White', 'Black', 'Pink'], 'Buttery-soft modal-cotton blend that drapes beautifully. A true wardrobe essential.'],
  ['Ruffle Sleeve Blouse', 'Tops & Tees', 'women', 899, 1799, ['Ivory', 'Cobalt'], 'Feminine ruffle sleeves and a relaxed body in crepe — pairs with everything.'],
  ['Cotton Straight Kurti', 'Kurtis', 'women', 799, 1599, ['Mustard', 'Teal', 'Rust'], 'Hand-block inspired print on soft cotton with a Mandarin collar and side slits.'],
  ['Printed Anarkali Kurti', 'Kurtis', 'women', 1199, 2399, ['Emerald', 'Maroon'], 'Flared anarkali silhouette with gota detailing — festive, but easy to wear.'],
  ['High Rise Skinny Jeans', 'Women Jeans', 'women', 1299, 2599, ['Dark Blue', 'Black'], 'High-rise jegging-feel denim with power stretch and a sculpting fit.'],

  // --------------------------------------------------------------- KIDS
  ['Kids Graphic Tee Pack', 'Boys Clothing', 'kids', 599, 1199, ['Blue Mix', 'Green Mix'], 'Pack of two super-soft cotton tees with fun screen prints. Built for playgrounds.'],
  ['Boys Cotton Shorts', 'Boys Clothing', 'kids', 449, 899, ['Navy', 'Grey'], 'Elastic waistband, deep pockets and durable stitching for non-stop adventures.'],
  ['Girls Tutu Party Dress', 'Girls Clothing', 'kids', 1099, 2199, ['Pink', 'Purple'], 'Layered tulle skirt with a satin bodice — birthday-party approved.'],
  ['Girls Printed Top & Shorts Set', 'Girls Clothing', 'kids', 899, 1799, ['Lemon', 'Mint'], 'Co-ord set in breathable cotton with an all-over print and comfy elastic waist.'],

  // --------------------------------------------------------- ACCESSORIES
  ['Canvas Sling Bag', 'Bags', 'unisex', 749, 1499, ['Olive', 'Black'], 'Water-repellent canvas with a padded laptop sleeve, magnetic flap and adjustable strap.'],
  ['Everyday Analog Watch', 'Watches', 'unisex', 1799, 3599, ['Black', 'Tan'], 'Minimal dial, genuine leather strap and 3 ATM water resistance. Includes a 1-year warranty.'],
];

/* ------------------------------------------------------------------ main */
(async () => {
  console.log('[seed] connecting…');
  await connectDB();

  if (process.argv.includes('--force') === false && (await Product.countDocuments()) > 0) {
    console.log('[seed] Products already exist. Re-running will replace the catalogue. Use `npm run seed -- --force`.');
  }

  fs.mkdirSync(SEED_DIR, { recursive: true });

  /* ---- categories ---- */
  await Category.deleteMany({});
  const categoryMap = {};
  for (let i = 0; i < CATEGORIES.length; i++) {
    const c = CATEGORIES[i];
    const doc = await Category.create({
      name: c.name,
      slug: slugify(c.name),
      group: c.group,
      sort: i,
      image: '',
      description: `${c.name} from Surplus Store`,
    });
    categoryMap[c.name] = doc;
  }
  console.log(`[seed] ${CATEGORIES.length} categories`);

  /* ---- products ---- */
  await Product.deleteMany({});
  const docs = PRODUCTS.map(([title, category, gender, price, mrp, colors, description], i) => {
    const key = slugify(title);
    const sizes =
      gender === 'kids'
        ? KIDS_SIZES.map((size, idx) => ({ size, stock: 6 + ((i + idx) % 12) }))
        : APPAREL_SIZES.map((size, idx) => ({ size, stock: 4 + ((i * 2 + idx) % 14) }));

    return {
      title,
      slug: `${key}-${i}`,
      description,
      brand: 'Surplus',
      category: categoryMap[category]._id,
      gender,
      images: makeImages(title, category, gender, key),
      sizes,
      colors,
      price,
      mrp,
      tags: [gender, category.toLowerCase(), 'india'],
      rating: Number((3.8 + ((i % 12) / 10)).toFixed(1)),
      numReviews: 12 + ((i * 7) % 90),
      soldCount: 20 + ((i * 37) % 400),
      isFeatured: [0, 4, 10, 14, 16, 22].includes(i),
      isActive: true,
    };
  });
  await Product.insertMany(docs);
  console.log(`[seed] ${docs.length} products`);

  /* ---- admin user ---- */
  const mobile = normalizeMobile(env.seed.adminMobile);
  const admin = await User.findOneAndUpdate(
    { mobile },
    { mobile, name: env.seed.adminName, role: 'admin', isActive: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log(`[seed] admin ready → mobile ${admin.mobile} (log in at /admin, OTP is printed in this console)`);

  /* ---- starter coupons ---- */
  await Coupon.deleteMany({});
  await Coupon.create([
    {
      code: 'WELCOME10',
      description: '10% off your first order (up to ₹300)',
      type: 'percent',
      value: 10,
      minOrder: 499,
      maxDiscount: 300,
      active: true,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    },
    {
      code: 'FLAT200',
      description: 'Flat ₹200 off on orders above ₹1499',
      type: 'flat',
      value: 200,
      minOrder: 1499,
      active: true,
      expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
    },
  ]);
  console.log('[seed] coupons: WELCOME10, FLAT200');

  await mongoose.disconnect();
  console.log('\n[seed] done ✔  Start the server with `npm run dev`\n');
  process.exit(0);
})().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
