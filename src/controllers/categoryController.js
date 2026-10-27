const Category = require('../models/Category');
const { asyncHandler, ApiError } = require('../utils/api');
const { slugify } = require('../utils/helpers');

const serialize = (c) => ({
  id: String(c._id),
  name: c.name,
  slug: c.slug,
  image: c.image,
  description: c.description,
  group: c.group,
  isActive: c.isActive,
  sort: c.sort,
});

/* ------------------------------------------------------- GET /api/categories */
const listCategories = asyncHandler(async (_req, res) => {
  const categories = await Category.find({ isActive: true }).sort({ sort: 1, name: 1 }).lean();
  res.json({ success: true, data: categories.map(serialize) });
});

/* -------------------------------------------------------- POST /api/categories */
const createCategory = asyncHandler(async (req, res) => {
  const body = { ...req.body, slug: slugify(req.body.name) };
  const category = await Category.create(body);
  res.status(201).json({ success: true, data: serialize(category) });
});

/* --------------------------------------------------------- PUT /api/categories/:id */
const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findByIdAndUpdate(
    req.params.id,
    { ...req.body, ...(req.body.name ? { slug: slugify(req.body.name) } : {}) },
    { new: true, runValidators: true }
  );
  if (!category) throw ApiError.notFound('Category not found');
  res.json({ success: true, data: serialize(category) });
});

/* ------------------------------------------------------ DELETE /api/categories/:id */
const deleteCategory = asyncHandler(async (req, res) => {
  const deleted = await Category.findByIdAndDelete(req.params.id);
  if (!deleted) throw ApiError.notFound('Category not found');
  res.json({ success: true, message: `Category "${deleted.name}" deleted` });
});

module.exports = { listCategories, createCategory, updateCategory, deleteCategory, serialize };
