import { rateLimit } from 'express-rate-limit';

const DEFAULT_ASSISTANT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_ASSISTANT_LIMIT = 100;

// This function reads a positive integer from the environment or uses its default.
const getPositiveInteger = (environment, name, defaultValue) => {
  const value = environment[name];

  if (value === undefined) {
    return defaultValue;
  }

  const parsedValue = Number(value);

  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsedValue;
};

// This function creates the rate limiter for expensive assistant inference requests.
export const createAssistantRateLimiter = ({ environment = process.env } = {}) =>
  rateLimit({
    windowMs: getPositiveInteger(
      environment,
      'ASSISTANT_RATE_LIMIT_WINDOW_MS',
      DEFAULT_ASSISTANT_WINDOW_MS
    ),
    limit: getPositiveInteger(
      environment,
      'ASSISTANT_RATE_LIMIT_MAX',
      DEFAULT_ASSISTANT_LIMIT
    ),
    identifier: 'assistant',
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) =>
      res.status(429).json({
        message: 'Too many requests. Please try again later.'
      })
  });

