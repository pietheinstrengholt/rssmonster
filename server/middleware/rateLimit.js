import { rateLimit } from 'express-rate-limit';

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_API_LIMIT = 600;
const DEFAULT_MCP_LIMIT = 100;

// This function reads a positive integer from the environment or uses its default.
const getPositiveInteger = (name, defaultValue) => {
  const value = process.env[name];

  if (value === undefined) {
    return defaultValue;
  }

  const parsedValue = Number(value);

  if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsedValue;
};

// This function excludes requests that should remain available without rate limiting.
const skipRateLimit = req => {
  const requestPath = req.originalUrl.split('?')[0];

  return (
    req.method === 'OPTIONS' ||
    requestPath === '/api/health' ||
    requestPath === '/api/health/'
  );
};

// This function creates a rate limiter with RSSMonster's shared response behavior.
export const createRateLimiter = ({ windowMs, limit, identifier }) =>
  rateLimit({
    windowMs,
    limit,
    identifier,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: skipRateLimit,
    handler: (_req, res) =>
      res.status(429).json({
        message: 'Too many requests. Please try again later.'
      })
  });

const apiWindowMs = getPositiveInteger(
  'API_RATE_LIMIT_WINDOW_MS',
  DEFAULT_WINDOW_MS
);
const apiLimit = getPositiveInteger('API_RATE_LIMIT_MAX', DEFAULT_API_LIMIT);
const mcpWindowMs = getPositiveInteger(
  'MCP_RATE_LIMIT_WINDOW_MS',
  DEFAULT_WINDOW_MS
);
const mcpLimit = getPositiveInteger('MCP_RATE_LIMIT_MAX', DEFAULT_MCP_LIMIT);

export const apiRateLimiter = createRateLimiter({
  windowMs: apiWindowMs,
  limit: apiLimit,
  identifier: 'api'
});

export const mcpRateLimiter = createRateLimiter({
  windowMs: mcpWindowMs,
  limit: mcpLimit,
  identifier: 'mcp'
});
