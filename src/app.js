const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');

const env = require('./config/env');
const routes = require('./routes');
const { issueCsrfToken, csrfProtect } = require('./middleware/csrf');
const { notFound, errorHandler } = require('./middleware/error');
const { renderSitemap } = require('./utils/sitemap');
const { UPLOAD_DIR } = require('./middleware/upload');

const app = express();

/* ------------------------------------------------------------- security */
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: false, // the React app is served separately in dev
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow <img> from Cloudinary
  })
);

app.use(
  cors({
    origin: (origin, cb) => {
      // Allow the frontend dev server, plus same-origin/production hosts.
      const allowed = [env.clientUrl, env.clientUrl.replace('localhost', '127.0.0.1')];
      if (!origin || allowed.includes(origin) || env.isProd) return cb(null, true);
      cb(null, false);
    },
    credentials: true, // cookies (JWT + CSRF) must flow
  })
);

/* ------------------------------------------------------------ body parsers */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

/* ------------------------------------------- sanitisation & abuse protection */
app.use(mongoSanitize()); // strips `$` / `.` operators → NoSQL injection safe
app.use(hpp()); // HTTP parameter pollution

app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests. Please slow down.' },
  })
);

/* ------------------------------------------------------ CSRF (double submit) */
app.use(issueCsrfToken);
app.use('/api', csrfProtect);

/* --------------------------------------------------------------- static files */
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', dotfiles: 'ignore' }));

/* -------------------------------------------------------------- SEO endpoints */
app.get('/sitemap.xml', async (_req, res) => {
  try {
    res.type('application/xml').send(await renderSitemap());
  } catch (err) {
    console.error('[sitemap]', err.message);
    res.status(500).send('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
});

app.get('/robots.txt', (_req, res) => {
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /checkout\nDisallow: /account\n\nSitemap: ${env.clientUrl.replace(/\/$/, '')}/sitemap.xml\n`
  );
});

/* ----------------------------------------------------------------- API */
app.use('/api', routes);

/* -------------------------------------------------- serve the built SPA */
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
app.get(/^(?!\/api|\/uploads).*/, (req, res, next) => {
  if (req.method !== 'GET') return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => (err ? next() : undefined));
});

/* ----------------------------------------------------------- errors last */
app.use(notFound);
app.use(errorHandler);

module.exports = app;
