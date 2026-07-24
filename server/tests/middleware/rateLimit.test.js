import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createRateLimiter } from '../../middleware/rateLimit.js';

// This function creates a small Express app with the production limiter structure.
const createTestApp = ({ apiLimit = 2, mcpLimit = 1 } = {}) => {
  const app = express();
  const apiLimiter = createRateLimiter({
    windowMs: 60_000,
    limit: apiLimit,
    identifier: 'api-test'
  });
  const mcpLimiter = createRateLimiter({
    windowMs: 60_000,
    limit: mcpLimit,
    identifier: 'mcp-test'
  });

  app.use(['/api', '/mcp', '/rss'], apiLimiter);
  app.use('/mcp', mcpLimiter);
  app.get('/api/data', (_req, res) => res.json({ ok: true }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.get('/rss', (_req, res) => res.send('ok'));
  app.get('/mcp', (_req, res) => res.json({ ok: true }));

  return app;
};

describe('rate limiting middleware', () => {
  it('limits API requests and returns standard headers', async () => {
    const app = createTestApp();

    await request(app).get('/api/data').expect(200);
    const allowedResponse = await request(app).get('/api/data').expect(200);
    const limitedResponse = await request(app).get('/api/data').expect(429);

    expect(allowedResponse.headers).toHaveProperty('ratelimit');
    expect(allowedResponse.headers).toHaveProperty('ratelimit-policy');
    expect(limitedResponse.headers).toHaveProperty('retry-after');
    expect(limitedResponse.body).toEqual({
      message: 'Too many requests. Please try again later.'
    });
  });

  it('applies the stricter MCP limit in addition to the API limit', async () => {
    const app = createTestApp({ apiLimit: 5, mcpLimit: 1 });

    await request(app).get('/mcp').expect(200);
    await request(app).get('/mcp').expect(429);
  });

  it('does not limit health checks', async () => {
    const app = createTestApp({ apiLimit: 1 });

    await request(app).get('/api/health').expect(200);
    await request(app).get('/api/health').expect(200);
    await request(app).get('/api/health/').expect(200);
  });

  it('does not count OPTIONS requests against the limit', async () => {
    const app = createTestApp({ apiLimit: 1 });

    await request(app).options('/api/data').expect(200);
    await request(app).options('/api/data').expect(200);
    await request(app).get('/api/data').expect(200);
    await request(app).get('/api/data').expect(429);
  });

  it('limits RSS requests with the API policy', async () => {
    const app = createTestApp({ apiLimit: 1 });

    await request(app).get('/rss').expect(200);
    await request(app).get('/rss').expect(429);
  });
});
