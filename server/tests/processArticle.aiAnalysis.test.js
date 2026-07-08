import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  actionFindAll: vi.fn(),
  hotlinkCount: vi.fn(),
  extractEntryFields: vi.fn(),
  resolveUrlPublishedDate: vi.fn(),
  findExistingArticle: vi.fn(),
  processMedia: vi.fn(),
  processHtmlContent: vi.fn(),
  applyActions: vi.fn(),
  analyzeArticleContent: vi.fn(),
  saveArticle: vi.fn(),
  normalizeUrl: vi.fn(value => value),
  decodeHtmlEntities: vi.fn(value => value),
  extractLeadImage: vi.fn()
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

vi.mock('../services/crawl/findExistingArticle.js', () => ({
  default: mocked.findExistingArticle
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

vi.mock('../utils/extractLeadImage.js', () => ({
  default: mocked.extractLeadImage
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
    mocked.findExistingArticle.mockResolvedValue(null);
    mocked.processMedia.mockReturnValue({});
    mocked.processHtmlContent.mockReturnValue({
      content: '<p>Article body</p>',
      stripped: 'Article body with enough text to save.',
      language: 'en',
      contentHash: 'content-hash',
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
      expect.any(Object),
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

  it('falls back to the database when the duplicate cache misses', async () => {
    const { default: processArticle } = await import('../services/crawl/processArticle.js');

    mocked.findExistingArticle.mockResolvedValue({ id: 99 });

    const result = await processArticle(
      {
        id: 1,
        userId: 42,
        feedName: 'Windowed cache feed',
        applyAiAnalysis: false
      },
      {},
      [],
      {
        find: vi.fn(() => null),
        add: vi.fn()
      },
      { count: () => 0 },
      null
    );

    expect(mocked.findExistingArticle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, userId: 42 }),
      'Article title',
      'https://example.com/article',
      'content-hash',
      'https://example.com/article'
    );
    expect(mocked.saveArticle).not.toHaveBeenCalled();
    expect(result).toEqual({
      newArticles: 0,
      updatedArticles: 1,
      errors: 0
    });
  });

  it('uses duplicate cache hits without querying the database', async () => {
    const { default: processArticle } = await import('../services/crawl/processArticle.js');

    const result = await processArticle(
      {
        id: 1,
        userId: 42,
        feedName: 'Cached duplicate feed',
        applyAiAnalysis: false
      },
      {},
      [],
      {
        find: vi.fn(() => ({ id: 100 })),
        add: vi.fn()
      },
      { count: () => 0 },
      null
    );

    expect(mocked.findExistingArticle).not.toHaveBeenCalled();
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
