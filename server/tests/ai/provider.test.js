import { describe, expect, it, vi } from 'vitest';
import { createInferenceProvider } from '../../services/ai/providers/inference.js';

describe('RSSMonster inference provider adapter', () => {
  it.each([
    ['embedTexts', ['text'], '/api/embeddings', { texts: ['text'] }, 'embeddings'],
    ['classifyArticle', { text: 'Article' }, '/api/classifications/article', { text: 'Article' }, 'classification'],
    ['generateSmartFolderRecommendations', { insights: {} }, '/api/smart-folder-recommendations', { insights: {} }, 'smart-folders'],
    ['rediscoverFeed', { feedName: 'Feed' }, '/api/feed-rediscovery', { feedName: 'Feed' }, 'feed-rediscovery'],
    ['generateSemanticLabels', { event: true }, '/api/semantic-labels', { event: true }, 'semantic-labels'],
    ['assistantChat', { input: [] }, '/api/assistant/model', { request: { input: [] } }, 'assistant']
  ])('maps %s to the established route and circuit without retries', async (method, input, path, payload, circuitKey) => {
    const json = vi.fn().mockResolvedValue({ result: true });
    const inference = createInferenceProvider({ json, stream: vi.fn() });
    const options = { requestId: 'adapter-request', signal: new AbortController().signal, timeoutMs: 10 };
    await expect(inference[method](input, options)).resolves.toEqual({ result: true });
    expect(json).toHaveBeenCalledExactlyOnceWith(path, payload, { ...options, circuitKey });
  });
  it('maps administrative GETs and NDJSON streaming without changing options', async () => {
    const json = vi.fn();
    const stream = vi.fn();
    const inference = createInferenceProvider({ json, stream });
    const options = { requestId: 'admin-request' };
    await inference.getEmbeddingInfo(options);
    await inference.getHealth(options);
    await inference.getReadiness(options);
    expect(json.mock.calls).toEqual([
      ['/api/embeddings/info', undefined, { ...options, method: 'GET', circuitKey: 'embeddings' }],
      ['/health', undefined, { ...options, method: 'GET', circuitKey: 'health', includeHttpStatus: true }],
      ['/ready', undefined, { ...options, method: 'GET', circuitKey: 'readiness', includeHttpStatus: true }]
    ]);
    inference.assistantStream({ input: [] }, options);
    expect(stream).toHaveBeenCalledExactlyOnceWith('/api/assistant/model/stream', { request: { input: [] } }, options);
  });
});
