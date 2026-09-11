import { describe, expect, it, vi } from 'vitest';
import { createAI } from '../../services/ai/registry.js';

const analysis = () => ({ contentSummaryBullets: ['Summary'], tags: ['science'], advertisementScore: 80, sentimentScore: 90, qualityScore: 70 });
const setup = () => {
  const inference = {
    embedTexts: vi.fn().mockResolvedValue({ model: 'reported-model', dimensions: 2, count: 1, embeddings: [[0.1, 0.2]] }),
    getEmbeddingInfo: vi.fn().mockResolvedValue({ model: 'reported-model', dimensions: 2 }),
    classifyArticle: vi.fn().mockResolvedValue(analysis()),
    generateSmartFolderRecommendations: vi.fn().mockResolvedValue({ smartFolders: [{ name: 'Science', query: 'science', reason: 'Interest' }] }),
    rediscoverFeed: vi.fn().mockResolvedValue({ url: null, confidence: 0, reason: 'No match' }),
    generateSemanticLabels: vi.fn().mockResolvedValue({ event: 'Event label', topic: null }),
    assistantChat: vi.fn().mockResolvedValue({ output: [], responseId: 'response-1' }),
    assistantStream: vi.fn(async function* () { yield { type: 'done' }; })
  };
  return { inference, ai: createAI({ inference }) };
};

const options = () => ({ signal: new AbortController().signal, requestId: 'capability-request-123', timeoutMs: 100 });

describe('embedding capability', () => {
  it('preserves vectors and model metadata from inference and passes request options unchanged', async () => {
    const { ai, inference } = setup();
    const requestOptions = options();
    expect(await ai.embedding.embedTexts(['text'], requestOptions)).toMatchObject({ model: 'reported-model', count: 1 });
    expect(inference.embedTexts).toHaveBeenCalledWith(['text'], requestOptions);
    expect(await ai.embedding.getEmbeddingInfo(requestOptions)).toEqual({ model: 'reported-model', dimensions: 2 });
    expect(inference.getEmbeddingInfo).toHaveBeenCalledWith(requestOptions);
  });
  it.each([null, [], [''], ['   '], [42], 'text'])('rejects invalid text batches %j without dispatch', async texts => {
    const { ai, inference } = setup();
    await expect(ai.embedding.embedTexts(texts)).rejects.toMatchObject({ code: 'AI_INVALID_REQUEST' });
    expect(inference.embedTexts).not.toHaveBeenCalled();
  });
  it.each([
    { model: 'model', dimensions: 0, count: 1, embeddings: [[]] },
    { model: 'model', dimensions: 2, count: 1, embeddings: [[1, NaN]] },
    { model: 'model', dimensions: 2, count: 2, embeddings: [[1, 2]] },
    { model: 'model', dimensions: 2, count: 1, embeddings: [[1]] },
    { model: '', dimensions: 2, count: 1, embeddings: [[1, 2]] }
  ])('rejects malformed embedding results', async response => {
    const { ai, inference } = setup();
    inference.embedTexts.mockResolvedValue(response);
    await expect(ai.embedding.embedTexts(['text'])).rejects.toThrow();
  });
});

describe('classification capability', () => {
  it('keeps summaries, tags, and scores distinct in the combined result', async () => {
    const { ai, inference } = setup();
    const input = { text: 'Article', title: 'Title', categories: ['Science'] };
    const requestOptions = options();
    await expect(ai.classification.classifyArticle(input, requestOptions)).resolves.toEqual(analysis());
    expect(inference.classifyArticle).toHaveBeenCalledWith(input, requestOptions);
  });
  it.each([null, [], {}, { text: 42 }])('rejects malformed classification requests %j', async input => {
    const { ai, inference } = setup();
    await expect(ai.classification.classifyArticle(input)).rejects.toMatchObject({ code: 'AI_INVALID_REQUEST' });
    expect(inference.classifyArticle).not.toHaveBeenCalled();
  });
  it.each([null, {}, { ...analysis(), tags: [4] }, { ...analysis(), qualityScore: 101 }, { ...analysis(), sentimentScore: NaN }])(
    'rejects malformed classification responses', async response => {
      const { ai, inference } = setup();
      inference.classifyArticle.mockResolvedValue(response);
      await expect(ai.classification.classifyArticle({ text: 'Article' })).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
    }
  );
});

