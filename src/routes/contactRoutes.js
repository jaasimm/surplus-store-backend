const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { validate } = require('../middleware/validate');
const schemas = require('../validators/schemas');
const { createMessage, health } = require('../controllers/contactController');

const router = Router();

router.get('/health', health);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many messages. Please try again later.' },
});

router.post('/', limiter, validate(schemas.contactInput), createMessage);

module.exports = router;
