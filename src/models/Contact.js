const { Schema, model } = require('mongoose');

const contactSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true, default: '' },
    mobile: { type: String, trim: true, default: '' },
    subject: { type: String, trim: true, maxlength: 120, default: 'General' },
    message: { type: String, required: true, maxlength: 2000 },
    resolved: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = model('Contact', contactSchema);