describe('named generation operations', () => {
  it('preserves specialized payloads, valid empty results, and transport options', async () => {
    const { ai, inference } = setup();
    const requestOptions = options();
    const insights = { interests: { topTags: ['science'] } };
    await ai.generation.generateSmartFolderRecommendations({ insights }, requestOptions);
    expect(inference.generateSmartFolderRecommendations).toHaveBeenCalledWith({ insights }, requestOptions);
    inference.generateSmartFolderRecommendations.mockResolvedValue({ smartFolders: [] });
    await expect(ai.generation.generateSmartFolderRecommendations({ insights })).resolves.toEqual({ smartFolders: [] });
    const feed = { feedName: 'Feed', websiteUrl: 'https://example.com', oldRssUrl: 'https://example.com/rss' };
    await expect(ai.generation.rediscoverFeed(feed, requestOptions)).resolves.toMatchObject({ url: null });
    expect(inference.rediscoverFeed).toHaveBeenCalledWith(feed, requestOptions);
    inference.rediscoverFeed.mockResolvedValue({ url: null, confidence: 'low', reason: 'No match' });
    await expect(ai.generation.rediscoverFeed(feed)).resolves.toMatchObject({ confidence: 'low' });
    const labels = { context: ['Article title'], event: true, topic: true };
    await expect(ai.generation.generateSemanticLabels(labels, requestOptions)).resolves.toEqual({ event: 'Event label', topic: null });
    expect(inference.generateSemanticLabels).toHaveBeenCalledWith(labels, requestOptions);
  });
  it.each([
    ['generateSmartFolderRecommendations', {}], ['rediscoverFeed', {}],
    ['generateSemanticLabels', { context: 'Article' }],
    ['generateSemanticLabels', { context: 'x'.repeat(6001), event: true }],
    ['generateSemanticLabels', { context: 42, event: true }],
    ['generateSemanticLabels', { context: 'Article', event: 'true' }]
  ])('rejects invalid %s input before dispatch', async (operation, input) => {
    const { ai, inference } = setup();
    await expect(ai.generation[operation](input)).rejects.toMatchObject({ code: 'AI_INVALID_REQUEST' });
    expect(inference[operation]).not.toHaveBeenCalled();
  });
  it.each([
    ['generateSmartFolderRecommendations', { insights: {} }, { smartFolders: [{}] }],
    ['rediscoverFeed', { feedName: 'Feed', websiteUrl: '', oldRssUrl: '' }, { url: 42 }],
    ['generateSemanticLabels', { context: 'Title', event: true }, { event: 42 }],
    ['generateSemanticLabels', { context: 'Title', event: true }, {}]
  ])('rejects malformed %s responses without disclosing payloads', async (operation, input, response) => {
    const { ai, inference } = setup();
    inference[operation].mockResolvedValue({ ...response, private: 'secret' });
    await expect(ai.generation[operation](input)).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
    await ai.generation[operation](input).catch(error => expect(error.message).not.toContain('secret'));
  });
});

describe('assistant capability and registry', () => {
  it('preserves the SDK envelope and removes signal only from the serialized request', async () => {
    const { ai, inference } = setup();
    const requestOptions = options();
    const input = { input: [], tools: [{ name: 'search' }], signal: requestOptions.signal };
    await ai.assistant.chat(input, requestOptions);
    expect(inference.assistantChat).toHaveBeenCalledWith({ input: [], tools: [{ name: 'search' }] }, requestOptions);
    await expect(Array.fromAsync(ai.assistant.stream(input, requestOptions))).resolves.toEqual([{ type: 'done' }]);
    expect(inference.assistantStream).toHaveBeenCalledWith({ input: [], tools: [{ name: 'search' }] }, requestOptions);
  });
  it('rejects malformed input, output, and stream events', async () => {
    const { ai, inference } = setup();
    await expect(ai.assistant.chat({})).rejects.toMatchObject({ code: 'AI_INVALID_REQUEST' });
    expect(inference.assistantChat).not.toHaveBeenCalled();
    inference.assistantChat.mockResolvedValue({ output: 'secret' });
    await expect(ai.assistant.chat({ input: [] })).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
    inference.assistantStream.mockImplementation(async function* () { yield { private: 'secret' }; });
    await expect(Array.fromAsync(ai.assistant.stream({ input: [] }))).rejects.toMatchObject({ code: 'AI_INVALID_RESPONSE' });
  });
  it('keeps injected providers isolated between registries', async () => {
    const first = setup();
    const second = setup();
    await first.ai.assistant.chat({ input: [] });
    expect(second.inference.assistantChat).not.toHaveBeenCalled();
  });
  it('propagates transport failures with their original identity and metadata', async () => {
    const { ai, inference } = setup();
    for (const code of ['INFERENCE_TIMEOUT', 'INFERENCE_UNAVAILABLE', 'INFERENCE_CIRCUIT_OPEN', 'ABORT_ERR']) {
      const error = Object.assign(new Error('safe transport failure'), { code, requestId: 'same-request', retryAfterMs: 5000 });
      inference.classifyArticle.mockRejectedValue(error);
      await expect(ai.classification.classifyArticle({ text: 'Article' })).rejects.toBe(error);
    }
  });
});
