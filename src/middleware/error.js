const { ApiError } = require('../utils/api');

/** 404 for unknown API routes. */
function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Central error handler – converts known errors into clean JSON,
 * hides stack traces in production and logs unexpected ones.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';

  // Mongoose validation → 400
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  }

  // Bad ObjectId → 404
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    statusCode = 404;
    message = 'Invalid resource id';
  }

  // Duplicate key (e.g. mobile already registered)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `That ${field} is already in use`;
  }

  // JWT
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid session token';
  }

  // Multer
  if (err.name === 'MulterError') {
    statusCode = 400;
    message = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be smaller than 5 MB' : err.message;
  }

  if (statusCode >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl} →`, err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== 'production' && err.stack ? { stack: err.stack.split('\n')[1] } : {}),
  });
}

module.exports = { notFound, errorHandler };
