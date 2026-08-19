import { describe, expect, it, vi } from 'vitest';
import { createEmbeddingService } from '../src/embeddings/embeddingService.js';

const metadata = {
  provider: 'qwen3-embedding',
  modelId: 'test-model',
  dimensions: 1024
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
});
