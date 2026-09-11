import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAuthenticationMiddleware } from '../src/middleware/authentication.js';
import { requestInferenceJson, requestInferenceStream, resetInferenceCircuitBreakerForTests } from '../../server/services/inference/inferenceClient.js';

const secret = 'test-only opaque:secret +/= with  spaces';
const setup = key => {
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const classificationService = vi.fn(async () => ({ qualityScore: 80 }));
  const smartFolderRecommendationService = vi.fn(async () => ({ smartFolders: [] }));
  const assistantService = { respond: vi.fn(async () => ({ output: [] })), stream: vi.fn(async function* () { yield { type: 'done' }; }) };
  const provider = { getMetadata: () => ({ provider: 'local', modelId: 'test-model', dimensions: 2 }),
    isLoaded: () => true, embed: vi.fn(async texts => texts.map(() => [1, 2])) };
  const app = createApp({ environment: { EMBEDDING_PROVIDER: 'local', GENERATION_PROVIDER: 'local',
    CLASSIFICATION_PROVIDER: 'local', INFERENCE_API_KEY: key, INFERENCE_DEBUG: 'true' }, logger,
    provider, classificationService, smartFolderRecommendationService, assistantService });
  return { app, logger, provider, classificationService, assistantService };
};
afterEach(() => { vi.unstubAllEnvs(); resetInferenceCircuitBreakerForTests(); });

describe('optional inference authentication', () => {
  it.each([[undefined, undefined, 200], ['', undefined, 200], ['', secret, 200],
    [secret, secret, 200], [secret, undefined, 401], [secret, 'wrong', 401],
    [secret, 'x'.repeat(secret.length), 401]])('enforces exact opt-in matching (%#)', async (key, header, status) => {
    const { app, logger } = setup(key);
    const call = request(app).get('/ready').set('X-Request-ID', 'auth-test');
    if (header !== undefined) call.set('X-Inference-API-Key', header);
    const response = await call;
    expect(response.status).toBe(status);
    expect(response.headers['x-request-id']).toBe('auth-test');
    if (status === 401) expect(response.body).toEqual({ error: 'unauthorized' });
    expect(JSON.stringify([response.body, logger.log.mock.calls, logger.error.mock.calls])).not.toContain(secret);
  });
  it('keeps health public without leaking credentials', async () => {
    const response = await request(setup(secret).app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', state: 'ready' });
  });
  it.each([
    ['get', '/ready'], ['get', '/api/capabilities'], ['get', '/api/embeddings/info'],
    ['post', '/api/embeddings'], ['post', '/api/classifications/article'],
    ['post', '/api/assistant/model'], ['post', '/api/assistant/model/stream'],
    ['post', '/api/smart-folder-recommendations'], ['post', '/api/feed-rediscovery'], ['post', '/api/semantic-labels']
  ])('protects %s %s before parsing or executing work', async (method, path) => {
    const { app, provider, classificationService, assistantService } = setup(secret);
    const response = await request(app)[method](path).set('Content-Type', 'application/json').send('{invalid');
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'unauthorized' });
    expect(provider.embed).not.toHaveBeenCalled();
    expect(classificationService).not.toHaveBeenCalled();
    expect(assistantService.stream).not.toHaveBeenCalled();
  });
  it('rejects duplicate headers even if their joined value equals the configured key', async () => {
    const response = await request(setup('first, second').app).get('/ready').set('X-Inference-API-Key', ['first', 'second']);
    expect(response.status).toBe(401);
  });
  it.each([undefined, [], 12, ['bad']])('fails safely for malformed header representations', supplied => {
    const next = vi.fn();
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    createAuthenticationMiddleware({ environment: { INFERENCE_API_KEY: secret } })({
      rawHeaders: ['X-Inference-API-Key', 'bad'], headers: { 'x-inference-api-key': supplied }
    }, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });
});

describe('real server transport to inference HTTP integration', () => {
  it.each([['', '', true], [secret, secret, true], [secret, '', false], [secret, 'wrong', false], ['', secret, true]])(
    'handles deployment key pairing (%#)', async (inferenceKey, serverKey, allowed) => {
      vi.stubEnv('INFERENCE_AI_ENABLED', 'true');
      vi.stubEnv('INFERENCE_API_KEY', serverKey);
      const { app } = setup(inferenceKey);
      const listener = app.listen(0, '127.0.0.1');
      await new Promise(resolve => listener.once('listening', resolve));
      const options = { baseUrl: `http://127.0.0.1:${listener.address().port}`, requestId: 'integration-auth' };
      try {
        const capabilities = requestInferenceJson('/api/capabilities', undefined, { ...options, method: 'GET' });
        if (!allowed) {
          await expect(capabilities).rejects.toMatchObject({ code: 'INFERENCE_UNAUTHORIZED', status: 401 });
          await expect(Array.fromAsync(requestInferenceStream('/api/assistant/model/stream', {}, options)))
            .rejects.toMatchObject({ code: 'INFERENCE_UNAUTHORIZED' });
          return;
        }
        await expect(capabilities).resolves.toMatchObject({ apiVersion: '1', service: 'rssmonster-inference' });
        await expect(requestInferenceJson('/api/embeddings', { texts: ['test'] }, options)).resolves.toMatchObject({ embeddings: [[1, 2]] });
        await expect(requestInferenceJson('/api/classifications/article', { text: 'test' }, options)).resolves.toEqual({ qualityScore: 80 });
        await expect(requestInferenceJson('/api/smart-folder-recommendations', { insights: {} }, options)).resolves.toEqual({ smartFolders: [] });
        await expect(Array.fromAsync(requestInferenceStream('/api/assistant/model/stream', {}, options))).resolves.toEqual([{ type: 'done' }]);
      } finally {
        await new Promise(resolve => listener.close(resolve));
      }
    }
  );
});
