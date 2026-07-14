import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  articleFindOne: vi.fn(),
  articleUpdate: vi.fn(),
  replaceArticleDerivedTags: vi.fn(),
  sequelizeTransaction: vi.fn(),
  transaction: { id: 'article-update-transaction' }
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: {
      findOne: mocked.articleFindOne
    },
    sequelize: {
      transaction: mocked.sequelizeTransaction
    }
  }
}));

vi.mock('../../services/crawl/tags.js', () => ({
  replaceArticleDerivedTags: mocked.replaceArticleDerivedTags
}));

// This function returns complete stored source state for deterministic update tests.
const storedArticle = (overrides = {}) => ({
  id: 123,
  userId: 42,
  feedId: 7,
  url: 'https://example.com/article',
  normalizedUrl: 'https://example.com/article',
  imageUrl: 'https://example.com/image.jpg',
  imageWidth: 1200,
  imageHeight: 675,
  imageMimeType: 'image/jpeg',
  imageSource: 'content',
  media: { type: 'video', url: 'https://video.example/watch/1', views: 10 },
  title: 'Article title',
  author: 'Article author',
  description: 'Article description',
  contentOriginal: '<p>Article body</p>',
  contentHtml: '<p>Article body</p>',
  contentText: 'Article body',
  contentSourceHash: 'source-hash',
  contentTextHash: 'text-hash',
  language: 'en',
  published: new Date('2026-07-13T13:30:00Z'),
  publishedSource: null,
  publishInferred: false,
  update: mocked.articleUpdate,
  ...overrides
});

// This function returns incoming source data equal to storedArticle by default.
const incomingArticle = (overrides = {}) => ({
  externalId: 'publisher-id',
  externalIdType: 'guid',
  link: 'https://example.com/article',
  normalizedUrl: 'https://example.com/article',
  leadImage: {
    url: 'https://example.com/image.jpg',
    width: 1200,
    height: 675,
    mimeType: 'image/jpeg',
    source: 'content'
  },
  media: { views: 10, url: 'https://video.example/watch/1', type: 'video' },
  title: 'Article title',
  author: 'Article author',
  description: 'Article description',
  contentOriginal: '<p>Article body</p>',
  contentHtml: '<p>Article body</p>',
  contentText: 'Article body',
  contentSourceHash: 'source-hash',
  contentTextHash: 'text-hash',
  language: 'en',
  published: '2026-07-13T13:30:00.000Z',
  publishedSource: null,
  publishInferred: false,
  ...overrides
});

