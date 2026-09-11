import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createReadinessState } from '../src/readiness/readinessState.js';
import packageInfo from '../package.json' with { type: 'json' };

const local = { EMBEDDING_PROVIDER: 'local', GENERATION_PROVIDER: 'local', CLASSIFICATION_PROVIDER: 'local' };
const external = {
  EMBEDDING_PROVIDER: 'openai-compatible', GENERATION_PROVIDER: 'openai-compatible',
  CLASSIFICATION_PROVIDER: 'openai-compatible', ASSISTANT_PROVIDER: 'openai-compatible',
  OPENAI_BASE_URL: 'https://private-provider.example/v1?token=private-token', OPENAI_API_KEY: 'private-key',
  EMBEDDING_MODEL: 'embed-model', EMBEDDING_DIMENSIONS: '512', GENERATION_MODEL: 'generate-model',
  CLASSIFICATION_MODEL: 'score-model', ASSISTANT_MODEL: 'assistant-model'
};
const setup = (environment = local, state = 'ready', loaded = true) => {
  const model = { isLoaded: vi.fn(() => loaded), initialize: vi.fn(), embed: vi.fn(),
    getMetadata: () => ({ modelId: 'embedding-runtime', dimensions: 1024, provider: 'qwen3-embedding' }) };
  const readiness = createReadinessState({ initialState: state, logger: { log: vi.fn() } });
  const logger = { log: vi.fn(), error: vi.fn(), warn: vi.fn() };
  const app = createApp({ environment, provider: model, localGeneration: model, localClassification: model, readinessState: readiness, logger });
  return { app, model, readiness, logger };
};

describe('inference discovery contract', () => {
  it.each([['local', local], ['external', external], ['mixed', { ...external, CLASSIFICATION_PROVIDER: 'local' }]])(
    'describes %s providers without initialization or inference', async (_name, environment) => {
      const { app, model } = setup(environment);
      const response = await request(app).get('/api/capabilities').set('X-Request-ID', 'discovery-test');
      expect(response.status).toBe(200);
      expect(response.headers['x-request-id']).toBe('discovery-test');
      expect(response.body).toMatchObject({ service: 'rssmonster-inference', apiVersion: '1', version: packageInfo.version, status: 'ready' });
      const capabilities = response.body.capabilities;
      expect(Object.keys(capabilities)).toEqual(['embeddings', 'generation', 'classification', 'assistant']);
      for (const [name, prefix] of [['embeddings', 'EMBEDDING'], ['generation', 'GENERATION'], ['classification', 'CLASSIFICATION']]) {
        expect(capabilities[name]).toMatchObject({ configured: true, available: true, provider: environment[`${prefix}_PROVIDER`] });
        expect(capabilities[name].model).toEqual(expect.any(String));
      }
      expect(capabilities.embeddings.dimensions).toBe(environment.EMBEDDING_DIMENSIONS ? 512 : 1024);
      if (environment === external) {
        expect(capabilities.embeddings.model).toBe('embed-model');
        expect(capabilities.generation.model).toBe('generate-model');
        expect(capabilities.classification.model).toBe('score-model');
        expect(capabilities.assistant).toEqual({ configured: true, available: true, provider: 'openai-compatible', model: 'assistant-model' });
      } else if (environment === local) {
        expect(capabilities.generation.model).toBe('onnx-community/Qwen3.5-0.8B-ONNX');
        expect(capabilities.assistant).toEqual({ configured: false, available: false, provider: null, model: null });
      }
      expect(model.initialize).not.toHaveBeenCalled();
      expect(model.embed).not.toHaveBeenCalled();
      expect(JSON.stringify(response.body)).not.toMatch(/private-|BASE_URL|API_KEY|Authorization|vectors|prompt/);
    }
  );
  it.each(['starting', 'failed', 'shutting_down'])('remains descriptive while %s and preserves health/readiness', async state => {
    const { app, model } = setup(local, state);
    const response = await request(app).get('/api/capabilities');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe(state);
    expect(response.body.capabilities.embeddings).toMatchObject({ configured: true, available: false });
    expect(Object.values(response.body.capabilities).every(item => !item.available)).toBe(true);
    expect((await request(app).get('/health')).body).toEqual({ status: 'ok', state });
    expect((await request(app).get('/ready')).status).toBe(503);
    expect(model.initialize).not.toHaveBeenCalled();
  });
  it('observes loaded state changes without caching availability or reparsing changed settings', async () => {
    const environment = { ...local };
    const { app, model } = setup(environment, 'ready', false);
    expect((await request(app).get('/api/capabilities')).body.capabilities.embeddings.available).toBe(false);
    model.isLoaded.mockReturnValue(true);
    environment.EMBEDDING_MODEL = 'changed-after-startup';
    const result = (await request(app).get('/api/capabilities')).body.capabilities;
    expect(result.embeddings.available).toBe(true);
    expect(result.embeddings.model).not.toBe('changed-after-startup');
  });
  it('does not mistake lazy external clients for unloaded local models', async () => {
    const { app, model } = setup(external, 'ready', false);
    expect(Object.values((await request(app).get('/api/capabilities')).body.capabilities).every(item => item.available)).toBe(true);
    expect(model.isLoaded).not.toHaveBeenCalled();
  });
  it('represents absent remote credentials with explicit null metadata during startup', async () => {
    const { app } = setup({ ...external, OPENAI_API_KEY: '' }, 'starting');
    const result = (await request(app).get('/api/capabilities')).body.capabilities;
    expect(result.embeddings).toEqual({ configured: false, available: false, provider: null, model: null, dimensions: null });
    expect(result.assistant).toEqual({ configured: false, available: false, provider: null, model: null });
  });
  it.each([
    { GENERATION_MODEL: 'https://user:private-secret@private-host/model' },
    { CLASSIFICATION_PROVIDER: 'private-secret' },
    { ASSISTANT_BASE_URL: 'https://user:private-secret@private-host' }
  ])('fails safely for invalid internal settings', async overrides => {
    const { app, logger } = setup({ ...external, ...overrides });
    const response = await request(app).get('/api/capabilities');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
    expect(JSON.stringify([response.body, logger.error.mock.calls])).not.toContain('private-secret');
  });
});
