import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp, handleAppError } from '../src/app.js';
import { getInferenceRequestId } from '../src/middleware/requestLifecycle.js';
import { createReadinessState } from '../src/readiness/readinessState.js';

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

const createDeferred = () => {
  let resolve;
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('inference app', () => {
  it('preserves or generates a content-safe request ID response header', async () => {
    const app = createApp({ provider: createProvider() });
    const preserved = await request(app)
      .get('/health')
      .set('X-Request-ID', 'health-check-123');
    const generated = await request(app).get('/health');
    const replaced = await request(app)
      .get('/health')
      .set('X-Request-ID', 'unsafe request id');

    expect(preserved.headers['x-request-id']).toBe('health-check-123');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(replaced.headers['x-request-id']).not.toBe('unsafe request id');
  });

  it('makes the request ID available to downstream services', async () => {
    const classificationService = vi.fn(async () => ({
      requestId: getInferenceRequestId()
    }));
    const response = await request(createApp({
      provider: createProvider(),
      classificationService
    }))
      .post('/api/classifications/article')
      .set('X-Request-ID', 'classification-123')
      .send({ text: 'Article text' });

    expect(response.body).toEqual({ requestId: 'classification-123' });
  });

  it('reports health without loading the model', async () => {
    const provider = createProvider();
    const response = await request(createApp({ provider })).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', state: 'ready' });
    expect(provider.embed).not.toHaveBeenCalled();
  });

  it('reports liveness during startup and gates inference until ready', async () => {
    const provider = createProvider();
    const readinessState = createReadinessState({
      logger: { log: vi.fn() }
    });
    const app = createApp({ provider, readinessState });

    const health = await request(app).get('/health');
    const readyDuringStartup = await request(app).get('/ready');
    const inferenceDuringStartup = await request(app)
      .post('/api/embeddings')
      .send({ texts: ['must not run'] });

    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok', state: 'starting' });
    expect(readyDuringStartup.status).toBe(503);
    expect(readyDuringStartup.body).toEqual({
      status: 'not_ready',
      state: 'starting',
      acceptingWork: false
    });
    expect(readyDuringStartup.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(readyDuringStartup.headers['retry-after']).toBe('5');
    expect(inferenceDuringStartup.status).toBe(503);
    expect(inferenceDuringStartup.body).toEqual({ error: 'not_ready', state: 'starting' });
    expect(inferenceDuringStartup.headers['retry-after']).toBe('5');
    expect(provider.embed).not.toHaveBeenCalled();

    readinessState.transitionTo('ready');
    const ready = await request(app).get('/ready');

    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: 'ready', state: 'ready', acceptingWork: true });
  });

  it('reports failed and shutting-down readiness without changing liveness', async () => {
    const logger = { log: vi.fn() };
    const failedReadiness = createReadinessState({ logger });
    failedReadiness.transitionTo('failed');
    const failedApp = createApp({
      provider: createProvider(),
      readinessState: failedReadiness
    });

    const failed = await request(failedApp).get('/ready');
    const health = await request(failedApp).get('/health');
    failedReadiness.transitionTo('shutting_down');
    failedReadiness.transitionTo('shutting_down');
    const shuttingDown = await request(failedApp).get('/ready');

    expect(failed.status).toBe(503);
    expect(failed.body.state).toBe('failed');
    expect(health.status).toBe(200);
    expect(health.body).toEqual({ status: 'ok', state: 'failed' });
    expect(shuttingDown.status).toBe(503);
    expect(shuttingDown.body.state).toBe('shutting_down');
    expect(logger.log.mock.calls).toEqual([
      ['[INFERENCE] Readiness state=failed'],
      ['[INFERENCE] Readiness state=shutting_down']
    ]);
  });

  it('keeps readiness independent from local queue saturation', async () => {
    const generationProvider = {
      getQueueSnapshot: vi.fn(() => ({
        concurrency: 1,
        running: 1,
        maximumPending: 4,
        pending: 4
      }))
    };
    const articleScoringProvider = {
      getQueueSnapshot: vi.fn(() => ({
        concurrency: 1,
        running: 1,
        maximumPending: 4,
        pending: 4
      }))
    };
    const app = createApp({
      provider: createProvider(),
      generationProvider,
      articleScoringProvider,
      environment: {
        GENERATION_PROVIDER: 'qwen',
        ARTICLE_SCORING_PROVIDER: 'modernbert'
      }
    });

    const ready = await request(app).get('/ready');

    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({
      status: 'ready',
      state: 'ready',
      acceptingWork: true
    });
    expect(generationProvider.getQueueSnapshot).not.toHaveBeenCalled();
    expect(articleScoringProvider.getQueueSnapshot).not.toHaveBeenCalled();
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

  it('returns endpoint-level overload when the local embedding queue is full', async () => {
    const blocker = createDeferred();
    const provider = createProvider();
    provider.embed
      .mockImplementationOnce(() => blocker.promise)
      .mockImplementation(async texts => texts.map(() => [0.1, 0.2]));
    const app = createApp({
      provider,
      environment: {
        EMBEDDING_PROVIDER: 'qwen',
        EMBEDDING_QUEUE_MAX_PENDING: '1'
      }
    });

    const running = request(app)
      .post('/api/embeddings')
      .send({ texts: ['running'] })
      .then(response => response);
    await vi.waitFor(() => expect(provider.embed).toHaveBeenCalledOnce());
    const pending = request(app)
      .post('/api/embeddings')
      .send({ texts: ['pending'] })
      .then(response => response);
    await vi.waitFor(() => expect(app.locals.embeddingService.getQueueSnapshot().pending).toBe(1));

    const rejected = await request(app)
      .post('/api/embeddings')
      .set('X-Request-ID', 'embedding-overload')
      .send({ texts: ['rejected'] });

    expect(rejected.status).toBe(503);
    expect(rejected.body).toEqual({ error: 'inference_queue_full' });
    expect(rejected.headers['retry-after']).toBe('5');
    expect(rejected.headers['x-request-id']).toBe('embedding-overload');

    blocker.resolve([[0.1, 0.2]]);
    expect((await running).status).toBe(200);
    expect((await pending).status).toBe(200);
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
    const privateMarker = 'private model failure https://user:pass@example.com?token=secret';
    provider.embed.mockRejectedValueOnce(new Error(privateMarker));

    const response = await request(createApp({ provider, logger }))
      .post('/api/embeddings')
      .send({ texts: ['valid'] });

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Embedding inference failed' });
    expect(JSON.stringify(response.body)).not.toContain('private model failure');
    expect(logger.error).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(
      `[INFERENCE] Embedding request failed requestId=${response.headers['x-request-id']}:`,
      { name: 'Error' }
    );
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(privateMarker);
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
    expect(classificationService).toHaveBeenCalledWith(
      { text: 'Article text', title: 'Title' },
      {
        requestId: response.headers['x-request-id'],
        signal: expect.any(AbortSignal)
      }
    );
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
    const privateMarker = 'private-content https://example.com/private?api_key=secret';
    const app = createApp({
      provider: createProvider(),
      logger,
      classificationService: vi.fn().mockRejectedValue(new Error(privateMarker)),
      smartFolderRecommendationService: vi.fn().mockRejectedValue(new Error(privateMarker)),
      feedRediscoveryService: vi.fn().mockRejectedValue(new Error(privateMarker))
    });

    const classification = await request(app)
      .post('/api/classifications/article')
      .set('X-Request-ID', 'classification-error')
      .send({ text: 'Article' });
    const recommendations = await request(app)
      .post('/api/smart-folder-recommendations')
      .set('X-Request-ID', 'recommendation-error')
      .send({});
    const rediscovery = await request(app)
      .post('/api/feed-rediscovery')
      .set('X-Request-ID', 'rediscovery-error');

    expect(classification.status).toBe(500);
    expect(classification.body).toEqual({ error: 'Internal server error' });
    expect(recommendations.body).toEqual({ error: 'Smart Folder recommendation failed' });
    expect(rediscovery.body).toEqual({ error: 'Feed rediscovery failed' });
    expect(logger.error).toHaveBeenCalledTimes(3);
    expect(logger.error.mock.calls.map(([message]) => message)).toEqual([
      '[INFERENCE] Request failed requestId=classification-error:',
      '[INFERENCE] Smart Folder recommendation failed requestId=recommendation-error:',
      '[INFERENCE] Feed rediscovery failed requestId=rediscovery-error:'
    ]);
    expect(logger.error.mock.calls.map(([, details]) => details)).toEqual([
      { name: 'Error' },
      { name: 'Error' },
      { name: 'Error' }
    ]);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(privateMarker);
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
      .set('X-Request-ID', 'folder-route-request')
      .send({ insights: { topTags: ['ai'] } });
    const rediscovery = await request(app)
      .post('/api/feed-rediscovery')
      .set('X-Request-ID', 'feed-route-request')
      .send({ websiteUrl: 'https://example.com' });

    expect(recommendations.status).toBe(200);
    expect(recommendations.body).toEqual({ smartFolders: [] });
    expect(rediscovery.status).toBe(200);
    expect(rediscovery.body.url).toBeNull();
    expect(smartFolderRecommendationService).toHaveBeenCalledWith(
      { insights: { topTags: ['ai'] } },
      {
        requestId: 'folder-route-request',
        signal: expect.any(AbortSignal)
      }
    );
    expect(feedRediscoveryService).toHaveBeenCalledWith(
      { websiteUrl: 'https://example.com' },
      {
        requestId: 'feed-route-request',
        signal: expect.any(AbortSignal)
      }
    );
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
    const privateMarker = 'article text Authorization: Bearer private-token';
    const assistantService = {
      respond: vi.fn().mockRejectedValue(new Error(privateMarker)),
      stream: vi.fn().mockRejectedValue(new Error(privateMarker))
    };
    const app = createApp({ provider: createProvider(), assistantService, logger });

    const response = await request(app).post('/api/assistant/model');
    const stream = await request(app).post('/api/assistant/model/stream');

    expect(response.body).toEqual({ error: 'Assistant inference failed' });
    expect(stream.body).toEqual({ error: 'Assistant inference failed' });
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.error.mock.calls.map(([, details]) => details)).toEqual([
      { name: 'Error' },
      { name: 'Error' }
    ]);
    expect(JSON.stringify(logger.error.mock.calls)).not.toContain(privateMarker);
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
