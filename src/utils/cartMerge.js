const Cart = require('../models/Cart');

const MAX_QTY_PER_LINE = 20;

/**
 * Merge the guest cart into the user's cart after login.
 * Duplicate lines (same product + size + colour) have their quantities combined.
 * Returns the saved user cart (or null when the user has no cart).
 */
async function mergeGuestCart(userId, guestId) {
  if (!guestId) {
    return Cart.findOne({ user: userId });
  }

  const [guestCart, userCart] = await Promise.all([
    Cart.findOne({ guestId }),
    Cart.findOne({ user: userId }),
  ]);
  if (!guestCart || guestCart.items.length === 0) return userCart;

  const merged = userCart || new Cart({ user: userId, items: [] });

  for (const g of guestCart.items) {
    const existing = merged.items.find(
      (i) => String(i.product) === String(g.product) && i.size === g.size && i.color === g.color
    );
    if (existing) {
      existing.qty = Math.min(MAX_QTY_PER_LINE, existing.qty + g.qty);
    } else {
      merged.items.push({ ...g.toObject(), _id: undefined });
    }
  }

  await Promise.all([
    merged.save(),
    // remove the guest cart (and any stray duplicate user carts)
    Cart.deleteMany({ guestId }),
  ]);

  return merged;
}

/** Resolve the cart document for the current request (user cart wins for logged-in users). */
async function getCart({ userId, guestId }) {
  if (userId) {
    let cart = await Cart.findOne({ user: userId });
    if (!cart) cart = new Cart({ user: userId, items: [] });
    return cart;
  }
  if (!guestId) return null;
  let cart = await Cart.findOne({ guestId });
  if (!cart) cart = new Cart({ guestId, items: [] });
  return cart;
}

module.exports = { mergeGuestCart, getCart, MAX_QTY_PER_LINE };
