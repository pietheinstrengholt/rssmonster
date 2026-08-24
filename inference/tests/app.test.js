import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp, handleAppError } from '../src/app.js';

const createProvider = () => {
  let loaded = false;

  return {
    embed: vi.fn(async texts => {
      loaded = true;
      return texts.map((_text, index) => [index + 0.1, index + 0.2]);
    }),
    getMetadata: () => ({
      provider: 'qwen3-embedding',
      modelId: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      dimensions: 1024
    }),
    isLoaded: vi.fn(() => loaded)
  };
};

describe('inference app', () => {
  it('reports health without loading the model', async () => {
    const provider = createProvider();
    const response = await request(createApp({ provider })).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', modelLoaded: false });
    expect(provider.embed).not.toHaveBeenCalled();
  });

  it('reports safe embedding metadata without loading the model', async () => {
    const provider = createProvider();
    const response = await request(createApp({ provider })).get('/api/embeddings/info');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      provider: 'qwen3-embedding',
      model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      dimensions: 1024,
      maxBatchSize: 8,
      loaded: false
    });
    expect(provider.embed).not.toHaveBeenCalled();
  });

  it('returns embeddings from the shared provider', async () => {
    const provider = createProvider();
    const response = await request(createApp({ provider }))
      .post('/api/embeddings')
      .send({ texts: ['first', 'second'] });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      model: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
      dimensions: 1024,
      count: 2,
      embeddings: [[0.1, 0.2], [1.1, 1.2]]
    });
    expect(provider.embed).toHaveBeenCalledOnce();
  });

  it.each([
    undefined,
    null,
    [],
    ['valid', ''],
    ['valid', 42]
  ])('rejects malformed texts: %j', async texts => {
    const provider = createProvider();
    const response = await request(createApp({ provider }))
      .post('/api/embeddings')
      .send({ texts });

    expect(response.status).toBe(400);
    expect(provider.embed).not.toHaveBeenCalled();
  });

  it('rejects oversized batches without truncating them', async () => {
    const provider = createProvider();
    const response = await request(createApp({ provider }))
      .post('/api/embeddings')
      .send({ texts: Array.from({ length: 9 }, (_, index) => `text ${index}`) });

    expect(response.status).toBe(400);
    expect(provider.embed).not.toHaveBeenCalled();
  });

  it('returns JSON for malformed request bodies', async () => {
    const response = await request(createApp({ provider: createProvider() }))
      .post('/api/embeddings')
      .set('Content-Type', 'application/json')
      .send('{');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'request body must contain valid JSON' });
  });

  it('hides unexpected inference errors', async () => {
    const provider = createProvider();
    const logger = { error: vi.fn() };
    provider.embed.mockRejectedValueOnce(new Error('private model failure'));

    const response = await request(createApp({ provider, logger }))
      .post('/api/embeddings')
      .send({ texts: ['valid'] });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Embedding inference failed' });
    expect(JSON.stringify(response.body)).not.toContain('private model failure');
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('rejects JSON payloads over the configured limit', async () => {
    const response = await request(createApp({ provider: createProvider() }))
      .post('/api/embeddings')
      .send({ texts: ['x'.repeat(101 * 1024)] });

    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: 'request body is too large' });
  });

  it('routes article classification without embedding-model initialization', async () => {
    const provider = createProvider();
    const classificationService = vi.fn().mockResolvedValue({ qualityScore: 80 });
    const response = await request(createApp({ provider, classificationService }))
      .post('/api/classifications/article')
      .send({ text: 'Article text', title: 'Title' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ qualityScore: 80 });
    expect(classificationService).toHaveBeenCalledWith({ text: 'Article text', title: 'Title' });
    expect(provider.embed).not.toHaveBeenCalled();
  });

  it('rejects a missing article classification body', async () => {
    const classificationService = vi.fn();
    const response = await request(createApp({
      provider: createProvider(),
      classificationService
    })).post('/api/classifications/article');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'request body is required' });
    expect(classificationService).not.toHaveBeenCalled();
  });

  it('handles errors from classification and auxiliary services', async () => {
    const logger = { error: vi.fn() };
    const app = createApp({
      provider: createProvider(),
      logger,
      classificationService: vi.fn().mockRejectedValue(new Error('classification failed')),
      smartFolderRecommendationService: vi.fn().mockRejectedValue(new Error('recommendation failed')),
      feedRediscoveryService: vi.fn().mockRejectedValue(new Error('rediscovery failed'))
    });

    const classification = await request(app)
      .post('/api/classifications/article')
      .send({ text: 'Article' });
    const recommendations = await request(app)
      .post('/api/smart-folder-recommendations')
      .send({});
    const rediscovery = await request(app)
      .post('/api/feed-rediscovery');

    expect(classification.status).toBe(500);
    expect(classification.body).toEqual({ error: 'Internal server error' });
    expect(recommendations.body).toEqual({ error: 'Smart Folder recommendation failed' });
    expect(rediscovery.body).toEqual({ error: 'Feed rediscovery failed' });
    expect(logger.error).toHaveBeenCalledTimes(3);
  });

  it('routes Smart Folder recommendations and feed rediscovery independently', async () => {
    const smartFolderRecommendationService = vi.fn().mockResolvedValue({ smartFolders: [] });
    const feedRediscoveryService = vi.fn().mockResolvedValue({
      url: null,
      confidence: 0,
      reason: 'No replacement found.'
    });
    const app = createApp({
      provider: createProvider(),
      smartFolderRecommendationService,
      feedRediscoveryService
    });

    const recommendations = await request(app)
      .post('/api/smart-folder-recommendations')
      .send({ insights: { topTags: ['ai'] } });
    const rediscovery = await request(app)
      .post('/api/feed-rediscovery')
      .send({ websiteUrl: 'https://example.com' });

    expect(recommendations.status).toBe(200);
    expect(recommendations.body).toEqual({ smartFolders: [] });
    expect(rediscovery.status).toBe(200);
    expect(rediscovery.body.url).toBeNull();
  });

  it('proxies normal assistant model responses', async () => {
    const assistantService = {
      respond: vi.fn().mockResolvedValue({ output: [], responseId: 'response-1' }),
      stream: vi.fn()
    };
    const response = await request(createApp({ provider: createProvider(), assistantService }))
      .post('/api/assistant/model')
      .send({ request: { input: 'Hello' } });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ output: [], responseId: 'response-1' });
    expect(assistantService.respond).toHaveBeenCalledWith({ request: { input: 'Hello' } });
  });

  it('streams assistant events as NDJSON', async () => {
    const assistantService = {
      respond: vi.fn(),
      stream: vi.fn().mockResolvedValue((async function* () {
        yield { type: 'delta', value: 'hello' };
        yield { type: 'done' };
      })())
    };
    const response = await request(createApp({ provider: createProvider(), assistantService }))
      .post('/api/assistant/model/stream')
      .send({ request: { input: 'Hello' } });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/x-ndjson');
    expect(response.text).toBe('{"type":"delta","value":"hello"}\n{"type":"done"}\n');
  });

  it('hides assistant response and pre-stream failures', async () => {
    const logger = { error: vi.fn() };
    const assistantService = {
      respond: vi.fn().mockRejectedValue(new Error('response failed')),
      stream: vi.fn().mockRejectedValue(new Error('stream failed'))
    };
    const app = createApp({ provider: createProvider(), assistantService, logger });

    const response = await request(app).post('/api/assistant/model');
    const stream = await request(app).post('/api/assistant/model/stream');

    expect(response.body).toEqual({ error: 'Assistant inference failed' });
    expect(stream.body).toEqual({ error: 'Assistant inference failed' });
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it('destroys a streaming response when the stream fails after sending headers', async () => {
    const logger = { error: vi.fn() };
    const assistantService = {
      respond: vi.fn(),
      stream: vi.fn().mockResolvedValue((async function* () {
        yield { type: 'delta' };
        throw new Error('late stream failure');
      })())
    };

    await expect(request(createApp({ provider: createProvider(), assistantService, logger }))
      .post('/api/assistant/model/stream')).rejects.toThrow();
    expect(logger.error).toHaveBeenCalledOnce();
  });

  it('delegates errors after response headers have been sent', () => {
    const error = new Error('late failure');
    const next = vi.fn();
    const response = { headersSent: true };

    handleAppError(error, {}, response, next, { error: vi.fn() });

    expect(next).toHaveBeenCalledWith(error);
  });

  it('rate limits assistant model requests', async () => {
    const assistantService = {
      respond: vi.fn().mockResolvedValue({ output: [], responseId: 'response-1' }),
      stream: vi.fn()
    };
    const app = createApp({
      provider: createProvider(),
      assistantService,
      environment: {
        ASSISTANT_RATE_LIMIT_WINDOW_MS: '60000',
        ASSISTANT_RATE_LIMIT_MAX: '1'
      }
    });

    const allowedResponse = await request(app)
      .post('/api/assistant/model')
      .send({ request: { input: 'Hello' } });
    const limitedResponse = await request(app)
      .post('/api/assistant/model/stream')
      .send({ request: { input: 'Again' } });

    expect(allowedResponse.status).toBe(200);
    expect(allowedResponse.headers).toHaveProperty('ratelimit');
    expect(allowedResponse.headers).toHaveProperty('ratelimit-policy');
    expect(limitedResponse.status).toBe(429);
    expect(limitedResponse.headers).toHaveProperty('retry-after');
    expect(limitedResponse.body).toEqual({
      message: 'Too many requests. Please try again later.'
    });
    expect(assistantService.respond).toHaveBeenCalledOnce();
    expect(assistantService.stream).not.toHaveBeenCalled();
  });

  it('rejects invalid assistant rate-limit settings', () => {
    expect(() => createApp({
      provider: createProvider(),
      environment: { ASSISTANT_RATE_LIMIT_MAX: '0' }
    })).toThrow('ASSISTANT_RATE_LIMIT_MAX must be a positive integer');
  });
});
