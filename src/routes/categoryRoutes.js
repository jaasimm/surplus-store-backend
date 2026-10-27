const { Router } = require('express');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');
const { adminOnly } = require('../middleware/auth');
const { listCategories, createCategory, updateCategory, deleteCategory } = require('../controllers/categoryController');

const router = Router();

router.get('/', listCategories);
router.post('/', adminOnly, validate(schemas.categoryInput), createCategory);
router.put('/:id', adminOnly, validate(schemas.categoryInput.partial()), updateCategory);
router.delete('/:id', adminOnly, deleteCategory);

module.exports = router;
