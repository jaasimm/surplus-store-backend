const env = require('../config/env');

/** Create a URL-safe slug (handles spaces, dashes and unicode). */
function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

/** Mobile numbers are normalised to digits with an optional leading +. */
function normalizeMobile(input) {
  let m = String(input || '').replace(/[\s\-().]/g, '');
  if (!m) return '';
  if (!m.startsWith('+')) m = m.replace(/^0+/, ''); // drop leading zeros (Indian local format)
  m = m.replace(/^\+?/, '+');
  return m;
}

/**
 * Price breakdown for a set of cart items.
 * @param {{price:number, qty:number}[]} items
 * @param {{discount:number, code:string}|null} coupon
 * @param {'razorpay'|'cod'} method
 */
function computeTotals(items, coupon = null, method = 'razorpay') {
  const itemsPrice = items.reduce((sum, i) => sum + Number(i.price) * Number(i.qty), 0);
  const mrpTotal = items.reduce((sum, i) => sum + Number(i.mrp || i.price) * Number(i.qty), 0);

  const discount = coupon ? Math.min(coupon.discount || 0, itemsPrice) : 0;
  const afterDiscount = itemsPrice - discount;
  const shippingPrice = afterDiscount >= env.commerce.freeShippingAbove ? 0 : env.commerce.shippingFee;
  const codFee = method === 'cod' ? env.commerce.codFee : 0;

  return {
    itemsPrice,
    mrpTotal,
    discount,
    shippingPrice,
    codFee,
    totalPrice: Math.max(0, afterDiscount + shippingPrice + codFee),
  };
}

module.exports = { slugify, normalizeMobile, computeTotals };
