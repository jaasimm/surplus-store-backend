const { Schema, model } = require('mongoose');

const categorySchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 60 },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    image: { type: String, default: '' },
    description: { type: String, maxlength: 300, default: '' },
    // Optional grouping used by the home page (Men / Women / Kids)
    group: { type: String, enum: ['men', 'women', 'kids', 'accessories', 'other'], default: 'other' },
    isActive: { type: Boolean, default: true },
    sort: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = model('Category', categorySchema);
