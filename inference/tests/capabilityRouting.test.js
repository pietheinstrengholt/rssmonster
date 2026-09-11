import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const mocks = vi.hoisted(() => ({ clients: [], assistants: [], localGenerate: vi.fn(), localScore: vi.fn() }));
vi.mock('openai', () => ({
  default: vi.fn(function Client(options) {
    this.options = options;
    this.chat = { completions: { create: vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify({
      contentSummaryBullets: ['summary'], tags: ['tag'], advertisementScore: 80,
      sentimentScore: 90, qualityScore: 80, smartFolders: [], url: null, event: 'Example event'
    }) } }] }) } };
    this.embeddings = { create: vi.fn().mockResolvedValue({ data: [{ embedding: [0.1, 0.2] }] }) };
    mocks.clients.push(this);
  })
}));
vi.mock('@openai/agents', () => ({
  OpenAIProvider: vi.fn(function Provider(options) {
    this.options = options;
    this.getModel = vi.fn(() => ({ getResponse: vi.fn().mockResolvedValue({ output: [] }) }));
    mocks.assistants.push(this);
  })
}));
vi.mock('../src/generation/providers/qwenGenerationProvider.js', () => ({ default: { generate: mocks.localGenerate } }));
vi.mock('../src/classifications/providers/modernBertArticleScoringProvider.js', () => ({ default: { score: mocks.localScore } }));

beforeEach(() => {
  vi.resetModules();
  mocks.clients.length = 0;
  mocks.assistants.length = 0;
  mocks.localGenerate.mockReset().mockResolvedValue('{}');
  mocks.localScore.mockReset();
  vi.stubEnv('OPENAI_API_KEY', '');
  vi.stubEnv('OPENAI_BASE_URL', '');
  for (const capability of ['EMBEDDING', 'GENERATION', 'CLASSIFICATION', 'ASSISTANT']) {
    vi.stubEnv(`${capability}_PROVIDER`, 'openai-compatible');
    vi.stubEnv(`${capability}_BASE_URL`, `http://${capability.toLowerCase()}.example/v1`);
    vi.stubEnv(`${capability}_API_KEY`, `${capability}-secret`);
    vi.stubEnv(`${capability}_MODEL`, `${capability}-model`);
  }
  vi.stubEnv('EMBEDDING_DIMENSIONS', '2');
});
afterEach(() => vi.unstubAllEnvs());

const callsFor = capability => mocks.clients
  .filter(client => client.options.baseURL === `http://${capability.toLowerCase()}.example/v1`)
  .flatMap(client => client.chat.completions.create.mock.calls.map(([body]) => body));

describe('independent compatible capability routing', () => {
  it('routes every generation workload, scoring, embeddings, and assistant to their own endpoint and model', async () => {
    const { default: analyze } = await import('../src/classifications/articleClassificationService.js');
    const { getSmartFolderRecommendations } = await import('../src/smartFolderRecommendations/smartFolderRecommendationService.js');
    const { rediscoverRssUrl } = await import('../src/feedRediscovery/feedRediscoveryService.js');
    const { generateSemanticLabels } = await import('../src/semanticLabels/semanticLabelService.js');
    const { createEmbeddingProvider } = await import('../src/embeddings/providers/index.js');
    const { createAssistantModelService } = await import('../src/assistant/assistantModelService.js');
    const result = await analyze({ text: 'Article content '.repeat(50) });
    expect(result).toMatchObject({ contentSummaryBullets: ['summary'], tags: ['tag'], qualityScore: 80 });
    await getSmartFolderRecommendations({ insights: {} });
    await rediscoverRssUrl({ feedName: 'Feed', websiteUrl: 'https://feed.example', oldRssUrl: 'https://feed.example/rss' });
    await generateSemanticLabels({ context: 'Example article', event: true });
    await expect(createEmbeddingProvider().embed(['text'])).resolves.toEqual([[0.1, 0.2]]);
    await createAssistantModelService().respond({ request: {} });

    expect(callsFor('GENERATION')).toHaveLength(5);
    expect(callsFor('GENERATION').every(body => body.model === 'GENERATION-model')).toBe(true);
    expect(callsFor('CLASSIFICATION')).toHaveLength(1);
    expect(callsFor('CLASSIFICATION')[0].model).toBe('CLASSIFICATION-model');
    for (const client of mocks.clients) {
      const capability = new URL(client.options.baseURL).hostname.split('.')[0].toUpperCase();
      expect(client.options.apiKey).toBe(`${capability}-secret`);
    }
    const embedding = mocks.clients.find(client => client.options.apiKey === 'EMBEDDING-secret');
    expect(embedding.embeddings.create).toHaveBeenCalledWith({ model: 'EMBEDDING-model', input: ['text'] });
    expect(mocks.assistants[0].options).toEqual({ apiKey: 'ASSISTANT-secret', baseURL: 'http://assistant.example/v1', useResponses: false });
    expect(mocks.assistants[0].getModel).toHaveBeenCalledWith('ASSISTANT-model');
    expect(mocks.localGenerate).not.toHaveBeenCalled();
    expect(mocks.localScore).not.toHaveBeenCalled();
  });

  it('runs external classification with local generation and no generation credentials', async () => {
    vi.stubEnv('GENERATION_PROVIDER', 'local');
    vi.stubEnv('GENERATION_API_KEY', '');
    const { default: analyze } = await import('../src/classifications/articleClassificationService.js');
    expect(await analyze({ text: 'Article content '.repeat(50) })).toMatchObject({ qualityScore: 80 });
    expect(callsFor('CLASSIFICATION')).toHaveLength(1);
    expect(callsFor('GENERATION')).toHaveLength(0);
    expect(mocks.localGenerate).toHaveBeenCalledTimes(2);
  });

  it('runs external generation with local classification and no classification credentials', async () => {
    vi.stubEnv('CLASSIFICATION_PROVIDER', 'local');
    vi.stubEnv('CLASSIFICATION_API_KEY', '');
    mocks.localScore.mockResolvedValue({ advertisementScore: 80, sentimentScore: 80, qualityScore: 80 });
    const { default: analyze } = await import('../src/classifications/articleClassificationService.js');
    await analyze({ text: 'Article content '.repeat(50) });
    expect(callsFor('GENERATION')).toHaveLength(2);
    expect(callsFor('CLASSIFICATION')).toHaveLength(0);
    expect(mocks.localScore).toHaveBeenCalledOnce();
  });

  it('preserves the safe HTTP failure and request ID contract for external scoring', async () => {
    const output = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { createApp } = await import('../src/app.js');
      const app = createApp({ logger: output });
      const client = mocks.clients.find(client => client.options.apiKey === 'CLASSIFICATION-secret');
      client.chat.completions.create.mockRejectedValue(new Error('secret prompt and response https://host/v1?token=private'));
      const response = await request(app).post('/api/classifications/article')
        .set('X-Request-ID', 'independent-provider-failure').send({ text: 'Article content '.repeat(20) });
      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
      expect(response.headers['x-request-id']).toBe('independent-provider-failure');
      expect(JSON.stringify([...output.error.mock.calls, ...errorSpy.mock.calls])).not.toMatch(/secret|prompt|private/);
    } finally { errorSpy.mockRestore(); }
  });
});