describe('updateArticle', () => {
  beforeEach(() => {
    Object.values(mocked).forEach(mock => {
      if (typeof mock?.mockReset === 'function') mock.mockReset();
    });
    mocked.articleFindOne.mockResolvedValue(storedArticle());
    mocked.articleUpdate.mockResolvedValue(storedArticle());
    mocked.replaceArticleDerivedTags.mockResolvedValue();
    mocked.sequelizeTransaction.mockImplementation(callback => callback(mocked.transaction));
  });

  it('returns an unchanged plan without writing for identical normalized source state', async () => {
    const { default: updateArticle } = await import('../../services/crawl/updateArticle.js');
    const result = await updateArticle({ id: 7, userId: 42 }, incomingArticle());

    expect(result).toMatchObject({
      matched: true,
      changed: false,
      changes: {
        contentChanged: false,
        metadataChanged: false,
        urlChanged: false,
        mediaChanged: false,
        leadImageChanged: false,
        changedFields: []
      }
    });
    expect(mocked.articleUpdate).not.toHaveBeenCalled();
  });

  it('classifies changed body fields without mutating the article', async () => {
    const { default: updateArticle } = await import('../../services/crawl/updateArticle.js');
    const result = await updateArticle({ id: 7, userId: 42 }, incomingArticle({
      contentOriginal: '<p>Revised body</p>',
      contentHtml: '<p>Revised body</p>',
      contentText: 'Revised body',
      contentSourceHash: 'revised-source-hash',
      contentTextHash: 'revised-text-hash'
    }));

    expect(result).toMatchObject({
      matched: true,
      changed: true,
      changes: {
        contentChanged: true,
        titleChanged: false,
        descriptionChanged: false,
        authorChanged: false,
        urlChanged: false,
        mediaChanged: false,
        leadImageChanged: false
      },
      updateValues: {
        contentOriginal: '<p>Revised body</p>',
        contentHtml: '<p>Revised body</p>',
        contentText: 'Revised body',
        contentSourceHash: 'revised-source-hash',
        contentTextHash: 'revised-text-hash'
      }
    });
    expect(mocked.articleUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['title', { title: 'Revised title' }, { titleChanged: true, metadataChanged: true }],
    ['author', { author: 'Revised author' }, { authorChanged: true, metadataChanged: true }],
    ['URL', {
      link: 'https://official.example/revised',
      normalizedUrl: 'https://official.example/revised'
    }, { urlChanged: true }],
    ['media', {
      media: { type: 'video', url: 'https://video.example/watch/1', views: 11 }
    }, { mediaChanged: true }],
    ['lead image', {
      leadImage: {
        url: 'https://example.com/image.jpg',
        width: 1600,
        height: 900,
        mimeType: 'image/jpeg',
        source: 'content'
      }
    }, { leadImageChanged: true }]
  ])('classifies a %s-only source change', async (_name, overrides, expectedChanges) => {
    const { default: updateArticle } = await import('../../services/crawl/updateArticle.js');
    const result = await updateArticle(
      { id: 7, userId: 42 },
      incomingArticle(overrides)
    );

    expect(result.changed).toBe(true);
    expect(result.changes).toMatchObject(expectedChanges);
    expect(mocked.articleUpdate).not.toHaveBeenCalled();
  });

  it('preserves sparse incoming fields while classifying meaningful values', async () => {
    const article = storedArticle();
    mocked.articleFindOne.mockResolvedValue(article);
    const { default: updateArticle } = await import('../../services/crawl/updateArticle.js');
    const result = await updateArticle({ id: 7, userId: 42 }, {
      externalId: 'publisher-id',
      externalIdType: 'guid',
      link: article.url,
      title: 'Revised title',
      author: '',
      contentOriginal: null,
      contentHtml: ' ',
      media: null,
      leadImage: null
    });

    expect(result.updateValues).toMatchObject({
      title: 'Revised title',
      author: 'Article author',
      contentOriginal: '<p>Article body</p>',
      contentHtml: '<p>Article body</p>',
      media: article.media,
      imageUrl: article.imageUrl
    });
    expect(result.changes).toMatchObject({
      titleChanged: true,
      contentChanged: false,
      mediaChanged: false,
      leadImageChanged: false
    });
  });

  it('uses an exact winner without requiring external identity or another lookup', async () => {
    const winner = storedArticle({ title: 'Winning title' });
    const { default: updateArticle } = await import('../../services/crawl/updateArticle.js');
    const result = await updateArticle(
      { id: 7, userId: 42 },
      incomingArticle({ externalId: null, externalIdType: null }),
      { article: winner }
    );

    expect(mocked.articleFindOne).not.toHaveBeenCalled();
    expect(result.article).toBe(winner);
    expect(result.changes.titleChanged).toBe(true);
  });

  it('reports an identical supplied winner as unchanged without writing', async () => {
    const winner = storedArticle();
    const { default: updateArticle } = await import('../../services/crawl/updateArticle.js');
    const result = await updateArticle(
      { id: 7, userId: 42 },
      incomingArticle({ externalId: null, externalIdType: null }),
      { article: winner }
    );

    expect(result).toMatchObject({
      article: winner,
      matched: true,
      changed: false,
      changes: { changedFields: [] }
    });
    expect(mocked.articleFindOne).not.toHaveBeenCalled();
    expect(mocked.articleUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['another user', { userId: 99 }, /user ownership/],
    ['another feed', { feedId: 99 }, /feed ownership/]
  ])('rejects a supplied winner owned by %s', async (_label, overrides, message) => {
    const winner = storedArticle(overrides);
    const { default: updateArticle } = await import('../../services/crawl/updateArticle.js');

    await expect(updateArticle(
      { id: 7, userId: 42 },
      incomingArticle({ title: 'Must not be applied' }),
      { article: winner }
    )).rejects.toThrow(message);

    expect(mocked.articleFindOne).not.toHaveBeenCalled();
    expect(mocked.articleUpdate).not.toHaveBeenCalled();
  });

  it('atomically applies source fields, derived fields, and tag reconciliation', async () => {
    const article = storedArticle();
    mocked.articleFindOne.mockResolvedValue(article);
    const module = await import('../../services/crawl/updateArticle.js');
    const updatePlan = await module.default({ id: 7, userId: 42 }, incomingArticle({
      title: 'Revised title'
    }));

    await module.applyArticleUpdate({
      updatePlan,
      derivedValues: {
        qualityScore: 90
      },
      tagUpdates: {
        generatedTags: ['generated-new'],
        feedTags: ['feed-tag'],
        ruleTags: ['rule-new']
      },
      userId: 42
    });

    expect(mocked.articleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Revised title',
        qualityScore: 90
      }),
      { transaction: mocked.transaction }
    );
    const persistedValues = mocked.articleUpdate.mock.calls[0][0];
    expect(persistedValues).not.toHaveProperty('status');
    expect(persistedValues).not.toHaveProperty('favoriteInd');
    expect(persistedValues).not.toHaveProperty('clickedAmount');
    expect(persistedValues).not.toHaveProperty('attentionBucket');
    expect(persistedValues).not.toHaveProperty('articleVector');
    expect(persistedValues).not.toHaveProperty('embedding_model');
    expect(persistedValues).not.toHaveProperty('eventId');
    expect(persistedValues).not.toHaveProperty('topicId');
    expect(mocked.replaceArticleDerivedTags).toHaveBeenCalledWith({
      articleId: article.id,
      userId: 42,
      generatedTags: ['generated-new'],
      feedTags: ['feed-tag'],
      ruleTags: ['rule-new'],
      transaction: mocked.transaction
    });
  });

  it('propagates tag reconciliation failure through the shared transaction', async () => {
    const tagError = new Error('Tag reconciliation failed');
    mocked.replaceArticleDerivedTags.mockRejectedValue(tagError);
    const module = await import('../../services/crawl/updateArticle.js');
    const updatePlan = await module.default({ id: 7, userId: 42 }, incomingArticle({
      title: 'Revised title'
    }));

    await expect(module.applyArticleUpdate({
      updatePlan,
      derivedValues: { qualityScore: 90 },
      tagUpdates: { generatedTags: [], feedTags: [], ruleTags: [] },
      userId: 42
    })).rejects.toBe(tagError);
    expect(mocked.articleUpdate).toHaveBeenCalledWith(
      expect.any(Object),
      { transaction: mocked.transaction }
    );
  });

  it('skips lookup when external identity is incomplete', async () => {
    const { default: updateArticle } = await import('../../services/crawl/updateArticle.js');

    await expect(updateArticle({ id: 7, userId: 42 }, {})).resolves.toMatchObject({
      article: null,
      matched: false,
      changed: false,
      changes: null
    });
    expect(mocked.articleFindOne).not.toHaveBeenCalled();
  });
});
