import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

// Global limiter: 200 requests per 15 min per IP
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please slow down.'
    }
  }
});

// Auth routes: 10 per 15 min in production (higher in dev/test for automated scenario runs)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many authentication attempts. Please try again in 15 minutes.'
    }
  }
});

// POST /api/requests/preview: 60 per minute per user/IP (supports debounced typing)
export const previewRequestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.user?.id || req.ip || 'anonymous',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Preview rate limit reached. Please wait a moment.'
    }
  }
});

export const createRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 10 : 100,
  keyGenerator: (req) => req.user?.id || req.ip || 'anonymous',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Hourly request submission limit reached (10/hour). Please try again later.'
    }
  }
});
