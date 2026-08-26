import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/generation/providers/qwenGenerationProvider.js', () => ({
  default: {
    generate: mocked.generate,
    initialize: vi.fn(),
    getMetadata: () => ({ modelId: 'qwen/generation-model' }),
    isLoaded: () => true
  }
}));

describe('Qwen generation routing', () => {
  beforeEach(() => {
    vi.resetModules();
    mocked.generate.mockReset();
    vi.stubEnv('GENERATION_PROVIDER', 'qwen');
    vi.stubEnv('OPENAI_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses Qwen for article summaries and tags without an OpenAI key', async () => {
    mocked.generate
      .mockResolvedValueOnce('{"contentSummaryBullets":["First fact"]}')
      .mockResolvedValueOnce('{"tags":["qwen"]}');
    const { default: analyzeArticleContent } = await import(
      '../src/classifications/articleClassificationService.js'
    );

    const controller = new AbortController();
    const result = await analyzeArticleContent({
      text: 'Article content '.repeat(40),
      title: 'Generated locally',
      categories: [],
      feedName: 'Feed'
    }, {
      requestId: 'article-request',
      signal: controller.signal
    });

    expect(result.contentSummaryBullets).toEqual(['First fact']);
    expect(result.tags).toEqual(['qwen']);
    expect(mocked.generate).toHaveBeenCalledTimes(2);
    expect(mocked.generate.mock.calls.map(([input]) => input)).toEqual([
      expect.objectContaining({
        requestId: 'article-request',
        signal: controller.signal,
        operation: 'article-bullet-summary'
      }),
      expect.objectContaining({
        requestId: 'article-request',
        signal: controller.signal,
        operation: 'article-tag-generation'
      })
    ]);
  });

  it('uses Qwen for Smart Folder recommendations', async () => {
    mocked.generate.mockResolvedValue(JSON.stringify({
      smartFolders: [{ name: 'AI', query: 'ai', reason: 'Frequent topic' }]
    }));
    const { getSmartFolderRecommendations } = await import(
      '../src/smartFolderRecommendations/smartFolderRecommendationService.js'
    );

    await expect(getSmartFolderRecommendations(
      { insights: {} },
      { requestId: 'folder-request' }
    )).resolves.toMatchObject({
      smartFolders: [{ name: 'AI', query: 'ai' }]
    });
    expect(mocked.generate).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'folder-request',
      operation: 'smart-folder-recommendations'
    }));
  });

  it('uses Qwen for feed rediscovery', async () => {
    mocked.generate.mockResolvedValue(JSON.stringify({
      url: 'https://example.com/feed.xml',
      confidence: 0.9,
      reason: 'Official replacement feed.'
    }));
    const { rediscoverRssUrl } = await import(
      '../src/feedRediscovery/feedRediscoveryService.js'
    );

    await expect(rediscoverRssUrl({
      feedName: 'Example',
      websiteUrl: 'https://example.com',
      oldRssUrl: 'https://example.com/old.xml'
    }, { requestId: 'rediscovery-request' }))
      .resolves.toMatchObject({ url: 'https://example.com/feed.xml' });
    expect(mocked.generate).toHaveBeenCalledWith(expect.objectContaining({
      requestId: 'rediscovery-request',
      operation: 'feed-rediscovery'
    }));
  });
});
