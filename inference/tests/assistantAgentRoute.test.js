import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createAssistantRouter } from '../src/routes/assistant.js';
import { createAuthenticationMiddleware } from '../src/middleware/authentication.js';

const createApp = (agentService, logger = { error: vi.fn() }) => {
  const app = express();
  app.use(createAuthenticationMiddleware({ environment: { INFERENCE_API_KEY: 'private-inference-key' } }));
  app.use(express.json());
  app.use('/api/assistant', createAssistantRouter({ agentService, logger, rateLimiter: (_req, _res, next) => next() }));
  return app;
};
const run = app => request(app).post('/api/assistant/run/stream').set('X-Inference-API-Key', 'private-inference-key').send({ input: 'test' });

describe('assistant run streaming route', () => {
  it('requires inference authentication', async () => {
    const stream = vi.fn();
    const result = await request(createApp({ stream })).post('/api/assistant/run/stream').send({});
    expect(result.status).toBe(401);
    expect(stream).not.toHaveBeenCalled();
  });

  it('streams progress and the final result as NDJSON', async () => {
    const response = await run(createApp({
      async *stream(_input, { signal }) {
        expect(signal).toBeInstanceOf(AbortSignal);
        yield { type: 'text', output: 'Answer' };
        yield { type: 'complete', finalOutput: 'Answer' };
      }
    }));
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/x-ndjson');
    expect(response.text.trim().split('\n').map(JSON.parse)).toEqual([
      { type: 'text', output: 'Answer' }, { type: 'complete', finalOutput: 'Answer' }
    ]);
  });

  it('reports pre-stream failures without leaking prompts or credentials', async () => {
    const logger = { error: vi.fn() };
    const response = await run(createApp({ async *stream() { throw new Error('Bearer secret prompt'); } }, logger));
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Assistant inference failed' });
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain('secret');
  });

  it('reports late errors as terminal stream events', async () => {
    const response = await run(createApp({ async *stream() {
      yield { type: 'text', output: 'Partial' };
      throw new Error('Bearer secret prompt');
    } }));
    const events = response.text.trim().split('\n').map(JSON.parse);
    expect(events.at(-1)).toEqual({ type: 'error', error: 'Assistant inference failed' });
    expect(response.text).not.toContain('secret');
    expect(response.text).not.toContain('complete');
  });

  it('closes an empty stream without fabricating a result', async () => {
    const response = await run(createApp({ async *stream() {} }));
    expect(response.status).toBe(200);
    expect(response.text).toBe('');
  });
});
