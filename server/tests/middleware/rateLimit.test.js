import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import {
  createApiRateLimiter,
  createPasswordResetRateLimiter,
  createRateLimiter
} from '../../middleware/rateLimit.js';

// This function creates a small Express app with the production limiter structure.
const createTestApp = ({ apiLimit = 2, mcpLimit = 1, articleInteractionLimit = 4 } = {}) => {
  const app = express();
  app.set('trust proxy', 'loopback');
  const apiLimiter = createApiRateLimiter({
    windowMs: 60_000,
    limit: apiLimit,
    articleInteractionLimit
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

  app.use('/api/articles', (_req, res) => res.json({ ok: true }));

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

  it('gives scrolling and read updates a separate, bounded allowance', async () => {
    const app = createTestApp({ apiLimit: 1 });

    await request(app).get('/api/data').expect(200);
    await request(app).get('/api/data').expect(429);
    await request(app).get('/api/articles?cursor=next').expect(200);
    await request(app).post('/api/articles/details').expect(200);
    await request(app).post('/api/articles/markasread').expect(200);
    await request(app).post('/api/articles/markasseen/123').expect(200);
    const limited = await request(app).post('/api/articles/marktounread/123').expect(429);
    expect(limited.headers).toHaveProperty('retry-after');
  });

  it('does not spend the general allowance on reading interactions', async () => {
    const app = createTestApp({ apiLimit: 1, articleInteractionLimit: 1 });

    await request(app).post('/api/articles/markallasread/').expect(200);
    await request(app).get('/api/articles/').expect(429);
    await request(app).get('/api/data').expect(200);
  });

  it.each([
    ['get', '/api/articles/briefing'],
    ['get', '/api/articles/123/recommendations'],
    ['post', '/api/articles/markmorelikethis/123'],
    ['post', '/api/articles'],
    ['get', '/api/articles/details'],
    ['post', '/api/articles/markasseen/123/extra']
  ])('keeps %s %s under the general allowance', async (method, path) => {
    const app = createTestApp({ apiLimit: 1 });

    await request(app)[method](path).expect(200);
    await request(app)[method](path).expect(429);
    await request(app).get('/api/articles').expect(200);
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

  it('applies limits separately to clients forwarded by a trusted proxy', async () => {
    const app = createTestApp({ apiLimit: 1 });

    await request(app)
      .get('/api/data')
      .set('X-Forwarded-For', '192.0.2.1')
      .expect(200);
    await request(app)
      .get('/api/data')
      .set('X-Forwarded-For', '192.0.2.1')
      .expect(429);
    await request(app)
      .get('/api/data')
      .set('X-Forwarded-For', '192.0.2.2')
      .expect(200);
  });

  it('applies a separate strict IP limit to password-reset requests', async () => {
    const app = express();
    app.set('trust proxy', 'loopback');
    app.post(
      '/api/auth/password-reset/request',
      createPasswordResetRateLimiter({ windowMs: 60_000, limit: 2 }),
      (_req, res) => res.status(202).json({ accepted: true })
    );

    await request(app).post('/api/auth/password-reset/request').expect(202);
    await request(app).post('/api/auth/password-reset/request').expect(202);
    const limited = await request(app).post('/api/auth/password-reset/request').expect(429);

    expect(limited.body).toEqual({
      message: 'Too many requests. Please try again later.'
    });
  });
});
