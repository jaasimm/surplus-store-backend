const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');

/* ------------------------------------------------------------- configuration */
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  if (!ALLOWED.includes(file.mimetype)) {
    return cb(new Error('Only JPEG, PNG, WEBP, AVIF or GIF images are allowed'));
  }
  cb(null, true);
};

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_SIZE, files: 6 } });

/* -------------------------------------------------------------- local driver */
// Env-overridable so a mounted persistent disk (Render disk, EBS, …) can be
// pointed at without a code change. NOTE: on Render/Heroku the app disk is
// ephemeral — files here are wiped on every redeploy/restart.
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function saveLocal(buffer, originalName) {
  const ext = (path.extname(originalName || '') || '.jpg').toLowerCase();
  const name = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
  return name; // served statically at /uploads/<name>
}

/* --------------------------------------------------------- cloudinary driver */
const DRIVERS = ['local', 'cloudinary'];
if (!DRIVERS.includes(env.upload.driver)) {
  throw new Error(`UPLOAD_DRIVER must be one of ${DRIVERS.join(' | ')} — got "${env.upload.driver}"`);
}

let cloudinary = null;
if (env.upload.driver === 'cloudinary') {
  // Fail fast instead of silently falling back to the local disk: a missed
  // variable would put images back on an ephemeral filesystem and they would
  // vanish on the next deploy (which is exactly what happened before).
  const missing = Object.entries({
    CLOUDINARY_CLOUD_NAME: env.upload.cloudinary.cloudName,
    CLOUDINARY_API_KEY: env.upload.cloudinary.apiKey,
    CLOUDINARY_API_SECRET: env.upload.cloudinary.apiSecret,
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    throw new Error(
      `UPLOAD_DRIVER=cloudinary but ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not set. ` +
        'Refusing to write to the local disk (files there are deleted on every redeploy).'
    );
  }

  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: env.upload.cloudinary.cloudName,
    api_key: env.upload.cloudinary.apiKey,
    api_secret: env.upload.cloudinary.apiSecret,
  });
}

/**
 * Store one uploaded image and return a full URL.
 * Uses Cloudinary when configured, otherwise writes to server/uploads.
 */
async function storeImage(file, req) {
  if (cloudinary) {
    try {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'surplus-store', transformation: [{ quality: 'auto', fetch_format: 'auto' }] },
          (err, res) => (err ? reject(err) : resolve(res))
        );
        stream.end(file.buffer);
      });
      return result.secure_url;
    } catch (err) {
      // Surface a readable message in the admin panel instead of a bare 500.
      throw new Error(`Image upload failed: ${err.message || err}`);
    }
  }

  const filename = saveLocal(file.buffer, file.originalname);
  // Prefer the configured public origin: the Host header is whatever the
  // client/proxy sent (localhost:5173 behind Vite, an internal name behind a
  // load balancer), which is how dev uploads ended up stored as :5173 URLs.
  const origin = env.publicApiUrl || `${req.protocol}://${req.get('host')}`;
  return `${origin}/uploads/${filename}`;
}

module.exports = { upload, storeImage, UPLOAD_DIR };
