import { logger } from '../utils/logger.js';

/**
 * Global error handler middleware.
 * @param {Error} err
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} _next
 */
export function errorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';

  // Log error details (safely redacted by pino)
  if (statusCode >= 500) {
    logger.error({
      err: {
        message: err.message,
        stack: err.stack,
        code,
      },
      path: req.path,
      method: req.method,
    }, 'Server error');
  } else {
    logger.warn({
      err: { message: err.message, code },
      path: req.path,
      method: req.method,
    }, 'Client error');
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: statusCode >= 500 && process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
    },
  });
}

/**
 * 404 handler for unmatched routes.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}
