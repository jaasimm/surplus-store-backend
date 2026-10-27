const { Router } = require('express');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');
const { requireAuth } = require('../middleware/auth');
const {
  getProfile,
  updateProfile,
  listAddresses,
  addAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
  getWishlist,
  toggleWishlist,
} = require('../controllers/userController');

const router = Router();

router.use(requireAuth); // account area is private

router.get('/profile', getProfile);
router.put('/profile', validate(schemas.profileInput), updateProfile);

router.get('/addresses', listAddresses);
router.post('/addresses', validate(schemas.addressCreate), addAddress);
router.put('/addresses/:id', validate(schemas.addressCreate.partial()), updateAddress);
router.delete('/addresses/:id', deleteAddress);
router.post('/addresses/:id/default', setDefaultAddress);

router.get('/wishlist', getWishlist);
router.post('/wishlist', validate(schemas.wishlistToggle), toggleWishlist);

module.exports = router;
