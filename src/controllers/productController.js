const Product = require('../models/Product');
const Category = require('../models/Category');
const Order = require('../models/Order');
const { asyncHandler, ApiError } = require('../utils/api');

/* ------------------------------------------------------------ serialisation */
const serialize = (p) => ({
  id: String(p._id),
  title: p.title,
  slug: p.slug,
  brand: p.brand,
  description: p.description,
  gender: p.gender,
  category: p.category?._id
    ? { id: String(p.category._id), name: p.category.name, slug: p.category.slug }
    : p.category
      ? { id: String(p.category), name: '', slug: '' }
      : null,
  images: p.images || [],
  sizes: p.sizes || [],
  colors: p.colors || [],
  price: p.price,
  mrp: p.mrp,
  discountPercent: p.discountPercent ?? 0,
  totalStock: p.totalStock ?? 0,
  inStock: (p.totalStock ?? 0) > 0,
  rating: p.rating || 0,
  numReviews: p.numReviews || 0,
  soldCount: p.soldCount || 0,
  isFeatured: Boolean(p.isFeatured),
  tags: p.tags || [],
  reviews: p.reviews || [],
  createdAt: p.createdAt,
});

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const asArray = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/* --------------------------------------------------- GET /api/products */
const listProducts = asyncHandler(async (req, res) => {
  const q = req.query;

  /* ---- filters ---- */
  const match = { isActive: true };

  if (q.search) {
    // Case-insensitive partial match on title/brand/tags (regex is escaped → no ReDoS / injection)
    const rx = new RegExp(escapeRegex(q.search), 'i');
    match.$or = [{ title: rx }, { brand: rx }, { tags: rx }];
  }

  const categorySlugs = asArray(q.category).filter(Boolean);
  if (categorySlugs.length) {
    const cats = await Category.find({ slug: { $in: categorySlugs } }).select('_id').lean();
    if (!cats.length) {
      return res.json({ success: true, data: { items: [], pagination: { page: 1, limit: q.limit, total: 0, pages: 0 } } });
    }
    // NOTE: `category` is $unwind-ed into a subdocument above, so filter on its _id.
    match['category._id'] = { $in: cats.map((c) => c._id) };
  }

  const sizes = asArray(q.size).filter(Boolean);
  if (sizes.length) match.sizes = { $elemMatch: { size: { $in: sizes.map((s) => s.toUpperCase()) } } };

  const colors = asArray(q.color).filter(Boolean);
  if (colors.length) match.colors = { $in: colors };

  const gender = asArray(q.gender).filter(Boolean);
  if (gender.length) match.gender = { $in: gender };

  if (q.featured === true || q.featured === 'true') match.isFeatured = true;

  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    match.price = {};
    if (q.minPrice !== undefined) match.price.$gte = Number(q.minPrice);
    if (q.maxPrice !== undefined) match.price.$lte = Number(q.maxPrice);
  }

  /* ---- sorting ---- */
  const sorts = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    price_asc: { price: 1 },
    price_desc: { price: -1 },
    popularity: { soldCount: -1, rating: -1, createdAt: -1 },
    discount: { discountPercent: -1, price: 1 },
  };
  const sortSpec = sorts[q.sort] || sorts.newest;

  const page = Number(q.page) || 1;
  const limit = Number(q.limit) || 12;

  const pipeline = [
    { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'category' } },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        totalStock: { $sum: '$sizes.stock' },
        discountPercent: {
          $cond: [
            { $gt: ['$mrp', '$price'] },
            { $round: [{ $multiply: [100, { $divide: [{ $subtract: ['$mrp', '$price'] }, { $ifNull: ['$mrp', 1] }] }] }, 0] },
            0,
          ],
        },
      },
    },
    { $match: match },
    { $sort: sortSpec },
    { $facet: { meta: [{ $count: 'total' }], items: [{ $skip: (page - 1) * limit }, { $limit: limit }] } },
  ];

  const [result] = await Product.aggregate(pipeline);
  const total = result.meta[0]?.total || 0;

  res.json({
    success: true,
    data: {
      items: result.items.map(serialize),
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
});

/* ------------------------------------------- GET /api/products/:slug */
const getProduct = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug, isActive: true }).populate('category', 'name slug');
  if (!product) throw ApiError.notFound('Product not found');
  res.json({ success: true, data: serialize(product.toObject({ virtuals: true })) });
});

/* ----------------------------------- GET /api/products/:slug/related */
const relatedProducts = asyncHandler(async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug }).select('category tags');
  if (!product) throw ApiError.notFound('Product not found');

  const items = await Product.find({
    _id: { $ne: product._id },
    isActive: true,
    $or: [{ category: product.category }, { tags: { $in: product.tags || [] } }],
  })
    .sort({ soldCount: -1, createdAt: -1 })
    .limit(6)
    .populate('category', 'name slug');

  res.json({ success: true, data: items.map((p) => serialize(p.toObject({ virtuals: true }))) });
});

/* ---------------------------------------- POST /api/products/:id/reviews */
const addReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');

  // Only allow reviews from customers who actually bought the product.
  const bought = await Order.exists({
    user: req.user._id,
    'items.product': product._id,
    status: { $in: ['placed', 'packed', 'shipped', 'delivered'] },
  });
  if (!bought) throw ApiError.forbidden('You can review only products you have purchased');

  const already = product.reviews.find((r) => String(r.user) === String(req.user._id));
  if (already) {
    already.rating = rating;
    already.comment = comment;
  } else {
    product.reviews.push({ user: req.user._id, name: req.user.name || 'Customer', rating, comment });
  }

  product.numReviews = product.reviews.length;
  product.rating = Number((product.reviews.reduce((s, r) => s + r.rating, 0) / product.numReviews).toFixed(1));
  await product.save();

  res.status(201).json({ success: true, message: 'Thanks for your review!', data: serialize(product) });
});

module.exports = { listProducts, getProduct, relatedProducts, addReview, serialize };
