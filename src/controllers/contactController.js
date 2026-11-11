const Contact = require('../models/Contact');
const { asyncHandler } = require('../utils/api');

/*
 * E-mail delivery for contact messages is handled in the browser
 * (client/src/pages/Contact.jsx → Web3Forms). The free Web3Forms plan only
 * accepts client-side submissions — server-to-server calls return 403 — so
 * the API's only job here is to persist the message for admin → Messages.
 */

/* ------------------------------------------------------- POST /api/contact */
const createMessage = asyncHandler(async (req, res) => {
  await Contact.create(req.body);
  res.status(201).json({
    success: true,
    message: 'Thanks for reaching out! We usually reply within 24 hours.',
  });
});

/* --------------------------------------------------------- GET /api/contact */
const health = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: { status: 'ok', service: 'surplus-store-api', time: new Date().toISOString() } });
});

module.exports = { createMessage, health };
