const crypto = require('crypto');
const env = require('../config/env');

const BASE = 'https://api.razorpay.com/v1';

/**
 * Signature used by the offline/test checkout (no Razorpay keys configured).
 * The server only accepts this exact value for mock orders.
 */
const MOCK_SIGNATURE = 'mock_signature_verified_server_side';

const authHeader = () =>
  'Basic ' + Buffer.from(`${env.razorpay.keyId}:${env.razorpay.keySecret}`).toString('base64');

/** True when real Razorpay keys are configured (otherwise a mock checkout is used). */
const isConfigured = () => Boolean(env.razorpay.keyId && env.razorpay.keySecret);

/**
 * Create a Razorpay order. Amount is in paise (₹1 = 100 paise).
 * Returns { id, amount, currency, status }.
 */
async function createRazorpayOrder({ amountPaise, receipt, notes = {} }) {
  if (!isConfigured()) {
    // Test/mock mode: mimic the Razorpay order payload so the whole flow works offline.
    return {
      id: `order_mock_${crypto.randomBytes(8).toString('hex')}`,
      entity: 'order',
      amount: amountPaise,
      currency: env.commerce.currency,
      receipt,
      status: 'created',
      created_at: Math.floor(Date.now() / 1000),
      notes,
      mock: true,
    };
  }

  const res = await fetch(`${BASE}/orders`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: amountPaise,
      currency: env.commerce.currency,
      receipt,
      notes,
    }),
  });
  if (!res.ok) throw new Error(`Razorpay order failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/**
 * Verify the Razorpay checkout signature on the SERVER.
 * signature = HMAC_SHA256(order_id + '|' + payment_id, key_secret)
 */
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!env.razorpay.keySecret) return false;
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}

/** Fetch payment details from Razorpay (extra safety net before marking paid). */
async function fetchPayment(paymentId) {
  const res = await fetch(`${BASE}/payments/${paymentId}`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) return null;
  return res.json();
}

module.exports = { isConfigured, createRazorpayOrder, verifyPaymentSignature, fetchPayment, MOCK_SIGNATURE };
