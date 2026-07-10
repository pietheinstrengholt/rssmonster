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

  it('generates a missing article title from RSS feed metadata first', async () => {
    const { default: processArticle } = await import('../services/crawl/processArticle.js');

    mocked.extractEntryFields.mockReturnValue({
      title: 'Untitled',
      link: 'https://example.com/social-post',
      content: '<p>Body sentence. More body.</p>',
      description: 'Description sentence. More description.',
      categories: [],
      published: new Date('2026-07-01T00:00:00Z')
    });
    mocked.processHtmlContent.mockReturnValue({
      content: '<p>Body sentence. More body.</p>',
      stripped: '<p>Body sentence. More body.</p>',
      text: 'Body sentence. More body.',
      language: 'en',
      contentHash: 'content-hash',
      contentStrippedHash: 'content-stripped-hash',
      title: 'Body sentence.'
    });

    await processArticle(
      { id: 1, userId: 42, feedName: 'Saved feed name', applyAiAnalysis: false },
      {},
      [],
      null,
      { count: () => 0 },
      null,
      null,
      'Social Feed. Latest posts.'
    );

    expect(mocked.saveArticle).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ title: 'Social Feed.' }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('falls back to description when RSS feed metadata has no title', async () => {
    const { default: processArticle } = await import('../services/crawl/processArticle.js');

    mocked.extractEntryFields.mockReturnValue({
      title: 'Untitled',
      link: 'https://example.com/social-description',
      content: null,
      description: '<p>Description title. More description.</p>',
      categories: [],
      published: new Date('2026-07-01T00:00:00Z')
    });

    await processArticle(
      { id: 1, userId: 42, feedName: 'Saved feed name', applyAiAnalysis: false },
      {},
      [],
      null,
      { count: () => 0 },
      null
    );

    expect(mocked.saveArticle).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ title: 'Description title.' }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('falls back to content text when feed title and description are missing', async () => {
    const { default: processArticle } = await import('../services/crawl/processArticle.js');

    mocked.extractEntryFields.mockReturnValue({
      title: 'Untitled',
      link: 'https://example.com/social-content',
      content: '<p>Content title? More content.</p>',
      description: null,
      categories: [],
      published: new Date('2026-07-01T00:00:00Z')
    });
    mocked.processHtmlContent.mockReturnValue({
      content: '<p>Content title? More content.</p>',
      stripped: '<p>Content title? More content.</p>',
      text: 'Content title? More content.',
      language: 'en',
      contentHash: 'content-hash',
      contentStrippedHash: 'content-stripped-hash',
      title: 'Content title?'
    });

    await processArticle(
      { id: 1, userId: 42, feedName: 'Saved feed name', applyAiAnalysis: false },
      {},
      [],
      null,
      { count: () => 0 },
      null
    );

    expect(mocked.saveArticle).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ title: 'Content title?' }),
      expect.any(Object),
      expect.any(Object)
    );
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

  it('keeps description separate when content is missing', async () => {
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

    expect(mocked.processHtmlContent).not.toHaveBeenCalled();
    expect(mocked.saveArticle).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        contentOriginal: null,
        contentStripped: null,
        contentText: null,
        description: '<p>Raw <strong>feed</strong> description</p>'
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('passes feed description through unchanged when body content is present', async () => {
    const { default: processArticle } = await import('../services/crawl/processArticle.js');

    mocked.extractEntryFields.mockReturnValue({
      title: 'Article with description',
      link: 'https://example.com/article-with-description',
      content: '<p>Article body</p>',
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
      '<p>Article body</p>',
      null,
      'https://example.com/article-with-description',
      expect.objectContaining({ id: 1, userId: 42 }),
      'Article with description',
      null
    );
    expect(mocked.saveArticle).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        description: '<p>Raw <strong>feed</strong> description</p>'
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('appends the description when sanitized content contains an image but no body text', async () => {
    const { default: processArticle } = await import('../services/crawl/processArticle.js');
    const imageContent = '<div class="media-content enclosure"> <img src="https://example.com/disruption.jpg" loading="lazy"> </div>';
    const description = 'Door een stroomstoring rijden er geen treinen.';

    mocked.extractEntryFields.mockReturnValue({
      title: 'Treinverkeer onderbroken',
      link: 'https://example.com/stroomstoring',
      content: '<img src="https://example.com/disruption.jpg">',
      description,
      categories: [],
      published: new Date('2026-07-01T00:00:00Z')
    });
    mocked.processHtmlContent.mockReturnValue({
      content: '<img src="https://example.com/disruption.jpg">',
      stripped: imageContent,
      text: '',
      language: 'unknown',
      contentHash: 'empty-content-hash',
      contentStrippedHash: 'empty-content-stripped-hash',
      title: 'Treinverkeer onderbroken'
    });

    await processArticle(
      {
        id: 1,
        userId: 42,
        feedName: 'Disruption feed',
        applyAiAnalysis: false
      },
      {},
      [],
      null,
      { count: () => 0 },
      null
    );

    expect(mocked.saveArticle).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        contentStripped: `${imageContent}<p id="description">${description}</p>`,
        contentText: description,
        contentStrippedHash: expect.stringMatching(/^[a-f0-9]{64}$/)
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
