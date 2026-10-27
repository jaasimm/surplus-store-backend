const { Schema, model, Types } = require('mongoose');

/* ------------------------------------------------------------------ Address */
const addressSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    pincode: { type: String, required: true, trim: true, maxlength: 10 },
    line1: { type: String, required: true, trim: true, maxlength: 160 },
    line2: { type: String, trim: true, maxlength: 160, default: '' },
    city: { type: String, required: true, trim: true, maxlength: 60 },
    state: { type: String, required: true, trim: true, maxlength: 60 },
    isDefault: { type: Boolean, default: false },
  },
  { _id: true }
);

/* -------------------------------------------------------------------- User */
const userSchema = new Schema(
  {
    mobile: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      // 8-15 digits, optional leading + / country code
      match: [/^\+?[0-9]{8,15}$/, 'Invalid mobile number'],
    },
    name: { type: String, trim: true, maxlength: 60, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '', match: [/^\S+@\S+\.\S+$/, 'Invalid email'] },
    role: { type: String, enum: ['user', 'admin'], default: 'user', index: true },
    addresses: [addressSchema],
    wishlist: [{ type: Types.ObjectId, ref: 'Product' }],
    lastLoginAt: { type: Date },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.methods.defaultAddress = function () {
  return this.addresses.find((a) => a.isDefault) || this.addresses[0] || null;
};

module.exports = model('User', userSchema);
