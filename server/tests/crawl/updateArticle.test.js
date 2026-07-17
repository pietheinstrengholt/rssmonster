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

vi.mock('../../services/crawl/persistence/tags.js', () => ({
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
  publishedAt: new Date('2026-07-13T13:30:00Z'),
  modifiedAt: null,
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
  publishedAt: '2026-07-13T13:30:00.000Z',
  modifiedAt: null,
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
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');
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

  it('does not compare or persist modification metadata without another source change', async () => {
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');
    const result = await updateArticle({ id: 7, userId: 42 }, incomingArticle({
      modifiedAt: '2026-07-14T10:00:00.987Z'
    }));

    expect(result.changed).toBe(false);
    expect(result.changes.changedFields).toEqual([]);
    expect(result.updateValues).not.toHaveProperty('modifiedAt');
  });

  it('does not compare a changing modification-based publication fallback', async () => {
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');
    const result = await updateArticle({ id: 7, userId: 42 }, incomingArticle({
      publishedAt: '2026-07-14T10:00:00.000Z',
      modifiedAt: '2026-07-14T10:00:00.000Z',
      publishedSource: '2026-07-14T10:00:00.000Z',
      publishInferred: true
    }));

    expect(result.changed).toBe(false);
    expect(result.changes.changedFields).toEqual([]);
    expect(result.updateValues).toMatchObject({
      publishedAt: new Date('2026-07-13T13:30:00.000Z'),
      publishedSource: null,
      publishInferred: false
    });
    expect(result.updateValues).not.toHaveProperty('modifiedAt');
  });

  it('uses normalized publisher modification metadata for a confirmed revision', async () => {
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');
    const result = await updateArticle({ id: 7, userId: 42 }, incomingArticle({
      title: 'Revised article title',
      modifiedAt: '2026-07-14T10:00:00.987Z'
    }));

    expect(result).toMatchObject({
      changed: true,
      changes: { titleChanged: true, changedFields: ['title'] },
      updateValues: { modifiedAt: new Date('2026-07-14T10:00:00.000Z') }
    });
  });

  it('uses the normalized detection time when a confirmed revision has no publisher modification date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-14T11:22:33.987Z'));

    try {
      const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');
      const result = await updateArticle({ id: 7, userId: 42 }, incomingArticle({
        title: 'Revised article title'
      }));

      expect(result.updateValues.modifiedAt).toEqual(new Date('2026-07-14T11:22:33.000Z'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps modification time monotonic when confirmed revision metadata is stale', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-15T12:00:00.987Z'));
    mocked.articleFindOne.mockResolvedValue(storedArticle({
      modifiedAt: new Date('2026-07-14T12:00:00Z')
    }));

    try {
      const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');
      const result = await updateArticle({ id: 7, userId: 42 }, incomingArticle({
        title: 'Revised article title',
        modifiedAt: '2026-07-13T12:00:00Z'
      }));

      expect(result.updateValues.modifiedAt).toEqual(new Date('2026-07-15T12:00:00.000Z'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores publication timestamp differences below database precision', async () => {
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');
    const result = await updateArticle({ id: 7, userId: 42 }, incomingArticle({
      publishedAt: '2026-07-13T13:30:00.987Z'
    }));

    expect(result).toMatchObject({
      changed: false,
      changes: { publishedChanged: false, changedFields: [] },
      updateValues: { publishedAt: new Date('2026-07-13T13:30:00.000Z') }
    });
  });

  it('detects publication timestamp differences of at least one second', async () => {
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');
    const result = await updateArticle({ id: 7, userId: 42 }, incomingArticle({
      publishedAt: '2026-07-13T13:30:01.001Z'
    }));

    expect(result).toMatchObject({
      changed: true,
      changes: { publishedChanged: true, changedFields: ['publishedAt'] },
      updateValues: { publishedAt: new Date('2026-07-13T13:30:01.000Z') }
    });
  });

  it('matches a filtered article by external publisher identity', async () => {
    const article = storedArticle({ filteredInd: true });
    mocked.articleFindOne.mockResolvedValue(article);
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');

    const result = await updateArticle({ id: 7, userId: 42 }, incomingArticle({
      title: 'Revised filtered article title'
    }));

    expect(mocked.articleFindOne).toHaveBeenCalledWith({
      where: {
        userId: 42,
        feedId: 7,
        externalId: 'publisher-id',
        externalIdType: 'guid'
      }
    });
    expect(mocked.articleFindOne.mock.calls[0][0].where).not.toHaveProperty('filteredInd');
    expect(result).toMatchObject({
      article,
      matched: true,
      changed: true,
      changes: { titleChanged: true }
    });
  });

  it('classifies changed body fields without mutating the article', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');
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

    expect(consoleInfo).toHaveBeenCalledOnce();
    const [prefix, payload] = consoleInfo.mock.calls[0];
    expect(prefix).toBe('[CRAWL_ARTICLE_UPDATE]');
    expect(JSON.parse(payload)).toMatchObject({
      articleId: 123,
      feedId: 7,
      externalIdType: 'guid',
      externalId: 'publisher-id',
      changedFields: [
        'contentOriginal',
        'contentHtml',
        'contentText',
        'contentTextHash',
        'contentSourceHash'
      ],
      differences: {
        contentOriginal: {
          stored: { length: 19, sha256: expect.any(String) },
          incoming: { length: 19, sha256: expect.any(String) }
        },
        contentSourceHash: {
          stored: 'source-hash',
          incoming: 'revised-source-hash'
        }
      }
    });
    expect(payload).not.toContain('<p>Article body</p>');
    expect(payload).not.toContain('<p>Revised body</p>');
    consoleInfo.mockRestore();
  });

  it('ignores raw publisher source changes when cleaned content is unchanged', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');
    const result = await updateArticle({ id: 7, userId: 42 }, incomingArticle({
      contentOriginal: '<p id="publisher-random-53880">Article body</p>',
      contentSourceHash: 'volatile-source-hash'
    }));

    expect(result).toMatchObject({
      changed: false,
      changes: { contentChanged: false, changedFields: [] },
      sourceChangedFields: ['contentOriginal', 'contentSourceHash']
    });
    expect(consoleInfo).not.toHaveBeenCalled();
    consoleInfo.mockRestore();
  });

  it('ignores temporary Kickstarter signatures for the same cleaned video asset', async () => {
    const storedVideoUrl = 'https://v2.kickstarter.com/1784287802-old%2Bsignature%3D/assets/016/537/184/video.mp4';
    const incomingVideoUrl = 'https://v2.kickstarter.com/1784287803-new%2Fsignature%3D/assets/016/537/184/video.mp4';
    mocked.articleFindOne.mockResolvedValue(storedArticle({
      contentOriginal: `<video src="${storedVideoUrl}"></video>`,
      contentHtml: `<video src="${storedVideoUrl}"></video>`,
      contentSourceHash: 'stored-kickstarter-source-hash'
    }));
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');
    const result = await updateArticle({ id: 7, userId: 42 }, incomingArticle({
      contentOriginal: `<video src="${incomingVideoUrl}"></video>`,
      contentHtml: `<video src="${incomingVideoUrl}"></video>`,
      contentSourceHash: 'incoming-kickstarter-source-hash'
    }));

    expect(result).toMatchObject({
      changed: false,
      changes: { contentChanged: false, changedFields: [] },
      sourceChangedFields: ['contentOriginal', 'contentSourceHash']
    });
    expect(consoleInfo).not.toHaveBeenCalled();
    consoleInfo.mockRestore();
  });

  it('detects a different Kickstarter video asset as meaningful cleaned content', async () => {
    const storedVideoUrl = 'https://v2.kickstarter.com/1784287802-old-signature/assets/016/537/184/video.mp4';
    const incomingVideoUrl = 'https://v2.kickstarter.com/1784287803-new-signature/assets/016/537/999/video.mp4';
    mocked.articleFindOne.mockResolvedValue(storedArticle({
      contentOriginal: `<video src="${storedVideoUrl}"></video>`,
      contentHtml: `<video src="${storedVideoUrl}"></video>`,
      contentSourceHash: 'stored-kickstarter-source-hash'
    }));
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');
    const result = await updateArticle({ id: 7, userId: 42 }, incomingArticle({
      contentOriginal: `<video src="${incomingVideoUrl}"></video>`,
      contentHtml: `<video src="${incomingVideoUrl}"></video>`,
      contentSourceHash: 'incoming-kickstarter-source-hash'
    }));

    expect(result).toMatchObject({
      changed: true,
      changes: { contentChanged: true, changedFields: ['contentHtml'] },
      sourceChangedFields: ['contentOriginal', 'contentHtml', 'contentSourceHash']
    });
    expect(consoleInfo).toHaveBeenCalledOnce();
    consoleInfo.mockRestore();
  });

  it.each([
    ['title', { title: 'Revised title' }, { titleChanged: true, metadataChanged: true }],
    ['author', { author: 'Revised author' }, { authorChanged: true, metadataChanged: true }],
    ['URL', {
      link: 'https://official.example/revised',
      normalizedUrl: 'https://official.example/revised'
    }, { urlChanged: true }],
    ['media', {
      media: { type: 'video', url: 'https://video.example/watch/2', views: 11 }
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
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');
    const result = await updateArticle(
      { id: 7, userId: 42 },
      incomingArticle(overrides)
    );

    expect(result.changed).toBe(true);
    expect(result.changes).toMatchObject(expectedChanges);
    expect(mocked.articleUpdate).not.toHaveBeenCalled();
  });

  it('logs exact comparable structured-media leaf differences including value types', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');

    await updateArticle(
      { id: 7, userId: 42, feedName: 'Example feed' },
      incomingArticle({
        media: {
          type: 'video',
          url: 'https://video.example/watch/2',
          views: 11,
          likes: 3
        }
      })
    );

    const payload = JSON.parse(consoleInfo.mock.calls[0][1]);
    expect(payload).toMatchObject({
      articleId: 123,
      feedName: 'Example feed',
      changedFields: ['media'],
      mediaDifferences: [{
        path: 'media.url',
        stored: { type: 'string', value: 'https://video.example/watch/1' },
        incoming: { type: 'string', value: 'https://video.example/watch/2' }
      }]
    });
    consoleInfo.mockRestore();
  });

  it('ignores volatile and unknown structured-media attributes by default', async () => {
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => {});
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');

    const result = await updateArticle(
      { id: 7, userId: 42 },
      incomingArticle({
        media: {
          type: 'video',
          url: 'https://video.example/watch/1',
          views: 11,
          rating: 4.9,
          ratingCount: 12,
          comments: 5,
          likes: 8,
          mostRecentUpdate: '2026-07-16T10:00:00Z'
        }
      })
    );

    expect(result).toMatchObject({
      changed: false,
      changes: { mediaChanged: false, changedFields: [] }
    });
    expect(consoleInfo).not.toHaveBeenCalled();
    consoleInfo.mockRestore();
  });

  it('preserves sparse incoming fields while classifying meaningful values', async () => {
    const article = storedArticle();
    mocked.articleFindOne.mockResolvedValue(article);
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');
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
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');
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
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');
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
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');

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
    const module = await import('../../services/crawl/persistence/updateArticle.js');
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
    const module = await import('../../services/crawl/persistence/updateArticle.js');
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
    const { default: updateArticle } = await import('../../services/crawl/persistence/updateArticle.js');

    await expect(updateArticle({ id: 7, userId: 42 }, {})).resolves.toMatchObject({
      article: null,
      matched: false,
      changed: false,
      changes: null
    });
    expect(mocked.articleFindOne).not.toHaveBeenCalled();
  });
});
