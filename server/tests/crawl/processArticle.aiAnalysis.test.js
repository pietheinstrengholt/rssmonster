import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  actionFindAll: vi.fn(),
  hotlinkCount: vi.fn(),
  hotlinkSetMany: vi.fn(),
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
  detectArticleImage: vi.fn(),
  updateArticle: vi.fn(),
  applyArticleUpdate: vi.fn(),
  resolveOfficialSourceForArticle: vi.fn(),
  languageGet: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Action: {
      findAll: mocked.actionFindAll
    },
    Hotlink: {
      count: mocked.hotlinkCount
    }
  }
}));

vi.mock('../../controllers/hotlink.js', () => ({
  default: {
    setMany: mocked.hotlinkSetMany
  }
}));

vi.mock('../../services/crawl/extraction/extractEntryFields.js', () => ({
  default: mocked.extractEntryFields,
  resolveUrlPublishedDate: mocked.resolveUrlPublishedDate
}));

vi.mock('../../services/crawl/identity/articleDuplicateMatcher.js', () => ({
  buildArticleIdentity: mocked.buildArticleIdentity,
  matchArticleDuplicate: mocked.matchArticleDuplicate
}));

vi.mock('../../services/crawl/media/processMedia.js', () => ({
  default: mocked.processMedia
}));

vi.mock('../../services/crawl/content/processHtmlContent.js', () => ({
  default: mocked.processHtmlContent
}));

vi.mock('../../services/crawl/enrichment/applyActions.js', () => ({
  default: mocked.applyActions
}));

vi.mock('../../services/crawl/enrichment/analyzeArticleContent.js', () => ({
  default: mocked.analyzeArticleContent
}));

vi.mock('../../services/crawl/persistence/saveArticle.js', () => ({
  default: mocked.saveArticle
}));

vi.mock('../../services/crawl/persistence/updateArticle.js', () => ({
  default: mocked.updateArticle,
  applyArticleUpdate: mocked.applyArticleUpdate
}));

vi.mock('../../services/crawl/enrichment/officialSource.js', () => ({
  createEmptyOfficialSource: () => ({
    isOfficialSource: false,
    officialOrganization: null
  }),
  resolveOfficialSourceForArticle: mocked.resolveOfficialSourceForArticle
}));

vi.mock('../../services/crawl/content/normalizeUrl.js', () => ({
  default: mocked.normalizeUrl
}));

vi.mock('../../utils/decodeHtmlEntities.js', () => ({
  default: mocked.decodeHtmlEntities
}));

vi.mock('../../services/crawl/media/detectArticleImage.js', () => ({
  default: mocked.detectArticleImage
}));

vi.mock('../../utils/language.js', () => ({
  default: { get: mocked.languageGet },
  get: mocked.languageGet
}));

// This function creates an explicit changed update plan for orchestration tests.
const changedUpdatePlan = (changes, updateValues = {}) => ({
  article: { id: 123 },
  matched: true,
  changed: true,
  changes: {
    contentChanged: false,
    titleChanged: false,
    descriptionChanged: false,
    authorChanged: false,
    publishedChanged: false,
    metadataChanged: false,
    urlChanged: false,
    mediaChanged: false,
    leadImageChanged: false,
    ...changes
  },
  updateValues: {
    contentSourceHash: 'content-hash',
    contentTextHash: 'content-html-hash',
    normalizedUrl: 'https://example.com/article',
    ...updateValues
  }
});

