import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  actionFindAll: vi.fn(),
  hotlinkCount: vi.fn(),
  extractEntryFields: vi.fn(),
  resolveUrlPublishedDate: vi.fn(),
  buildArticleIdentity: vi.fn(),
  matchArticleDuplicate: vi.fn(),
  processMedia: vi.fn(),
  processHtmlContent: vi.fn(),
  applyActions: vi.fn(),
  analyzeArticleContent: vi.fn(),
  saveArticle: vi.fn(),
  normalizeUrl: vi.fn(value => value),
  decodeHtmlEntities: vi.fn(value => value),
  detectArticleImage: vi.fn()
}));

vi.mock('../models/index.js', () => ({
  default: {
    Action: {
      findAll: mocked.actionFindAll
    },
    Hotlink: {
      count: mocked.hotlinkCount
    }
  }
}));

vi.mock('../services/crawl/extractEntryFields.js', () => ({
  default: mocked.extractEntryFields,
  resolveUrlPublishedDate: mocked.resolveUrlPublishedDate
}));

vi.mock('../services/crawl/articleDuplicateMatcher.js', () => ({
  buildArticleIdentity: mocked.buildArticleIdentity,
  matchArticleDuplicate: mocked.matchArticleDuplicate
}));

vi.mock('../services/crawl/processMedia.js', () => ({
  default: mocked.processMedia
}));

vi.mock('../services/crawl/processHtmlContent.js', () => ({
  default: mocked.processHtmlContent
}));

vi.mock('../services/crawl/applyActions.js', () => ({
  default: mocked.applyActions
}));

vi.mock('../services/crawl/analyzeArticleContent.js', () => ({
  default: mocked.analyzeArticleContent
}));

vi.mock('../services/crawl/saveArticle.js', () => ({
  default: mocked.saveArticle
}));

vi.mock('../services/crawl/normalizeUrl.js', () => ({
  default: mocked.normalizeUrl
}));

vi.mock('../utils/decodeHtmlEntities.js', () => ({
  default: mocked.decodeHtmlEntities
}));

vi.mock('../services/crawl/detectArticleImage.js', () => ({
  default: mocked.detectArticleImage
}));

