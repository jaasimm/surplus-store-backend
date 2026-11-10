/**
 * Centralised, validated environment configuration.
 * Nothing else in the app should read process.env directly.
 */
require('dotenv').config();

const bool = (v, dflt = false) =>
  v === undefined || v === '' ? dflt : ['1', 'true', 'yes'].includes(String(v).toLowerCase());

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  port: Number(process.env.PORT || 5000),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  // Public origin of this API (e.g. https://surplus-store-backend.onrender.com).
  // Used to build absolute URLs for locally-stored uploads and by
  // `npm run audit:images`; empty → derived from the request's Host header.
  publicApiUrl: (process.env.PUBLIC_API_URL || '').replace(/\/+$/, ''),

  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/surplus_store',

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev_access_secret_change_me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_change_me',
    accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
    refreshTtl: process.env.REFRESH_TOKEN_TTL || '7d',
  },

  otp: {
    provider: (process.env.OTP_PROVIDER || 'console').toLowerCase(),
    ttlMinutes: Number(process.env.OTP_TTL_MINUTES || 5),
    resendSeconds: Number(process.env.OTP_RESEND_SECONDS || 30),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
    twilio: {
      sid: process.env.TWILIO_ACCOUNT_SID || '',
      token: process.env.TWILIO_AUTH_TOKEN || '',
      from: process.env.TWILIO_FROM_NUMBER || '',
    },
    msg91: {
      key: process.env.MSG91_AUTH_KEY || '',
      sender: process.env.MSG91_SENDER_ID || 'SURPLS',
      template: process.env.MSG91_TEMPLATE_ID || '',
    },
    fast2sms: {
      key: process.env.FAST2SMS_API_KEY || '',
    },
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID || 'surpluses',
  },

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
  },

  notify: {
    provider: (process.env.NOTIFY_PROVIDER || 'console').toLowerCase(),
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT || 587),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.MAIL_FROM || 'Surplus Store <no-reply@surplusstore.in>',
    },
  },

  upload: {
    driver: (process.env.UPLOAD_DRIVER || 'local').toLowerCase(),
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
      apiKey: process.env.CLOUDINARY_API_KEY || '',
      apiSecret: process.env.CLOUDINARY_API_SECRET || '',
    },
  },

  commerce: {
    currency: process.env.CURRENCY || 'INR',
    freeShippingAbove: Number(process.env.FREE_SHIPPING_ABOVE || 999),
    shippingFee: Number(process.env.SHIPPING_FEE || 79),
    codFee: Number(process.env.COD_FEE || 0),
  },

  seed: {
    adminMobile: process.env.ADMIN_MOBILE || '+919999999999',
    adminName: process.env.ADMIN_NAME || 'Store Admin',
  },
};

// Fail fast on obviously unsafe production configuration.
if (env.isProd) {
  // The previous list missed `change_me_refresh_secret` (the value shipped in
  // .env.example), so a project that had only rotated the access secret would
  // pass the check with a publicly-known refresh secret. Also reject anything
  // shorter than 32 chars regardless of what it is.
  const PLACEHOLDER_SECRETS = [
    'change_me_access_secret',
    'change_me_refresh_secret',
    'dev_access_secret_change_me',
    'dev_refresh_secret_change_me',
  ];
  const isWeakSecret = (secret) =>
    !secret || PLACEHOLDER_SECRETS.includes(secret) || secret.length < 32;
  if (isWeakSecret(env.jwt.accessSecret) || isWeakSecret(env.jwt.refreshSecret)) {
    throw new Error(
      'FATAL: JWT_ACCESS_SECRET / JWT_REFRESH_SECRET must be unique random strings of at ' +
        'least 32 characters in production. Generate one with: openssl rand -base64 48'
    );
  }
  if (env.otp.provider === 'console') {
    console.warn('[env] WARNING: OTP_PROVIDER=console in production — OTPs are NOT sent by SMS.');
  }
  if (env.upload.driver === 'local') {
    console.warn(
      "[env] WARNING: UPLOAD_DRIVER=local in production — images are written to this server's disk and are " +
        'DELETED on every redeploy/restart (Render, Heroku, …). Set UPLOAD_DRIVER=cloudinary.'
    );
  }
  if (env.upload.driver !== 'cloudinary' && env.upload.cloudinary.cloudName) {
    console.warn('[env] NOTE: Cloudinary credentials are set but UPLOAD_DRIVER is not "cloudinary".');
  }
}

module.exports = env;
