const { Router } = require('express');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');
const { requireAuth, optionalAuth, attachGuestId } = require('../middleware/auth');
const { getMyCart, addToCart, updateCartItem, removeCartItem, clearCart } = require('../controllers/cartController');

const router = Router();

// Guests can use the cart too (guestId comes from the client); logging in merges it.
router.use(attachGuestId);
router.get('/', optionalAuth, getMyCart);
router.post('/add', optionalAuth, validate(schemas.cartItemInput), addToCart);
router.put('/update', optionalAuth, validate(schemas.cartUpdateInput), updateCartItem);
router.post('/remove', optionalAuth, validate(schemas.cartRemoveInput), removeCartItem);
router.post('/clear', requireAuth, clearCart);

module.exports = router;
