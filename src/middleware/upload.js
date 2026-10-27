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
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function saveLocal(buffer, originalName) {
  const ext = (path.extname(originalName || '') || '.jpg').toLowerCase();
  const name = `${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
  return name; // served statically at /uploads/<name>
}

/* --------------------------------------------------------- cloudinary driver */
let cloudinary = null;
if (env.upload.driver === 'cloudinary') {
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
  if (env.upload.driver === 'cloudinary' && cloudinary) {
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'surplus-store', transformation: [{ quality: 'auto', fetch_format: 'auto' }] },
        (err, res) => (err ? reject(err) : resolve(res))
      );
      stream.end(file.buffer);
    });
    return result.secure_url;
  }

  const filename = saveLocal(file.buffer, file.originalname);
  const origin = `${req.protocol}://${req.get('host')}`;
  return `${origin}/uploads/${filename}`;
}

module.exports = { upload, storeImage, UPLOAD_DIR };
