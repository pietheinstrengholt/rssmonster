import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const mocked = vi.hoisted(() => ({
  articleCreate: vi.fn(),
  articleFindOne: vi.fn(),
  officialSourceFindAll: vi.fn(),
  tagCreate: vi.fn(),
  sequelizeTransaction: vi.fn(),
  transaction: { id: 'article-save-transaction' }
}));

vi.mock('../../models/index.js', () => ({
  default: {
    sequelize: {
      transaction: mocked.sequelizeTransaction
    },
    Article: {
      create: mocked.articleCreate,
      findOne: mocked.articleFindOne
    },
    OfficialSource: {
      findAll: mocked.officialSourceFindAll
    },
    Tag: {
      create: mocked.tagCreate
    }
  }
}));

// This function returns a minimal valid saveArticle argument set for transaction tests.
const saveArguments = () => [
  {
    id: 7,
    userId: 42,
    feedTags: []
  },
  {
    link: 'https://example.com/transaction-article',
    normalizedUrl: 'https://example.com/transaction-article',
    title: 'Transaction article',
    contentOriginal: '<p>Body</p>',
    contentHtml: '<p>Body</p>',
    contentText: 'Body',
    contentTextHash: 'visible-text-hash',
    contentSourceHash: 'source-content-hash',
    language: 'en',
    publishedAt: new Date('2026-07-01T00:00:00Z')
  },
  {
    contentSummaryBullets: [],
    tags: ['Generated'],
    advertisementScore: 70,
    sentimentScore: 70,
    qualityScore: 70
  },
  {
    status: 'unread',
    favoriteInd: false,
    clickedAmount: 0,
    hotInd: false,
    tags: []
  }
];

// This function creates MySQL-shaped unique errors for exact conflict-recovery tests.
const uniqueConstraintError = (constraint, fields = {}) => Object.assign(
  new Error(`Duplicate entry for key '${constraint}'`),
  {
    name: 'SequelizeUniqueConstraintError',
    fields,
    parent: {
      message: `Duplicate entry 'value' for key '${constraint}'`,
      sqlMessage: `Duplicate entry 'value' for key '${constraint}'`
    }
  }
);

// This function returns the persisted SHA-256 URL identity used by article indexes.
const hashUrl = value => createHash('sha256').update(value).digest('hex');

