const { Schema, model, Types } = require('mongoose');

/** Guest + logged-in cart. Guests are keyed by a `guestId` stored in localStorage. */
const cartItemSchema = new Schema(
  {
    product: { type: Types.ObjectId, ref: 'Product', required: true },
    title: { type: String, required: true },
    image: { type: String, default: '' },
    price: { type: Number, required: true }, // snapshot so admin price edits don't mutate carts
    mrp: { type: Number, default: 0 },
    size: { type: String, default: '' },
    color: { type: String, default: '' },
    qty: { type: Number, required: true, min: 1, max: 20, default: 1 },
  },
  { _id: true }
);

const cartSchema = new Schema(
  {
    // Exactly one of these is set.
    user: { type: Types.ObjectId, ref: 'User', unique: true, sparse: true },
    guestId: { type: String, unique: true, sparse: true },
    items: { type: [cartItemSchema], default: [] },
    couponCode: { type: String, default: '' },
  },
  { timestamps: true }
);

cartSchema.virtual('itemsPrice').get(function () {
  return this.items.reduce((sum, i) => sum + i.price * i.qty, 0);
});
cartSchema.virtual('count').get(function () {
  return this.items.reduce((sum, i) => sum + i.qty, 0);
});

module.exports = model('Cart', cartSchema);
