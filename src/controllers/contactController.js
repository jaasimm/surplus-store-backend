const Contact = require('../models/Contact');
const env = require('../config/env');
const { asyncHandler } = require('../utils/api');

const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';

/**
 * Forward a contact message to the store owner's inbox via Web3Forms.
 *
 * The message is already persisted in MongoDB before this runs, so a failure
 * here is reported by the caller and swallowed — the visitor must never see an
 * error because a notification e-mail did not go out.
 *
 * Note: `subject`, `access_key`, `replyto`, `from_name`, `redirect` and
 * `botcheck` are reserved names for Web3Forms, so the visitor's chosen topic is
 * folded into the notification subject instead of being sent as a field.
 */
async function forwardToWeb3Forms(message) {
  const key = env.notify.web3forms.key;
  if (!key) return { skipped: 'WEB3FORMS_ACCESS_KEY not set' };

  const payload = {
    access_key: key,
    subject: `[${message.subject}] ${message.name} — surplusstore.in`,
    from_name: message.name,
    name: message.name,
    mobile: message.mobile,
    message: message.message,
  };
  if (message.email) {
    payload.email = message.email;
    payload.replyto = message.email; // so "Reply" goes back to the visitor
  }

  const res = await fetch(WEB3FORMS_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || `Web3Forms responded ${res.status}`);
  }
  return data;
}

/* ------------------------------------------------------- POST /api/contact */
const createMessage = asyncHandler(async (req, res) => {
  const saved = await Contact.create(req.body);

  try {
    const result = await forwardToWeb3Forms(req.body);
    if (result.skipped) {
      console.warn(`[contact:email] skipped (${result.skipped}) — message ${saved._id} saved only`);
    } else {
      console.log(`[contact:email] forwarded message ${saved._id}`);
    }
  } catch (err) {
    // Already saved — keep the 201 so the visitor's submission still succeeds.
    console.warn(`[contact:email] forwarding failed for ${saved._id}: ${err.message}`);
  }

  res.status(201).json({
    success: true,
    message: 'Thanks for reaching out! We usually reply within 24 hours.',
  });
});

/* --------------------------------------------------------- GET /api/contact */
const health = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: { status: 'ok', service: 'surplus-store-api', time: new Date().toISOString() } });
});

module.exports = { createMessage, health, forwardToWeb3Forms };