describe('processArticle AI analysis controls', () => {
  beforeEach(() => {
    Object.values(mocked).forEach(mock => {
      if (typeof mock?.mockReset === 'function') {
        mock.mockReset();
      }
    });

    mocked.normalizeUrl.mockImplementation(value => value);
    mocked.decodeHtmlEntities.mockImplementation(value => value);
    mocked.extractEntryFields.mockReturnValue({
      title: 'Article title',
      link: 'https://example.com/article',
      content: '<p>Article body</p>',
      description: 'Article description',
      categories: ['AI'],
      published: new Date('2026-07-01T00:00:00Z')
    });
    mocked.resolveUrlPublishedDate.mockReturnValue(null);
    mocked.buildArticleIdentity.mockImplementation(identity => ({
      userId: identity.feed?.userId,
      feedId: identity.feed?.id,
      title: identity.title,
      link: identity.link,
      normalizedUrl: identity.normalizedUrl,
      contentHash: identity.contentHash,
      contentStrippedHash: identity.contentStrippedHash,
      published: identity.published
    }));
    mocked.matchArticleDuplicate.mockResolvedValue(null);
    mocked.processMedia.mockReturnValue({});
    mocked.processHtmlContent.mockReturnValue({
      content: '<p>Article body</p>',
      stripped: 'Article body with enough text to save.',
      text: 'Article body with enough text to save.',
      language: 'en',
      contentHash: 'content-hash',
      contentStrippedHash: 'content-stripped-hash',
      title: 'Article title'
    });
    mocked.applyActions.mockReturnValue({
      shouldDelete: false,
      status: 'unread',
      favoriteInd: false,
      clickedAmount: 0,
      hotInd: false,
      tags: [],
      advertisementScore: null,
      qualityScore: null
    });
    mocked.saveArticle.mockResolvedValue({ id: 1 });
    mocked.detectArticleImage.mockResolvedValue(null);
  });

  it('skips OpenAI analysis when the feed disables AI analysis', async () => {
    const { default: processArticle } = await import('../services/crawl/processArticle.js');

    const result = await processArticle(
      {
        id: 1,
        userId: 42,
        feedName: 'No AI feed',
        applyAiAnalysis: false
      },
      {},
      [],
      null,
      { count: () => 0 },
      null
    );

    expect(mocked.analyzeArticleContent).not.toHaveBeenCalled();
    expect(mocked.saveArticle).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        contentText: 'Article body with enough text to save.'
      }),
      {
        summary: null,
        contentSummaryBullets: [],
        tags: [],
        advertisementScore: 70,
        sentimentScore: 70,
        qualityScore: 70
      },
      expect.any(Object)
    );
    expect(result).toEqual({
      newArticles: 1,
      updatedArticles: 0,
      errors: 0
    });
  });

  it('skips article creation when duplicate matcher finds an existing article', async () => {
    const { default: processArticle } = await import('../services/crawl/processArticle.js');

    mocked.matchArticleDuplicate.mockResolvedValue({
      matchedArticleId: 99,
      reason: 'contentHash',
      scope: 'user',
      source: 'database'
    });
    const duplicateCache = {
      findByUserContentHash: vi.fn(),
      add: vi.fn()
    };

    const result = await processArticle(
      {
        id: 1,
        userId: 42,
        feedName: 'Windowed cache feed',
        applyAiAnalysis: false
      },
      {},
      [],
      duplicateCache,
      { count: () => 0 },
      null
    );

    expect(mocked.buildArticleIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        feed: expect.objectContaining({ id: 1, userId: 42 }),
        title: 'Article title',
        link: 'https://example.com/article',
        normalizedUrl: 'https://example.com/article',
        contentHash: 'content-hash',
        contentStrippedHash: 'content-stripped-hash'
      })
    );
    expect(mocked.matchArticleDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        feedId: 1,
        contentHash: 'content-hash',
        contentStrippedHash: 'content-stripped-hash'
      }),
      duplicateCache
    );
    expect(mocked.saveArticle).not.toHaveBeenCalled();
    expect(result).toEqual({
      newArticles: 0,
      updatedArticles: 1,
      errors: 0
    });
  });

  it('passes raw description HTML to content processing when content is missing', async () => {
    const { default: processArticle } = await import('../services/crawl/processArticle.js');

    mocked.extractEntryFields.mockReturnValue({
      title: 'Description-only article',
      link: 'https://example.com/description-only',
      content: null,
      description: '<p>Raw <strong>feed</strong> description</p>',
      categories: [],
      published: new Date('2026-07-01T00:00:00Z')
    });

    await processArticle(
      {
        id: 1,
        userId: 42,
        feedName: 'Description feed',
        applyAiAnalysis: false
      },
      {},
      [],
      null,
      { count: () => 0 },
      null
    );

    expect(mocked.processHtmlContent).toHaveBeenCalledWith(
      null,
      '<p>Raw <strong>feed</strong> description</p>',
      'https://example.com/description-only',
      expect.objectContaining({ id: 1, userId: 42 }),
      'Description-only article',
      null
    );
    expect(mocked.saveArticle).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        description: 'Raw feed description'
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('uses duplicate matcher hits without saving the article', async () => {
    const { default: processArticle } = await import('../services/crawl/processArticle.js');

    mocked.matchArticleDuplicate.mockResolvedValue({
      matchedArticleId: 100,
      reason: 'normalizedUrlHash',
      scope: 'feed',
      source: 'cache'
    });

    const result = await processArticle(
      {
        id: 1,
        userId: 42,
        feedName: 'Cached duplicate feed',
        applyAiAnalysis: false
      },
      {},
      [],
      { add: vi.fn() },
      { count: () => 0 },
      null
    );

    expect(mocked.saveArticle).not.toHaveBeenCalled();
    expect(result).toEqual({
      newArticles: 0,
      updatedArticles: 1,
      errors: 0
    });
  });

  it('uses feed-level published fallback when the entry has no date', async () => {
    const { default: processArticle } = await import('../services/crawl/processArticle.js');
    const feedFallback = '2026-07-08T10:00:00.000Z';

    mocked.extractEntryFields.mockReturnValue({
      title: 'Article title',
      link: 'https://example.com/article',
      content: '<p>Article body</p>',
      description: 'Article description',
      categories: ['AI'],
      published: null
    });

    await processArticle(
      {
        id: 1,
        userId: 42,
        feedName: 'Fallback date feed',
        applyAiAnalysis: false
      },
      {},
      [],
      null,
      { count: () => 0 },
      null,
      feedFallback
    );

    expect(mocked.resolveUrlPublishedDate).not.toHaveBeenCalled();
    expect(mocked.saveArticle).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        published: feedFallback,
        publishedSource: feedFallback,
        publishInferred: true
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('uses URL published fallback when entry and feed dates are missing', async () => {
    const { default: processArticle } = await import('../services/crawl/processArticle.js');
    const urlFallback = '2026-07-08T00:00:00.000Z';

    mocked.extractEntryFields.mockReturnValue({
      title: 'Article title',
      link: 'https://example.com/2026/07/08/article-title',
      content: '<p>Article body</p>',
      description: 'Article description',
      categories: ['AI'],
      published: null
    });
    mocked.resolveUrlPublishedDate.mockReturnValue(urlFallback);

    await processArticle(
      {
        id: 1,
        userId: 42,
        feedName: 'URL date feed',
        applyAiAnalysis: false
      },
      {},
      [],
      null,
      { count: () => 0 },
      null,
      null
    );

    expect(mocked.resolveUrlPublishedDate).toHaveBeenCalledWith('https://example.com/2026/07/08/article-title');
    expect(mocked.saveArticle).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        published: urlFallback,
        publishedSource: urlFallback,
        publishInferred: true
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });
});