describe('processArticle AI analysis controls', () => {
  beforeEach(() => {
    Object.values(mocked).forEach(mock => {
      if (typeof mock?.mockReset === 'function') {
        mock.mockReset();
      }
    });

    mocked.normalizeUrl.mockImplementation(value => value);
    mocked.decodeHtmlEntities.mockImplementation(value => value);
    mocked.languageGet.mockReturnValue('eng');
    mocked.hotlinkSetMany.mockResolvedValue();
    mocked.resolveOfficialSourceForArticle.mockResolvedValue({
      isOfficialSource: false,
      officialOrganization: null
    });
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
      contentSourceHash: identity.contentSourceHash,
      contentTextHash: identity.contentTextHash,
      published: identity.published
    }));
    mocked.matchArticleDuplicate.mockResolvedValue(null);
    mocked.processMedia.mockReturnValue({});
    mocked.processHtmlContent.mockReturnValue({
      content: '<p>Article body</p>',
      html: 'Article body with enough text to save.',
      text: 'Article body with enough text to save.',
      language: 'en',
      contentSourceHash: 'content-hash',
      contentTextHash: 'content-html-hash',
      hotlinkUrls: [],
      title: 'Article title'
    });
    mocked.applyActions.mockReturnValue({
      shouldDiscard: false,
      status: 'unread',
      favoriteInd: false,
      clickedAmount: 0,
      hotInd: false,
      tags: [],
      advertisementScore: null,
      qualityScore: null
    });
    mocked.analyzeArticleContent.mockResolvedValue({
      contentSummaryBullets: ['Updated bullet'],
      tags: ['updated-generated'],
      advertisementScore: 80,
      sentimentScore: 90,
      qualityScore: 80
    });
    mocked.saveArticle.mockResolvedValue({
      article: { id: 1 },
      created: true
    });
    mocked.updateArticle.mockResolvedValue({
      article: null,
      matched: false,
      changed: false
    });
    mocked.applyArticleUpdate.mockImplementation(({ updatePlan }) =>
      Promise.resolve(updatePlan.article)
    );
    mocked.detectArticleImage.mockResolvedValue(null);
  });

  it('skips OpenAI analysis when the feed disables AI analysis', async () => {
    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');

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
    expect(mocked.processMedia).toHaveBeenCalledWith(
      {},
      '<p>Article body</p>',
      'https://example.com/article'
    );
    expect(mocked.resolveOfficialSourceForArticle).toHaveBeenCalledWith(
      42,
      'https://example.com/article'
    );
    expect(mocked.saveArticle).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        contentText: 'Article body with enough text to save.',
        isOfficialSource: false,
        officialOrganization: null
      }),
      {
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

  it('counts a concurrently committed winner as an update', async () => {
    const winner = { id: 99 };
    const duplicateCache = { add: vi.fn() };
    mocked.saveArticle.mockResolvedValue({ article: winner, created: false });
    mocked.updateArticle
      .mockResolvedValueOnce({ article: null, matched: false, changed: false })
      .mockResolvedValueOnce({
        article: winner,
        matched: true,
        changed: true,
        changes: {
          contentChanged: true,
          titleChanged: false,
          descriptionChanged: false,
          authorChanged: false,
          publishedChanged: false,
          metadataChanged: false,
          urlChanged: false,
          mediaChanged: false,
          leadImageChanged: false
        },
        updateValues: {
          contentSourceHash: 'content-hash',
          contentTextHash: 'content-html-hash'
        }
      });

    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
    const result = await processArticle(
      {
        id: 1,
        userId: 42,
        feedName: 'Concurrent feed',
        applyAiAnalysis: false
      },
      {},
      [],
      duplicateCache,
      { count: () => 0 },
      null
    );

    expect(mocked.updateArticle).toHaveBeenCalledTimes(2);
    expect(mocked.updateArticle).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ id: 1, userId: 42 }),
      expect.objectContaining({ contentOriginal: '<p>Article body</p>' }),
      { article: winner }
    );
    expect(duplicateCache.add).toHaveBeenCalledWith(winner);
    expect(result).toMatchObject({
      newArticles: 0,
      updatedArticles: 1,
      errors: 0
    });
  });

  it('persists collected hotlinks only after a new article is saved', async () => {
    const hotlinkUrls = ['https://outside.example/story'];
    mocked.processHtmlContent.mockReturnValue({
      content: '<p>Article body</p>',
      html: '<p>Article body</p>',
      text: 'Article body',
      language: 'en',
      contentSourceHash: 'content-hash',
      contentTextHash: 'content-text-hash',
      hotlinkUrls,
      title: 'Article title'
    });

    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
    const result = await processArticle(
      { id: 1, userId: 42, feedName: 'Accepted feed', applyAiAnalysis: false },
      {},
      [],
      null,
      { count: () => 0 },
      null
    );

    expect(mocked.hotlinkSetMany).toHaveBeenCalledWith(hotlinkUrls, 1, 42);
    expect(mocked.saveArticle.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.hotlinkSetMany.mock.invocationCallOrder[0]
    );
    expect(result).toEqual({ newArticles: 1, updatedArticles: 0, errors: 0 });
  });

  it('generates a missing article title from content before RSS feed metadata', async () => {
    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');

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
      html: '<p>Body sentence. More body.</p>',
      text: 'Body sentence. More body.',
      language: 'en',
      contentSourceHash: 'content-hash',
      contentTextHash: 'content-html-hash',
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
      expect.objectContaining({ title: 'Body sentence.' }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('uses description before RSS feed metadata when content text is missing', async () => {
    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');

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
      null,
      null,
      'Social Feed. Latest posts.'
    );

    expect(mocked.saveArticle).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ title: 'Description title.' }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('uses RSS feed metadata when the description contains only markup', async () => {
    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');

    mocked.extractEntryFields.mockReturnValue({
      title: 'Untitled',
      link: 'https://example.com/markup-only-description',
      content: null,
      description: '<p><br><img src="https://example.com/pixel.gif"></p>',
      categories: [],
      published: new Date('2026-07-01T00:00:00Z')
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

  it('falls back to content text when feed title and description are missing', async () => {
    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');

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
      html: '<p>Content title? More content.</p>',
      text: 'Content title? More content.',
      language: 'en',
      contentSourceHash: 'content-hash',
      contentTextHash: 'content-html-hash',
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

  it('updates and reactivates an externally identified article before duplicate checks', async () => {
    const hotlinkBatcher = { add: vi.fn() };
    const duplicateCache = { update: vi.fn() };
    const storedArticle = {
      id: 123,
      urlHash: 'old-url-hash',
      normalizedUrlHash: 'old-normalized-url-hash',
      title: 'Old article title',
      published: new Date('2026-07-01T00:00:00Z'),
      contentTextHash: 'old-text-hash',
      contentSourceHash: 'old-source-hash',
      filteredInd: true
    };
    mocked.applyActions.mockReturnValue({
      shouldDiscard: false,
      status: 'read',
      favoriteInd: 1,
      clickedAmount: 1,
      tags: ['updated-rule'],
      advertisementScore: 0,
      qualityScore: 0
    });
    mocked.processHtmlContent.mockReturnValue({
      content: '<p>Article body</p>',
      html: '<p>Article body</p>',
      text: 'Article body',
      language: 'en',
      contentSourceHash: 'content-hash',
      contentTextHash: 'content-html-hash',
      hotlinkUrls: ['https://outside.example/updated'],
      title: 'Article title'
    });
    mocked.updateArticle.mockResolvedValue({
      article: storedArticle,
      matched: true,
      changed: true,
      changes: {
        contentChanged: true,
        titleChanged: false,
        descriptionChanged: false,
        authorChanged: false,
        publishedChanged: false,
        metadataChanged: false,
        urlChanged: false,
        mediaChanged: false,
        leadImageChanged: false
      },
      updateValues: {
        contentSourceHash: 'content-hash',
        contentTextHash: 'content-html-hash'
      }
    });

    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
    const result = await processArticle(
      {
        id: 1,
        userId: 42,
        feedName: 'Update feed'
      },
      {
        externalId: 'article-6402680',
        externalIdType: 'guid'
      },
      [],
      duplicateCache,
      { count: () => 0 },
      hotlinkBatcher
    );

    expect(mocked.updateArticle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, userId: 42 }),
      expect.objectContaining({
        externalId: 'article-6402680',
        externalIdType: 'guid',
        contentSourceHash: 'content-hash'
      })
    );
    expect(mocked.matchArticleDuplicate).not.toHaveBeenCalled();
    expect(mocked.applyActions).toHaveBeenCalled();
    expect(mocked.analyzeArticleContent).toHaveBeenCalled();
    expect(mocked.hotlinkCount).not.toHaveBeenCalled();
    expect(mocked.saveArticle).not.toHaveBeenCalled();
    expect(mocked.applyArticleUpdate).toHaveBeenCalledWith(expect.objectContaining({
      derivedValues: expect.objectContaining({
        filteredInd: false,
        contentSummaryBullets: ['Updated bullet'],
        advertisementScore: 0,
        sentimentScore: 90,
        qualityScore: 0
      }),
      tagUpdates: {
        generatedTags: ['updated-generated'],
        feedTags: undefined,
        ruleTags: ['updated-rule']
      },
      userId: 42
    }));
    expect(duplicateCache.update).toHaveBeenCalledWith({
      id: 123,
      filteredInd: true,
      urlHash: 'old-url-hash',
      normalizedUrlHash: 'old-normalized-url-hash',
      title: 'Old article title',
      published: new Date('2026-07-01T00:00:00Z'),
      contentTextHash: 'old-text-hash',
      contentSourceHash: 'old-source-hash'
    }, storedArticle);
    expect(mocked.applyArticleUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      duplicateCache.update.mock.invocationCallOrder[0]
    );
    expect(hotlinkBatcher.add).toHaveBeenCalledWith(['https://outside.example/updated']);
    expect(mocked.updateArticle.mock.invocationCallOrder[0]).toBeLessThan(
      hotlinkBatcher.add.mock.invocationCallOrder[0]
    );
    expect(result).toMatchObject({
      newArticles: 0,
      updatedArticles: 1,
      errors: 0
    });
    expect(result).not.toHaveProperty('semanticUpdate');
    const derivedValues = mocked.applyArticleUpdate.mock.calls[0][0].derivedValues;
    expect(derivedValues.filteredInd).toBe(false);
    expect(derivedValues).not.toHaveProperty('articleVector');
    expect(derivedValues).not.toHaveProperty('embedding_model');
    expect(derivedValues).not.toHaveProperty('eventId');
    expect(derivedValues).not.toHaveProperty('topicId');
  });

  it('does not count an unchanged externally identified article as updated', async () => {
    const hotlinkBatcher = { add: vi.fn() };
    mocked.processHtmlContent.mockReturnValue({
      content: '<p>Article body</p>',
      html: '<p>Article body</p>',
      text: 'Article body',
      language: 'en',
      contentSourceHash: 'content-hash',
      contentTextHash: 'content-html-hash',
      hotlinkUrls: ['https://outside.example/unchanged'],
      title: 'Article title'
    });
    mocked.updateArticle.mockResolvedValue({
      article: { id: 123 },
      matched: true,
      changed: false
    });

    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
    const result = await processArticle(
      { id: 1, userId: 42 },
      { externalId: 'article-6402680', externalIdType: 'guid' },
      [],
      null,
      { count: () => 0 },
      hotlinkBatcher
    );

    expect(mocked.matchArticleDuplicate).not.toHaveBeenCalled();
    expect(mocked.analyzeArticleContent).not.toHaveBeenCalled();
    expect(mocked.saveArticle).not.toHaveBeenCalled();
    expect(hotlinkBatcher.add).not.toHaveBeenCalled();
    expect(mocked.hotlinkSetMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      newArticles: 0,
      updatedArticles: 0,
      errors: 0
    });
  });

  it('reruns actions and analysis for a title-only publisher update', async () => {
    mocked.updateArticle.mockResolvedValue(changedUpdatePlan({
      titleChanged: true,
      metadataChanged: true
    }));

    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
    const result = await processArticle(
      { id: 1, userId: 42, feedName: 'Title update feed' },
      {},
      [],
      null,
      { count: () => 0 },
      null
    );

    expect(mocked.applyActions).toHaveBeenCalledTimes(1);
    expect(mocked.applyActions).toHaveBeenCalledWith([], {
      title: 'Article title',
      contentHtml: 'Article body with enough text to save.',
      contentText: 'Article body with enough text to save.',
      description: 'Article description',
      url: 'https://example.com/article'
    });
    expect(mocked.analyzeArticleContent).toHaveBeenCalledTimes(1);
    expect(mocked.applyArticleUpdate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ updatedArticles: 1, errors: 0 });
  });

  it('updates an author-only change without rerunning actions or analysis', async () => {
    mocked.updateArticle.mockResolvedValue(changedUpdatePlan({
      authorChanged: true,
      metadataChanged: true
    }, { author: 'Revised author' }));

    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
    const result = await processArticle(
      { id: 1, userId: 42, feedName: 'Author update feed' },
      {},
      [],
      null,
      { count: () => 0 },
      null
    );

    expect(mocked.applyActions).not.toHaveBeenCalled();
    expect(mocked.analyzeArticleContent).not.toHaveBeenCalled();
    expect(mocked.applyArticleUpdate).toHaveBeenCalledWith(expect.objectContaining({
      derivedValues: {},
      tagUpdates: null
    }));
    expect(result).toMatchObject({ updatedArticles: 1, errors: 0 });
    expect(result).not.toHaveProperty('semanticUpdate');
  });

  it('refreshes official-source and hotlink state for a URL-only change without AI analysis', async () => {
    mocked.extractEntryFields.mockReturnValue({
      title: 'Article title',
      link: 'https://official.example/revised',
      content: '<p>Article body</p>',
      description: 'Article description',
      categories: ['AI'],
      published: new Date('2026-07-01T00:00:00Z')
    });
    mocked.updateArticle.mockResolvedValue(changedUpdatePlan({ urlChanged: true }, {
      url: 'https://official.example/revised',
      normalizedUrl: 'https://official.example/revised'
    }));
    mocked.resolveOfficialSourceForArticle.mockResolvedValue({
      isOfficialSource: true,
      officialOrganization: 'Example Organization'
    });
    const hotlinkCountCache = { count: vi.fn(() => 3) };

    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
    const result = await processArticle(
      { id: 1, userId: 42, feedName: 'URL update feed' },
      {},
      [],
      null,
      hotlinkCountCache,
      null
    );

    expect(mocked.analyzeArticleContent).not.toHaveBeenCalled();
    expect(mocked.applyActions).toHaveBeenCalledWith([], {
      title: 'Article title',
      contentHtml: 'Article body with enough text to save.',
      contentText: 'Article body with enough text to save.',
      description: 'Article description',
      url: 'https://official.example/revised'
    });
    expect(mocked.resolveOfficialSourceForArticle).toHaveBeenCalledWith(
      42,
      'https://official.example/revised'
    );
    expect(hotlinkCountCache.count).toHaveBeenCalledWith(
      'https://official.example/revised',
      1
    );
    expect(mocked.applyArticleUpdate).toHaveBeenCalledWith(expect.objectContaining({
      derivedValues: expect.objectContaining({
        isOfficialSource: true,
        officialOrganization: 'Example Organization',
        hotInd: true,
        hotlinks: 3
      })
    }));
    expect(result).toMatchObject({ updatedArticles: 1, errors: 0 });
    expect(result).not.toHaveProperty('semanticUpdate');
  });

  it.each([
    ['media', { mediaChanged: true }],
    ['lead image', { leadImageChanged: true }]
  ])('persists a %s-only change without rerunning AI analysis', async (_name, changes) => {
    mocked.updateArticle.mockResolvedValue(changedUpdatePlan(changes));

    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
    await processArticle(
      { id: 1, userId: 42, feedName: 'Media update feed' },
      {},
      [],
      null,
      { count: () => 0 },
      null
    );

    expect(mocked.applyActions).not.toHaveBeenCalled();
    expect(mocked.analyzeArticleContent).not.toHaveBeenCalled();
    expect(mocked.applyArticleUpdate).toHaveBeenCalledTimes(1);
  });

  it('uses fresh default derived analysis for changed content when AI is disabled', async () => {
    mocked.updateArticle.mockResolvedValue(changedUpdatePlan({ contentChanged: true }));

    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
    await processArticle(
      {
        id: 1,
        userId: 42,
        feedName: 'AI-disabled update feed',
        applyAiAnalysis: false
      },
      {},
      [],
      null,
      { count: () => 0 },
      null
    );

    expect(mocked.analyzeArticleContent).not.toHaveBeenCalled();
    expect(mocked.applyArticleUpdate).toHaveBeenCalledWith(expect.objectContaining({
      derivedValues: expect.objectContaining({
        contentSummaryBullets: [],
        advertisementScore: 70,
        sentimentScore: 70,
        qualityScore: 70
      }),
      tagUpdates: expect.objectContaining({ generatedTags: [] })
    }));
  });

  it('persists only source fields when a changed existing article matches a discard rule', async () => {
    const updatePlan = changedUpdatePlan({
      contentChanged: true,
      urlChanged: true
    });
    updatePlan.article.status = 'read';
    mocked.updateArticle.mockResolvedValue(updatePlan);
    mocked.applyActions.mockReturnValue({
      shouldDiscard: true,
      status: 'unread',
      favoriteInd: 0,
      clickedAmount: 0,
      tags: ['ignored-rule-tag'],
      advertisementScore: 100,
      qualityScore: 100
    });
    mocked.processHtmlContent.mockReturnValue({
      content: '<p>Rejected update</p>',
      html: '<p>Rejected update</p>',
      text: 'Rejected update',
      language: 'en',
      contentSourceHash: 'rejected-update-hash',
      contentTextHash: 'rejected-update-text-hash',
      hotlinkUrls: ['https://outside.example/rejected-update'],
      title: 'Article title'
    });
    const hotlinkBatcher = { add: vi.fn() };
    const hotlinkCountCache = { count: vi.fn() };

    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
    const result = await processArticle(
      {
        id: 1,
        userId: 42,
        feedName: 'Existing discard-rule feed'
      },
      {},
      [],
      null,
      hotlinkCountCache,
      hotlinkBatcher
    );

    expect(mocked.saveArticle).not.toHaveBeenCalled();
    expect(mocked.analyzeArticleContent).not.toHaveBeenCalled();
    expect(mocked.resolveOfficialSourceForArticle).not.toHaveBeenCalled();
    expect(hotlinkCountCache.count).not.toHaveBeenCalled();
    expect(mocked.applyArticleUpdate).toHaveBeenCalledWith(expect.objectContaining({
      derivedValues: { filteredInd: true },
      tagUpdates: null,
      userId: 42
    }));
    expect(hotlinkBatcher.add).not.toHaveBeenCalled();
    expect(mocked.hotlinkSetMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      updatedArticles: 1,
      errors: 0
    });
    expect(result.article.status).toBe('read');
    expect(result).not.toHaveProperty('semanticUpdate');
  });

  it('skips article creation when duplicate matcher finds an existing article', async () => {
    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
    const hotlinkBatcher = { add: vi.fn() };

    mocked.processHtmlContent.mockReturnValue({
      content: '<p>Article body</p>',
      html: '<p>Article body</p>',
      text: 'Article body',
      language: 'en',
      contentSourceHash: 'content-hash',
      contentTextHash: 'content-html-hash',
      hotlinkUrls: ['https://outside.example/duplicate'],
      title: 'Article title'
    });

    mocked.matchArticleDuplicate.mockResolvedValue({
      matchedArticleId: 99,
      reason: 'contentSourceHash',
      scope: 'user',
      source: 'database'
    });
    const duplicateCache = {
      findByUserContentSourceHash: vi.fn(),
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
      hotlinkBatcher
    );

    expect(mocked.buildArticleIdentity).toHaveBeenCalledWith(
      expect.objectContaining({
        feed: expect.objectContaining({ id: 1, userId: 42 }),
        title: 'Article title',
        link: 'https://example.com/article',
        normalizedUrl: 'https://example.com/article',
        contentSourceHash: 'content-hash',
        contentTextHash: 'content-html-hash'
      })
    );
    expect(mocked.matchArticleDuplicate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 42,
        feedId: 1,
        contentSourceHash: 'content-hash',
        contentTextHash: 'content-html-hash'
      }),
      duplicateCache
    );
    expect(mocked.saveArticle).not.toHaveBeenCalled();
    expect(hotlinkBatcher.add).not.toHaveBeenCalled();
    expect(mocked.hotlinkSetMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      newArticles: 0,
      updatedArticles: 0,
      errors: 0
    });
  });

  it('persists a discard-matched article without enrichment or hotlinks', async () => {
    const hotlinkBatcher = { add: vi.fn() };
    mocked.processHtmlContent.mockReturnValue({
      content: '<p>Rejected body</p>',
      html: '<p>Rejected body</p>',
      text: 'Rejected body',
      language: 'en',
      contentSourceHash: 'rejected-content-hash',
      contentTextHash: 'rejected-text-hash',
      hotlinkUrls: ['https://outside.example/rejected'],
      title: 'Rejected article'
    });
    mocked.applyActions.mockReturnValue({
      shouldDiscard: true,
      status: 'unread',
      filteredInd: false,
      favoriteInd: false,
      clickedAmount: 0,
      hotInd: false,
      tags: [],
      advertisementScore: null,
      qualityScore: null
    });

    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
    const result = await processArticle(
      { id: 1, userId: 42, feedName: 'Rule feed', applyAiAnalysis: false },
      {},
      [],
      null,
      { count: () => 0 },
      hotlinkBatcher
    );

    expect(mocked.analyzeArticleContent).not.toHaveBeenCalled();
    expect(mocked.resolveOfficialSourceForArticle).not.toHaveBeenCalled();
    expect(mocked.saveArticle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, userId: 42 }),
      expect.objectContaining({
        contentOriginal: '<p>Rejected body</p>',
        contentHtml: '<p>Rejected body</p>',
        contentText: 'Rejected body',
        contentSourceHash: 'rejected-content-hash',
        contentTextHash: 'rejected-text-hash',
        isOfficialSource: false,
        officialOrganization: null
      }),
      null,
      expect.objectContaining({
        shouldDiscard: true,
        status: 'unread',
        filteredInd: false
      })
    );
    expect(mocked.hotlinkCount).not.toHaveBeenCalled();
    expect(hotlinkBatcher.add).not.toHaveBeenCalled();
    expect(mocked.hotlinkSetMany).not.toHaveBeenCalled();
    expect(result).toEqual({ newArticles: 1, updatedArticles: 0, errors: 0 });
  });

  it('does not persist hotlinks when article persistence fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hotlinkBatcher = { add: vi.fn() };
    mocked.processHtmlContent.mockReturnValue({
      content: '<p>Failed body</p>',
      html: '<p>Failed body</p>',
      text: 'Failed body',
      language: 'en',
      contentSourceHash: 'failed-content-hash',
      contentTextHash: 'failed-text-hash',
      hotlinkUrls: ['https://outside.example/failed'],
      title: 'Failed article'
    });
    mocked.saveArticle.mockRejectedValue(new Error('Article insert failed'));

    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
    const result = await processArticle(
      { id: 1, userId: 42, feedName: 'Failed feed', applyAiAnalysis: false },
      {},
      [],
      null,
      { count: () => 0 },
      hotlinkBatcher
    );

    expect(hotlinkBatcher.add).not.toHaveBeenCalled();
    expect(mocked.hotlinkSetMany).not.toHaveBeenCalled();
    expect(result).toEqual({ newArticles: 0, updatedArticles: 0, errors: 1 });
    consoleError.mockRestore();
  });

  it('keeps description HTML separate while using its text for enrichment', async () => {
    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');

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
        feedName: 'Description feed'
      },
      {},
      [],
      null,
      { count: () => 0 },
      null
    );

    expect(mocked.processHtmlContent).not.toHaveBeenCalled();
    expect(mocked.languageGet).toHaveBeenCalledWith('Raw feed description');
    expect(mocked.applyActions).toHaveBeenCalledWith([], {
      title: 'Description-only article',
      contentHtml: '<p>Raw feed description</p>',
      contentText: 'Raw feed description',
      description: '<p>Raw <strong>feed</strong> description</p>',
      url: 'https://example.com/description-only'
    });
    expect(mocked.analyzeArticleContent).toHaveBeenCalledWith({
      text: 'Raw feed description',
      title: 'Description-only article',
      categories: [],
      feedName: 'Description feed',
      rateLimitDelayMs: 3000
    });
    expect(mocked.saveArticle).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        contentOriginal: null,
        contentHtml: null,
        contentText: 'Raw feed description',
        contentSourceHash: null,
        contentTextHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        language: 'eng',
        description: '<p>Raw <strong>feed</strong> description</p>'
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('uses revised description-only text for matched update enrichment', async () => {
    const description = 'Updated description text used for all enrichment.';
    mocked.extractEntryFields.mockReturnValue({
      title: 'Description update',
      link: 'https://example.com/description-update',
      content: null,
      description,
      categories: ['Updates'],
      published: new Date('2026-07-01T00:00:00Z')
    });
    mocked.updateArticle.mockResolvedValue(changedUpdatePlan({
      descriptionChanged: true,
      metadataChanged: true
    }, {
      description,
      contentText: description,
      contentTextHash: 'updated-description-hash',
      language: 'eng'
    }));

    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
    const result = await processArticle(
      { id: 1, userId: 42, feedName: 'Description update feed' },
      {},
      [],
      null,
      { count: () => 0 },
      null
    );

    expect(mocked.applyActions).toHaveBeenCalledWith([], {
      title: 'Description update',
      contentHtml: `<p>${description}</p>`,
      contentText: description,
      description,
      url: 'https://example.com/description-update'
    });
    expect(mocked.analyzeArticleContent).toHaveBeenCalledWith({
      text: description,
      title: 'Description update',
      categories: ['Updates'],
      feedName: 'Description update feed',
      rateLimitDelayMs: 3000
    });
    expect(mocked.applyArticleUpdate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ updatedArticles: 1, errors: 0 });
  });

  it('saves an entry whose only content is a single lead image', async () => {
    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
    const leadImage = {
      url: 'https://cdn.example/photo.jpg',
      width: 1600,
      height: 900,
      mimeType: 'image/jpeg',
      source: 'enclosure'
    };

    mocked.extractEntryFields.mockReturnValue({
      title: 'Photo of the day',
      link: 'https://example.com/photo-of-the-day',
      content: null,
      description: null,
      categories: ['Photography'],
      published: new Date('2026-07-01T00:00:00Z')
    });
    mocked.processMedia.mockReturnValue(null);
    mocked.detectArticleImage.mockResolvedValue(leadImage);

    const result = await processArticle(
      {
        id: 1,
        userId: 42,
        feedName: 'Photography feed',
        applyAiAnalysis: false
      },
      {
        imageCandidates: [leadImage]
      },
      [],
      null,
      { count: () => 0 },
      null
    );

    expect(mocked.processHtmlContent).not.toHaveBeenCalled();
    expect(mocked.updateArticle).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        contentOriginal: null,
        contentText: null,
        contentTextHash: null,
        description: null,
        media: null,
        leadImage
      })
    );
    expect(mocked.saveArticle).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        leadImage,
        contentText: null,
        contentTextHash: null
      }),
      expect.any(Object),
      expect.any(Object)
    );
    expect(result).toEqual({
      newArticles: 1,
      updatedArticles: 0,
      errors: 0
    });
  });

  it('passes feed description through unchanged when body content is present', async () => {
    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');

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
      'Article with description'
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

  it('decodes only title text while preserving HTML-bearing fields for parsing', async () => {
    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
    const content = '<p>Use &lt;script&gt; for this example</p>';
    const description = '<p>Summary &lt;strong&gt; text</p>';

    mocked.extractEntryFields.mockReturnValue({
      title: 'Tom &amp; Jerry',
      link: 'https://example.com/encoded-markup',
      content,
      description,
      categories: [],
      published: new Date('2026-07-01T00:00:00Z')
    });
    mocked.decodeHtmlEntities.mockImplementation(value => value.replace('&amp;', '&'));
    mocked.processHtmlContent.mockReturnValue({
      content,
      html: '<p>Use &lt;script&gt; for this example</p>',
      text: 'Use <script> for this example',
      language: 'en',
      contentSourceHash: 'content-hash',
      contentTextHash: 'content-text-hash',
      title: 'Tom & Jerry'
    });

    await processArticle(
      {
        id: 1,
        userId: 42,
        feedName: 'Encoded markup feed',
        applyAiAnalysis: false
      },
      {},
      [],
      null,
      { count: () => 0 },
      null
    );

    expect(mocked.decodeHtmlEntities).toHaveBeenCalledOnce();
    expect(mocked.decodeHtmlEntities).toHaveBeenCalledWith('Tom &amp; Jerry');
    expect(mocked.processMedia).toHaveBeenCalledWith(
      {},
      content,
      'https://example.com/encoded-markup'
    );
    expect(mocked.processHtmlContent).toHaveBeenCalledWith(
      content,
      null,
      'https://example.com/encoded-markup',
      expect.any(Object),
      'Tom & Jerry'
    );
    expect(mocked.detectArticleImage).toHaveBeenCalledWith(
      expect.objectContaining({ content, description })
    );
    expect(mocked.saveArticle).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        title: 'Tom & Jerry',
        contentOriginal: content,
        description
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('appends the description when sanitized content contains an image but no body text', async () => {
    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
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
      html: imageContent,
      text: '',
      language: 'unknown',
      contentSourceHash: 'empty-content-hash',
      contentTextHash: 'empty-content-html-hash',
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
        contentHtml: '<div> <img src="https://example.com/disruption.jpg" loading="lazy" /> </div>' +
          `<p>${description}</p>`,
        contentText: description,
        contentTextHash: expect.stringMatching(/^[a-f0-9]{64}$/)
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('uses duplicate matcher hits without saving the article', async () => {
    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');

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
      updatedArticles: 0,
      errors: 0
    });
  });

  it('uses feed-level published fallback when the entry has no date', async () => {
    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
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
    const { default: processArticle } = await import('../../services/crawl/orchestration/processArticle.js');
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
