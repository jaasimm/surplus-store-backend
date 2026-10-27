const { Router } = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');
const { adminOnly } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const admin = require('../controllers/adminController');

const router = Router();

router.use(adminOnly); // every /api/admin route requires an admin session

/* ------------------------------------------------------------- dashboard */
router.get('/stats', admin.stats);

/* -------------------------------------------------------------- products */
router.get('/products', admin.listAllProducts);
router.get('/products/:id', admin.getProduct);
router.post('/products', upload.array('images', 6), validate(schemas.productInput), admin.createProduct);
router.put('/products/:id', upload.array('images', 6), validate(schemas.productPatch), admin.updateProduct);
router.delete('/products/:id', admin.deleteProduct);

/* --------------------------------------------------------------- orders */
router.get('/orders', admin.listOrders);
router.patch('/orders/:id/status', admin.updateOrderStatus);
router.patch('/orders/:id/return', admin.handleReturnRequest);

/* ------------------------------------------------------------ customers */
router.get('/customers', admin.listCustomers);
router.patch('/customers/:id', admin.updateCustomer);

/* -------------------------------------------------------------- coupons */
router.get('/coupons', admin.listCoupons);
router.post('/coupons', validate(schemas.couponInput), admin.createCoupon);
router.put('/coupons/:id', validate(schemas.couponPatch), admin.updateCoupon);
router.delete('/coupons/:id', admin.deleteCoupon);

/* -------------------------------------------------------------- uploads */
router.post('/uploads', upload.array('images', 6), admin.uploadImages);

/* ------------------------------------------------------------- messages */
router.get('/contacts', admin.listContacts);
router.patch('/contacts/:id', admin.resolveContact);

module.exports = router;
