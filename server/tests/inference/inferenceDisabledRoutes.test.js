import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import agentRoutes from '../../routes/agent.js';
import feedRoutes from '../../routes/feed.js';
import smartFolderRoutes from '../../routes/smartFolder.js';
import { handleInferenceDisabledError } from '../../middleware/inferenceAvailability.js';
import { InferenceDisabledError } from '../../config/intelligentFeatures.js';

const disabledResponse = {
  error: 'Inference features are disabled',
  code: 'INFERENCE_DISABLED'
};

describe('disabled inference routes', () => {
  let app;
  let authorization;

  beforeEach(() => {
    vi.stubEnv('INFERENCE_AI_ENABLED', 'false');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    authorization = `Bearer ${jwt.sign(
      { userId: 42 },
      process.env.JWT_SECRET
    )}`;
    app = express();
    app.use(express.json());
    app.use('/api/agent', agentRoutes);
    app.use('/api/feeds', feedRoutes);
    app.use('/api/smartfolders', smartFolderRoutes);
    app.get('/unguarded-inference', (_req, _res, next) => {
      next(new InferenceDisabledError());
    });
    app.use(handleInferenceDisabledError);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each([
    ['post', '/api/agent'],
    ['post', '/api/feeds/8/rediscover-rss'],
    ['get', '/api/smartfolders/insights']
  ])('quietly rejects %s %s', async (method, path) => {
    const response = await request(app)[method](path)
      .set('Authorization', authorization)
      .send({ input: 'test' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual(disabledResponse);
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('quietly maps fail-closed client errors', async () => {
    const response = await request(app).get('/unguarded-inference');

    expect(response.status).toBe(503);
    expect(response.body).toEqual(disabledResponse);
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('rejects assistant requests when inference is enabled without assistant capability', async () => {
    vi.stubEnv('INFERENCE_AI_ENABLED', 'true');
    vi.stubEnv('INFERENCE_ASSISTANT_ENABLED', 'false');

    const response = await request(app)
      .post('/api/agent')
      .set('Authorization', authorization)
      .send({ input: 'test' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual(disabledResponse);
  });
});
