import { describe, expect, it, vi } from 'vitest';
import { createEmbeddingService } from '../src/embeddings/embeddingService.js';

const metadata = {
  provider: 'qwen3-embedding',
  modelId: 'test-model',
  dimensions: 1024
};

const createDeferred = () => {
  let resolve;
  const promise = new Promise(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('embedding service', () => {
  it('logs content-safe request and provider diagnostics when enabled', async () => {
    const logger = { log: vi.fn() };
    const provider = {
      embed: vi.fn(async () => [[0.1]]),
      getMetadata: () => metadata,
      isLoaded: () => true
    };
    const service = createEmbeddingService({
      provider,
      environment: { INFERENCE_DEBUG: 'true' },
      logger
    });

    await service.embed(['private article text']);

    expect(logger.log).toHaveBeenCalledTimes(3);
    expect(logger.log.mock.calls.flat().join('\n')).toContain('provider=qwen3-embedding');
    expect(logger.log.mock.calls.flat().join('\n')).not.toContain('private article text');
  });

  it('serializes concurrent inference calls', async () => {
    let activeCalls = 0;
    let maximumActiveCalls = 0;
    const releases = [];
    const provider = {
      embed: vi.fn(async texts => {
        activeCalls += 1;
        maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
        await new Promise(resolve => releases.push(resolve));
        activeCalls -= 1;
        return texts.map(() => [0.1]);
      }),
      getMetadata: () => metadata,
      isLoaded: () => true
    };
    const service = createEmbeddingService({ provider });

    const first = service.embed(['first']);
    const second = service.embed(['second']);
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.shift()();
    await vi.waitFor(() => expect(releases).toHaveLength(1));
    releases.shift()();
    await Promise.all([first, second]);

    expect(maximumActiveCalls).toBe(1);
    expect(provider.embed).toHaveBeenCalledTimes(2);
  });

  it('bounds pending local Qwen embedding work', async () => {
    const blocker = createDeferred();
    const provider = {
      embed: vi.fn()
        .mockImplementationOnce(async () => {
          await blocker.promise;
          return [[0.1]];
        })
        .mockResolvedValue([[0.2]]),
      getMetadata: () => metadata,
      isLoaded: () => true
    };
    const service = createEmbeddingService({
      provider,
      environment: {
        EMBEDDING_PROVIDER: 'qwen',
        EMBEDDING_QUEUE_MAX_PENDING: '1'
      }
    });

    const running = service.embed(['running'], { requestId: 'embedding-running' });
    await vi.waitFor(() => expect(provider.embed).toHaveBeenCalledOnce());
    const pending = service.embed(['pending'], { requestId: 'embedding-pending' });
    await vi.waitFor(() => expect(service.getQueueSnapshot().pending).toBe(1));

    await expect(service.embed(['rejected'], {
      requestId: 'embedding-rejected'
    })).rejects.toMatchObject({
      code: 'INFERENCE_QUEUE_FULL',
      requestId: 'embedding-rejected'
    });
    expect(service.getQueueSnapshot()).toMatchObject({
      running: 1,
      pending: 1,
      maximumPending: 1,
      rejected: 1
    });

    blocker.resolve();
    await running;
    await pending;
    expect(provider.embed).toHaveBeenCalledTimes(2);
  });

  it('removes disconnected pending local embedding work', async () => {
    const blocker = createDeferred();
    const controller = new AbortController();
    const provider = {
      embed: vi.fn(async () => {
        await blocker.promise;
        return [[0.1]];
      }),
      getMetadata: () => metadata,
      isLoaded: () => true
    };
    const service = createEmbeddingService({
      provider,
      environment: {
        EMBEDDING_PROVIDER: 'qwen',
        EMBEDDING_QUEUE_MAX_PENDING: '1'
      }
    });

    const running = service.embed(['running']);
    await vi.waitFor(() => expect(provider.embed).toHaveBeenCalledOnce());
    const pending = service.embed(['pending'], { signal: controller.signal });
    await vi.waitFor(() => expect(service.getQueueSnapshot().pending).toBe(1));
    controller.abort();

    await expect(pending).rejects.toMatchObject({
      code: 'INFERENCE_QUEUE_ABORTED',
      phase: 'pending'
    });
    expect(service.getQueueSnapshot()).toMatchObject({ pending: 0, aborted: 1 });
    expect(provider.embed).toHaveBeenCalledOnce();

    blocker.resolve();
    await running;
  });

  it('reports optional task metadata and delegates initialization', async () => {
    const provider = {
      initialize: vi.fn().mockResolvedValue(undefined),
      embed: vi.fn(),
      getMetadata: () => ({ ...metadata, task: 'feature-extraction' }),
      isLoaded: () => false
    };
    const service = createEmbeddingService({ provider });

    expect(service.getInfo()).toMatchObject({ task: 'feature-extraction' });
    await expect(service.initialize()).resolves.toBeUndefined();
    expect(provider.initialize).toHaveBeenCalledOnce();
  });
});
