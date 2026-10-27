const { Router } = require('express');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');
const { requireAuth } = require('../middleware/auth');
const { listProducts, getProduct, relatedProducts, addReview } = require('../controllers/productController');

const router = Router();

router.get('/', validate(schemas.productQuery, 'query'), listProducts);
router.get('/:slug', getProduct);
router.get('/:slug/related', relatedProducts);
router.post('/:id/reviews', requireAuth, validate(schemas.reviewInput), addReview);

module.exports = router;
