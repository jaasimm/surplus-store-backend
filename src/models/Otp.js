const { Schema, model } = require('mongoose');

/**
 * One document per (mobile, code) request.
 * A TTL index deletes expired documents automatically.
 */
const otpSchema = new Schema(
  {
    mobile: { type: String, required: true, index: true },
    codeHash: { type: String, required: true },
    purpose: { type: String, enum: ['login', 'verify'], default: 'login' },
    expiresAt: { type: Date, required: true }, // indexed via the TTL index below
    attempts: { type: Number, default: 0, max: 20 },
    consumed: { type: Boolean, default: false },
    ip: { type: String, default: '' },
  },
  { timestamps: true }
);

// Drop OTP docs 60s after they expire.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 });

module.exports = model('Otp', otpSchema);
