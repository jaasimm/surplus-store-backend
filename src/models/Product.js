const { Schema, model, Types } = require('mongoose');

/** Per-size stock, e.g. { size: 'M', stock: 12 } */
const sizeStockSchema = new Schema(
  {
    size: { type: String, required: true, uppercase: true, trim: true },
    stock: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const reviewSchema = new Schema(
  {
    user: { type: Types.ObjectId, ref: 'User', required: true },
    name: { type: String, default: 'Customer' },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, maxlength: 500, default: '' },
  },
  { timestamps: true }
);

const productSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140, index: 'text' },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    description: { type: String, required: true, maxlength: 4000, index: 'text' },
    brand: { type: String, trim: true, maxlength: 60, default: 'Surplus' },
    category: { type: Types.ObjectId, ref: 'Category', required: true, index: true },
    images: {
      type: [{ url: String, alt: String }],
      validate: (v) => v.length > 0 || 'At least one image is required',
    },
    sizes: {
      type: [sizeStockSchema],
      validate: (v) => v.length > 0 || 'At least one size is required',
    },
    colors: [{ type: String, trim: true }],
    price: { type: Number, required: true, min: 0 }, // selling price (₹)
    mrp: { type: Number, required: true, min: 0 }, // maximum retail price (₹)
    gender: { type: String, enum: ['men', 'women', 'kids', 'unisex'], default: 'unisex', index: true },
    tags: [{ type: String, lowercase: true, trim: true }],
    rating: { type: Number, min: 0, max: 5, default: 0 },
    numReviews: { type: Number, default: 0 },
    soldCount: { type: Number, default: 0 }, // used for "popularity" sort / best sellers
    isFeatured: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    reviews: [reviewSchema],
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

/* ------------------------------- indexes */
productSchema.index({ title: 'text', description: 'text', brand: 'text', tags: 'text' });
productSchema.index({ createdAt: -1 });
productSchema.index({ price: 1 });

/* ----------------------------------------- virtuals */
productSchema.virtual('totalStock').get(function () {
  return (this.sizes || []).reduce((sum, s) => sum + (s.stock || 0), 0);
});

productSchema.virtual('discountPercent').get(function () {
  if (!this.mrp || this.mrp <= this.price) return 0;
  return Math.round(((this.mrp - this.price) / this.mrp) * 100);
});

productSchema.virtual('inStock').get(function () {
  return this.totalStock > 0;
});

module.exports = model('Product', productSchema);
