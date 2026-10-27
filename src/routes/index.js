const { Router } = require('express');

const authRoutes = require('./authRoutes');
const productRoutes = require('./productRoutes');
const categoryRoutes = require('./categoryRoutes');
const cartRoutes = require('./cartRoutes');
const orderRoutes = require('./orderRoutes');
const couponRoutes = require('./couponRoutes');
const userRoutes = require('./userRoutes');
const contactRoutes = require('./contactRoutes');
const adminRoutes = require('./adminRoutes');

const router = Router();

router.get('/', (_req, res) =>
  res.json({
    success: true,
    data: {
      name: 'Surplus Store API',
      version: '1.0.0',
      docs: 'https://github.com/your-org/surplus-store#api-overview',
    },
  })
);

router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/coupons', couponRoutes);
router.use('/users', userRoutes);
router.use('/contact', contactRoutes);
router.use('/admin', adminRoutes);

module.exports = router;
