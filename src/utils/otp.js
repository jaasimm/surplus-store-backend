const crypto = require('crypto');
const env = require('../config/env');

const hash = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');
const generateCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

/* ---------------------------------------------------------------- SMS senders */

async function sendViaTwilio(to, body) {
  const { sid, token, from } = env.otp.twilio;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sendViaMsg91(to, body) {
  const { key, sender, template } = env.otp.msg91;
  const res = await fetch('https://control.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: { authkey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_id: template,
      sender: sender,
      short_url: '0',
      recipients: [
        {
          mobiles: to.replace(/^\+/, ''),
          OTP: body,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`MSG91 error ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Dispatch an SMS through the configured provider.
 * `console` provider prints to the server log (development only).
 */
async function sendSms(mobile, text) {
  const provider = env.otp.provider;

  if (provider === 'twilio' && env.otp.twilio.sid) return sendViaTwilio(mobile, text);
  if (provider === 'msg91' && env.otp.msg91.key) return sendViaMsg91(mobile, text);

  // console / firebase fallback
  console.log(`\n[OTP] → ${mobile} : ${text}\n`);
  return { simulated: true };
}

module.exports = { hash, generateCode, sendSms };
