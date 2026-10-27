const { Schema, model } = require('mongoose');

const couponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, maxlength: 200, default: '' },
    type: { type: String, enum: ['percent', 'flat'], required: true },
    value: { type: Number, required: true, min: 0 }, // percent (0-100) or ₹ amount
    minOrder: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: 0 }, // cap for percent coupons (0 = no cap)
    active: { type: Boolean, default: true, index: true },
    startsAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    usageLimit: { type: Number, default: 0 }, // 0 = unlimited
    usedCount: { type: Number, default: 0 },
    perUserLimit: { type: Number, default: 1 },
  },
  { timestamps: true }
);

couponSchema.methods.computeDiscount = function (subtotal) {
  if (!this.active) return 0;
  if (subtotal < this.minOrder) return 0;
  let d = this.type === 'percent' ? (subtotal * this.value) / 100 : this.value;
  if (this.type === 'percent' && this.maxDiscount > 0) d = Math.min(d, this.maxDiscount);
  return Math.min(Math.round(d), subtotal);
};

module.exports = model('Coupon', couponSchema);
