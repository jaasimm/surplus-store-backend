const env = require('../config/env');
const { sendSms } = require('./otp');

let nodemailer = null;
try {
  // optional dependency – the app still works if it's not installed
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null;
}

/** Send an e-mail through the configured SMTP server (no-op if unavailable). */
async function sendEmail({ to, subject, text, html }) {
  const { host, user, pass, port, from } = env.notify.smtp;
  if (!nodemailer || !host || !user) {
    console.log(`[email:skipped] to=${to} subject="${subject}"`);
    return { simulated: true };
  }
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: Number(port) === 465,
    auth: { user, pass },
  });
  return transporter.sendMail({ from, to, subject, text, html });
}

/** Order confirmation via SMS + e-mail after a successful payment / COD order. */
async function sendOrderConfirmation(order, user = {}) {
  const rupees = Math.round(order.totalPrice);
  const sms =
    `Surplus Store: Order ${order.orderNumber} confirmed for ₹${rupees} ` +
    `(${order.items.length} item${order.items.length > 1 ? 's' : ''}). ` +
    `Track it in your account. Thank you!`;

  const results = [];
  try {
    results.push(await sendSms(order.shippingAddress.phone || user.mobile || '', sms));
  } catch (err) {
    console.warn('[notify] sms failed:', err.message);
  }

  if (user.email) {
    try {
      results.push(
        await sendEmail({
          to: user.email,
          subject: `Order ${order.orderNumber} confirmed — Surplus Store`,
          text: sms,
          html: `<h2>Thank you for your order!</h2><p>Order <b>${order.orderNumber}</b> for <b>₹${rupees}</b> has been placed.</p>
                 <p>Status: <b>${order.status.toUpperCase()}</b></p><p>— Team Surplus Store</p>`,
        })
      );
    } catch (err) {
      console.warn('[notify] email failed:', err.message);
    }
  }
  return results;
}

module.exports = { sendEmail, sendOrderConfirmation };
