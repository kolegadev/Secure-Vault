import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

/**
 * General API rate limiter.
 */
export const apiRateLimiter = rateLimit({
  windowMs: config.rateLimit?.windowMs || 60_000,
  max: config.rateLimit?.maxRequests || 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, _next, options) => {
    logger.warn({ ip: req.ip, path: req.path }, 'Rate limit exceeded');
    res.status(options.statusCode).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Limit: ${options.max} per ${options.windowMs / 1000}s`,
      },
    });
  },
});

/**
 * Stricter rate limiter for auth endpoints.
 */
export const authRateLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS, 10) || 60_000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX, 10) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (req, res, _next, options) => {
    logger.warn({ ip: req.ip }, 'Auth rate limit exceeded');
    res.status(options.statusCode).json({
      success: false,
      error: {
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        message: 'Too many login attempts. Please try again later.',
      },
    });
  },
});
