import http from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createInferenceWorkQueue } from '../src/queue/inferenceWorkQueue.js';

const createDeferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const createEmbeddingProvider = () => ({
  embed: vi.fn(),
  getMetadata: () => ({ provider: 'test', modelId: 'test', dimensions: 1 }),
  isLoaded: () => true
});

const listen = app => new Promise((resolve, reject) => {
  const server = app.listen(0, '127.0.0.1');
  server.once('listening', () => resolve(server));
  server.once('error', reject);
});

const closeServer = server => new Promise(resolve => server.close(resolve));

const startClassificationRequest = (server, requestId) => {
  const { port } = server.address();
  const clientRequest = http.request({
    host: '127.0.0.1',
    port,
    path: '/api/classifications/article',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength('{"text":"article"}'),
      'X-Request-ID': requestId
    }
  });
  clientRequest.on('error', () => {});
  clientRequest.end('{"text":"article"}');
  return clientRequest;
};

const startEmbeddingRequest = (server, requestId) => {
  const { port } = server.address();
  const body = '{"texts":["article"]}';
  const clientRequest = http.request({
    host: '127.0.0.1',
    port,
    path: '/api/embeddings',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'X-Request-ID': requestId
    }
  }, response => response.resume());
  clientRequest.on('error', () => {});
  clientRequest.end(body);
  return clientRequest;
};

const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(closeServer));
});

describe('inference HTTP cancellation and overload', () => {
  it('removes disconnected pending local embedding work', async () => {
    const blocker = createDeferred();
    const provider = createEmbeddingProvider();
    provider.embed.mockImplementation(async () => {
      await blocker.promise;
      return [[0.1]];
    });
    const app = createApp({
      provider,
      environment: {
        EMBEDDING_PROVIDER: 'qwen',
        EMBEDDING_QUEUE_MAX_PENDING: '1'
      }
    });
    const server = await listen(app);
    servers.push(server);
    startEmbeddingRequest(server, 'running-embedding');
    await vi.waitFor(() => expect(provider.embed).toHaveBeenCalledOnce());
    const pendingRequest = startEmbeddingRequest(server, 'pending-embedding');
    await vi.waitFor(() => expect(app.locals.embeddingService.getQueueSnapshot().pending).toBe(1));

    pendingRequest.destroy();

    await vi.waitFor(() => expect(app.locals.embeddingService.getQueueSnapshot()).toMatchObject({
      running: 1,
      pending: 0,
      aborted: 1
    }));
    expect(provider.embed).toHaveBeenCalledOnce();
    blocker.resolve();
    await vi.waitFor(() => expect(app.locals.embeddingService.getQueueSnapshot().running).toBe(0));
  });

  it('removes disconnected pending work before its task runs', async () => {
    const blocker = createDeferred();
    const pendingTask = vi.fn(() => ({ qualityScore: 80 }));
    const queue = createInferenceWorkQueue({ concurrency: 1, maximumPending: 1 });
    const running = queue.enqueue(() => blocker.promise);
    const classificationService = vi.fn((_input, context) => queue.enqueue(pendingTask, {
      signal: context.signal,
      requestId: context.requestId,
      operation: 'article-bullet-summary'
    }));
    const server = await listen(createApp({
      provider: createEmbeddingProvider(),
      classificationService
    }));
    servers.push(server);
    const clientRequest = startClassificationRequest(server, 'pending-request');
    await vi.waitFor(() => expect(queue.getSnapshot().pending).toBe(1));

    clientRequest.destroy();

    await vi.waitFor(() => expect(queue.getSnapshot()).toMatchObject({
      running: 1,
      pending: 0,
      aborted: 1
    }));
    expect(pendingTask).not.toHaveBeenCalled();
    blocker.resolve();
    await running;
  });

  it('keeps detached running work accounted for until native settlement', async () => {
    const generation = createDeferred();
    const task = vi.fn(() => generation.promise);
    const queue = createInferenceWorkQueue({ concurrency: 1, maximumPending: 1 });
    const classificationService = vi.fn((_input, context) => queue.enqueue(task, {
      signal: context.signal,
      requestId: context.requestId,
      operation: 'article-bullet-summary'
    }));
    const server = await listen(createApp({
      provider: createEmbeddingProvider(),
      classificationService
    }));
    servers.push(server);
    const unhandledRejection = vi.fn();
    process.on('unhandledRejection', unhandledRejection);
    const clientRequest = startClassificationRequest(server, 'running-request');
    await vi.waitFor(() => expect(task).toHaveBeenCalledOnce());

    clientRequest.destroy();

    await vi.waitFor(() => expect(queue.getSnapshot()).toMatchObject({
      running: 1,
      pending: 0,
      aborted: 1
    }));
    generation.resolve({ qualityScore: 80 });
    await vi.waitFor(() => expect(queue.getSnapshot().running).toBe(0));
    await new Promise(resolve => setImmediate(resolve));
    process.removeListener('unhandledRejection', unhandledRejection);
    expect(unhandledRejection).not.toHaveBeenCalled();
  });

  it('returns a stable 503 response with Retry-After when the queue is full', async () => {
    const blocker = createDeferred();
    const queue = createInferenceWorkQueue({ concurrency: 1, maximumPending: 1 });
    const running = queue.enqueue(() => blocker.promise);
    const pending = queue.enqueue(() => 'pending');
    const rejectedTask = vi.fn();
    const classificationService = vi.fn((_input, context) => queue.enqueue(rejectedTask, {
      signal: context.signal,
      requestId: context.requestId,
      operation: 'article-bullet-summary'
    }));
    const app = createApp({
      provider: createEmbeddingProvider(),
      classificationService
    });

    const response = await request(app)
      .post('/api/classifications/article')
      .set('X-Request-ID', 'overload-request')
      .send({ text: 'article' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'inference_queue_full' });
    expect(response.headers['retry-after']).toBe('5');
    expect(response.headers['x-request-id']).toBe('overload-request');
    expect(rejectedTask).not.toHaveBeenCalled();
    blocker.resolve();
    await running;
    await pending;
  });

  it('preserves successful responses and correlates request IDs with queue events', async () => {
    const events = [];
    const queue = createInferenceWorkQueue({
      concurrency: 1,
      maximumPending: 1,
      onEvent: event => events.push(event)
    });
    const classificationService = vi.fn((_input, context) => queue.enqueue(
      () => ({ qualityScore: 80 }),
      {
        signal: context.signal,
        requestId: context.requestId,
        operation: 'article-bullet-summary'
      }
    ));
    const response = await request(createApp({
      provider: createEmbeddingProvider(),
      classificationService
    }))
      .post('/api/classifications/article')
      .set('X-Request-ID', 'correlated-request')
      .send({ text: 'article' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ qualityScore: 80 });
    expect(response.headers['x-request-id']).toBe('correlated-request');
    expect(events.map(event => event.type)).toEqual(['queued', 'started', 'completed']);
    expect(events.every(event => event.requestId === 'correlated-request')).toBe(true);
  });
});
