const { Schema, model, Types } = require('mongoose');

const itemSchema = new Schema(
  {
    product: { type: Types.ObjectId, ref: 'Product', required: true },
    title: { type: String, required: true },
    image: { type: String, default: '' },
    size: { type: String, default: '' },
    color: { type: String, default: '' },
    price: { type: Number, required: true }, // price actually charged
    mrp: { type: Number, default: 0 },
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const statusEventSchema = new Schema(
  {
    status: { type: String, required: true },
    note: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ORDER_STATUSES = ['placed', 'packed', 'shipped', 'delivered', 'cancelled'];

const orderSchema = new Schema(
  {
    orderNumber: { type: String, unique: true, index: true },
    user: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [itemSchema], required: true },

    shippingAddress: {
      name: String,
      phone: String,
      pincode: String,
      line1: String,
      line2: String,
      city: String,
      state: String,
    },

    payment: {
      method: { type: String, enum: ['razorpay', 'cod'], required: true },
      status: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded', 'cod_pending'],
        default: 'pending',
        index: true,
      },
      razorpayOrderId: { type: String, default: '' },
      razorpayPaymentId: { type: String, default: '' },
      signature: { type: String, default: '' },
      paidAt: { type: Date },
    },

    itemsPrice: { type: Number, required: true },
    shippingPrice: { type: Number, required: true, default: 0 },
    codFee: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    couponCode: { type: String, default: '' },
    totalPrice: { type: Number, required: true },

    status: { type: String, enum: ORDER_STATUSES, default: 'placed', index: true },
    statusHistory: [statusEventSchema],

    cancelReason: { type: String, default: '' },
    returnRequest: {
      requested: { type: Boolean, default: false },
      reason: { type: String, default: '' },
      status: { type: String, enum: ['none', 'requested', 'approved', 'rejected', 'received'], default: 'none' },
      requestedAt: { type: Date },
    },

    deliveredAt: { type: Date },
  },
  { timestamps: true }
);

// Human friendly id, e.g. SS-20261027-8F3K2Q
orderSchema.pre('validate', function (next) {
  if (!this.orderNumber) {
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    this.orderNumber = `SS-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${rand}`;
  }
  next();
});

module.exports = model('Order', orderSchema);
module.exports.ORDER_STATUSES = ORDER_STATUSES;
