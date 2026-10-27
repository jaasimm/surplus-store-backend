const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');
const { requireAuth } = require('../middleware/auth');
const {
  createOrder,
  verifyPayment,
  paymentFailed,
  retryPayment,
  myOrders,
  getOrder,
  cancelOrder,
  requestReturn,
} = require('../controllers/orderController');

const router = Router();

// Tight limit on payment verification (forged-signature brute force protection).
const verifyLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many verification attempts. Please try again later.' },
});

router.use(requireAuth); // orders are account-scoped

router.get('/mine', myOrders);
router.post('/', validate(schemas.orderInput), createOrder);
router.post('/verify-payment', verifyLimiter, validate(schemas.paymentVerify), verifyPayment);
router.post('/:id/payment-failed', paymentFailed);
router.post('/:id/retry-payment', retryPayment);
router.get('/:id', getOrder);
router.post('/:id/cancel', validate(schemas.cancelOrder), cancelOrder);
router.post('/:id/return', validate(schemas.returnOrder), requestReturn);

module.exports = router;