describe('saveArticle feed tags', () => {
  beforeEach(() => {
    mocked.articleCreate.mockReset();
    mocked.articleFindOne.mockReset();
    mocked.officialSourceFindAll.mockReset();
    mocked.tagCreate.mockReset();
    mocked.sequelizeTransaction.mockReset();
    mocked.articleCreate.mockResolvedValue({ id: 123 });
    mocked.articleFindOne.mockResolvedValue(null);
    mocked.officialSourceFindAll.mockResolvedValue([]);
    mocked.tagCreate.mockResolvedValue({});
    mocked.sequelizeTransaction.mockImplementation(callback => callback(mocked.transaction));
  });

  it('adds feed tags as extra article-level tags', async () => {
    const { default: saveArticle } = await import('../../services/crawl/persistence/saveArticle.js');

    await saveArticle(
      {
        id: 7,
        userId: 42,
        feedTags: ['ai', 'Security', 'ai', 'must-read', '']
      },
      {
        link: 'https://example.com/article',
        externalId: 'article-6402680',
        externalIdType: 'guid',
        title: 'Article title',
        description: 'Description',
        contentOriginal: '<p>Body</p>',
        contentHtml: 'Body',
        contentText: 'Body',
        contentTextHash: 'stripped-hash',
        contentSourceHash: 'hash',
        media: null,
        language: 'en',
        publishedAt: new Date('2026-07-01T00:00:00Z')
      },
      {
        summary: 'Summary',
        contentSummaryBullets: [],
        tags: ['Generated', 'Hardware'],
        advertisementScore: 70,
        sentimentScore: 70,
        qualityScore: 70
      },
      {
        status: 'unread',
        favoriteInd: false,
        clickedAmount: 0,
        hotInd: false,
        tags: ['rule-tag', 'hardware']
      }
    );

    expect(mocked.tagCreate).toHaveBeenCalledWith({
      articleId: 123,
      userId: 42,
      name: 'generated',
      tagType: 'generated'
    }, { transaction: mocked.transaction });
    expect(mocked.tagCreate).toHaveBeenCalledWith({
      articleId: 123,
      userId: 42,
      name: 'ai',
      tagType: 'feed'
    }, { transaction: mocked.transaction });
    expect(mocked.tagCreate).toHaveBeenCalledWith({
      articleId: 123,
      userId: 42,
      name: 'security',
      tagType: 'feed'
    }, { transaction: mocked.transaction });
    expect(mocked.tagCreate).toHaveBeenCalledWith({
      articleId: 123,
      userId: 42,
      name: 'must-read',
      tagType: 'feed'
    }, { transaction: mocked.transaction });
    expect(mocked.tagCreate).toHaveBeenCalledWith({
      articleId: 123,
      userId: 42,
      name: 'hardware',
      tagType: 'rule'
    }, { transaction: mocked.transaction });
    expect(mocked.tagCreate).toHaveBeenCalledWith({
      articleId: 123,
      userId: 42,
      name: 'rule-tag',
      tagType: 'rule'
    }, { transaction: mocked.transaction });
    expect(mocked.tagCreate).toHaveBeenCalledTimes(6);
    expect(mocked.articleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        externalId: 'article-6402680',
        externalIdType: 'guid',
        url: 'https://example.com/article',
        urlHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        normalizedUrl: 'https://example.com/article',
        normalizedUrlHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        contentHtml: 'Body',
        contentTextHash: 'stripped-hash',
        contentText: 'Body'
      }),
      { transaction: mocked.transaction }
    );
    expect(mocked.sequelizeTransaction).toHaveBeenCalledTimes(1);
  });

  it('persists supplied official-source metadata', async () => {
    const { default: saveArticle } = await import('../../services/crawl/persistence/saveArticle.js');

    await saveArticle(
      {
        id: 7,
        userId: 42,
        feedTags: []
      },
      {
        link: 'https://www.nintendo.com/us/news/article',
        title: 'Nintendo news',
        description: 'Description',
        contentOriginal: '<p>Body</p>',
        contentHtml: 'Body',
        contentSourceHash: 'hash',
        isOfficialSource: true,
        officialOrganization: 'Nintendo',
        media: null,
        language: 'en',
        publishedAt: new Date('2026-07-01T00:00:00Z')
      },
      {
        summary: 'Summary',
        contentSummaryBullets: [],
        tags: [],
        advertisementScore: 70,
        sentimentScore: 70,
        qualityScore: 70
      },
      {
        status: 'unread',
        favoriteInd: false,
        clickedAmount: 0,
        hotInd: false,
        tags: []
      }
    );

    expect(mocked.articleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        isOfficialSource: true,
        officialOrganization: 'Nintendo'
      }),
      { transaction: mocked.transaction }
    );
    expect(mocked.officialSourceFindAll).not.toHaveBeenCalled();
  });

  it('stores discard matches without official-source or tag enrichment', async () => {
    const { default: saveArticle } = await import('../../services/crawl/persistence/saveArticle.js');

    await saveArticle(
      {
        id: 7,
        userId: 42,
        feedTags: ['feed-tag']
      },
      {
        link: 'https://example.com/discarded-article',
        normalizedUrl: 'https://example.com/discarded-article',
        title: 'Discarded article',
        contentOriginal: '<p>Discarded body</p>',
        contentHtml: '<p>Discarded body</p>',
        contentText: 'Discarded body',
        contentTextHash: 'discarded-visible-text-hash',
        contentSourceHash: 'discarded-source-content-hash',
        language: 'en',
        publishedAt: new Date('2026-07-01T00:00:00Z')
      },
      null,
      {
        shouldDiscard: true,
        status: 'unread',
        filteredInd: false,
        favoriteInd: 1,
        clickedAmount: 2,
        hotInd: true,
        tags: ['rule-tag']
      }
    );

    expect(mocked.officialSourceFindAll).not.toHaveBeenCalled();
    expect(mocked.tagCreate).not.toHaveBeenCalled();
    expect(mocked.articleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'unread',
        filteredInd: true,
        favoriteInd: undefined,
        clickedAmount: undefined,
        hotInd: undefined,
        hotlinks: undefined,
        contentOriginal: '<p>Discarded body</p>',
        contentHtml: '<p>Discarded body</p>',
        contentText: 'Discarded body',
        contentTextHash: 'discarded-visible-text-hash',
        contentSourceHash: 'discarded-source-content-hash'
      }),
      { transaction: mocked.transaction }
    );
  });

  it('propagates tag unique failures without misclassifying them as article races', async () => {
    const tagError = uniqueConstraintError('tags_articleId_name_unique');
    mocked.tagCreate.mockRejectedValue(tagError);

    const { default: saveArticle } = await import('../../services/crawl/persistence/saveArticle.js');

    await expect(saveArticle(...saveArguments())).rejects.toBe(tagError);
    expect(mocked.articleCreate).toHaveBeenCalledWith(
      expect.any(Object),
      { transaction: mocked.transaction }
    );
    expect(mocked.tagCreate).toHaveBeenCalledWith(
      expect.objectContaining({ articleId: 123, name: 'generated' }),
      { transaction: mocked.transaction }
    );
    expect(mocked.articleFindOne).not.toHaveBeenCalled();
  });

  it('reloads only the exact URL-hash winner after a concurrent insert', async () => {
    const uniqueError = uniqueConstraintError('articles_feedId_urlHash_unique');
    const winner = { id: 456, userId: 42, feedId: 7 };
    mocked.articleCreate.mockRejectedValue(uniqueError);
    mocked.articleFindOne.mockResolvedValue(winner);

    const { default: saveArticle } = await import('../../services/crawl/persistence/saveArticle.js');
    const result = await saveArticle(...saveArguments());

    expect(mocked.articleFindOne).toHaveBeenCalledTimes(1);
    expect(mocked.articleFindOne).toHaveBeenCalledWith({
      where: {
        feedId: 7,
        urlHash: hashUrl('https://example.com/transaction-article')
      }
    });
    expect(mocked.tagCreate).not.toHaveBeenCalled();
    expect(result).toEqual({
      article: winner,
      created: false,
      conflict: {
        identity: 'urlHash',
        constraint: 'articles_feedId_urlHash_unique',
        recovered: true
      }
    });
  });

  it('reloads only the exact normalized-URL winner', async () => {
    const args = saveArguments();
    args[1] = {
      ...args[1],
      link: 'https://example.com/transaction-article?utm_source=feed',
      normalizedUrl: 'https://example.com/transaction-article'
    };
    const uniqueError = uniqueConstraintError(
      'articles_feedId_normalizedUrlHash_unique'
    );
    const winner = { id: 457, userId: 42, feedId: 7 };
    mocked.articleCreate.mockRejectedValue(uniqueError);
    mocked.articleFindOne.mockResolvedValue(winner);

    const { default: saveArticle } = await import('../../services/crawl/persistence/saveArticle.js');
    const result = await saveArticle(...args);

    expect(mocked.articleFindOne).toHaveBeenCalledWith({
      where: {
        feedId: 7,
        normalizedUrlHash: hashUrl('https://example.com/transaction-article')
      }
    });
    expect(result.conflict.identity).toBe('normalizedUrlHash');
  });

  it('does not select a same-content article for a URL-hash collision', async () => {
    const uniqueError = uniqueConstraintError('articles_feedId_urlHash_unique');
    mocked.articleCreate.mockRejectedValue(uniqueError);
    mocked.articleFindOne.mockResolvedValue({ id: 900, userId: 42, feedId: 7 });

    const { default: saveArticle } = await import('../../services/crawl/persistence/saveArticle.js');
    await saveArticle(...saveArguments());

    const where = mocked.articleFindOne.mock.calls[0][0].where;
    expect(where).toHaveProperty('urlHash');
    expect(where).not.toHaveProperty('contentSourceHash');
  });

  it('does not recover by content source because it is not an article identity constraint', async () => {
    const uniqueError = uniqueConstraintError(
      'articles_userId_contentSourceHash_unique'
    );
    mocked.articleCreate.mockRejectedValue(uniqueError);

    const { default: saveArticle } = await import('../../services/crawl/persistence/saveArticle.js');

    await expect(saveArticle(...saveArguments())).rejects.toBe(uniqueError);
    expect(mocked.articleFindOne).not.toHaveBeenCalled();
  });

  it('rethrows a recognized unique insert error when its winner is not committed', async () => {
    const uniqueError = uniqueConstraintError('articles_feedId_urlHash_unique');
    mocked.articleCreate.mockRejectedValue(uniqueError);

    const { default: saveArticle } = await import('../../services/crawl/persistence/saveArticle.js');

    await expect(saveArticle(...saveArguments())).rejects.toBe(uniqueError);
  });

  it('rethrows an unknown unique constraint without issuing an ambiguous lookup', async () => {
    const uniqueError = uniqueConstraintError('articles_unknown_unique');
    mocked.articleCreate.mockRejectedValue(uniqueError);

    const { default: saveArticle } = await import('../../services/crawl/persistence/saveArticle.js');

    await expect(saveArticle(...saveArguments())).rejects.toBe(uniqueError);
    expect(mocked.articleFindOne).not.toHaveBeenCalled();
  });

  it('does not invent recovery for external identity without a database unique index', async () => {
    const uniqueError = uniqueConstraintError(
      'articles_userId_feedId_externalIdType_externalId_unique'
    );
    mocked.articleCreate.mockRejectedValue(uniqueError);

    const { default: saveArticle } = await import('../../services/crawl/persistence/saveArticle.js');

    await expect(saveArticle(...saveArguments())).rejects.toBe(uniqueError);
    expect(mocked.articleFindOne).not.toHaveBeenCalled();
  });

  it('resolves unambiguous Sequelize field metadata without relying on an index property', async () => {
    const { buildConcurrentWinnerLookup } = await import(
      '../../services/crawl/persistence/saveArticle.js'
    );
    const articleValues = {
      userId: 42,
      feedId: 7,
      normalizedUrlHash: 'normalized-hash'
    };

    expect(buildConcurrentWinnerLookup({
      error: {
        fields: {
          feedId: 7,
          normalizedUrlHash: 'normalized-hash'
        }
      },
      articleValues
    })).toEqual({
      identity: 'normalizedUrlHash',
      constraint: 'articles_feedId_normalizedUrlHash_unique',
      where: {
        feedId: 7,
        normalizedUrlHash: 'normalized-hash'
      }
    });
  });
});
