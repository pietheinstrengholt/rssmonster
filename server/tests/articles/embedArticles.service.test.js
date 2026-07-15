import { Op } from 'sequelize';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  articleFindAll: vi.fn(),
  embedArticle: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: {
      findAll: mocked.articleFindAll
    },
    Feed: {
      name: 'Feed'
    }
  }
}));

vi.mock('../../services/articles/embedArticle.js', () => ({
  default: mocked.embedArticle
}));

describe('embedArticles', () => {
  beforeEach(() => {
    mocked.articleFindAll.mockReset();
    mocked.embedArticle.mockReset();
  });

  it('selects a newly created active article from a feed that allows embeddings', async () => {
    const article = {
      id: 7,
      title: 'Vector article',
      contentText: 'Enough content to be useful for embeddings'
    };

    mocked.articleFindAll
      .mockResolvedValueOnce([article])
      .mockResolvedValueOnce([]);
    mocked.embedArticle.mockResolvedValue({
      eventVector: [0.1, 0.2, 0.3],
      reused: false
    });

    const { embedArticles } = await import('../../services/articles/embedArticles.js');
    const summary = await embedArticles(42, { batchSize: 10 });

    expect(mocked.articleFindAll).toHaveBeenCalledWith(expect.objectContaining({
      attributes: expect.arrayContaining(['contentText']),
      where: expect.objectContaining({
        userId: 42,
        id: expect.any(Object),
        filteredInd: false,
        articleVector: { [Op.is]: null }
      }),
      include: [{
        model: expect.any(Object),
        attributes: [],
        required: true,
        where: {
          generateEmbeddings: true
        }
      }]
    }));
    expect(mocked.embedArticle).toHaveBeenCalledWith(article, { persist: true });
    expect(summary).toMatchObject({
      userId: 42,
      scannedCount: 1,
      embeddedCount: 1,
      skippedCount: 0
    });
  });

  it('can limit scans to articles created after a crawl boundary', async () => {
    const crawlStartedAt = new Date('2026-07-01T12:00:00.000Z');

    mocked.articleFindAll.mockResolvedValueOnce([]);

    const { embedArticles } = await import('../../services/articles/embedArticles.js');
    await embedArticles(42, {
      batchSize: 10,
      createdAtFrom: crawlStartedAt
    });

    const where = mocked.articleFindAll.mock.calls[0][0].where;
    expect(where).toMatchObject({
      userId: 42,
      filteredInd: false,
      articleVector: { [Op.is]: null },
      createdAt: { [Op.gte]: crawlStartedAt }
    });
  });

  it('excludes filtered articles from every embedding scan', async () => {
    mocked.articleFindAll.mockResolvedValueOnce([]);

    const { embedArticles } = await import('../../services/articles/embedArticles.js');
    await embedArticles(42, { batchSize: 10 });

    expect(mocked.articleFindAll.mock.calls[0][0].where.filteredInd).toBe(false);
  });

  it('does not use a recent update time as the post-crawl boundary', async () => {
    const crawlStartedAt = new Date('2026-07-01T12:00:00.000Z');
    mocked.articleFindAll.mockResolvedValueOnce([]);

    const { embedArticles } = await import('../../services/articles/embedArticles.js');
    await embedArticles(42, {
      batchSize: 10,
      createdAtFrom: crawlStartedAt
    });

    const where = mocked.articleFindAll.mock.calls[0][0].where;
    expect(where.createdAt).toEqual({ [Op.gte]: crawlStartedAt });
    expect(where).not.toHaveProperty('updatedAt');
  });

  it('keeps a revised article id inside the new-article and missing-vector scope', async () => {
    const crawlStartedAt = new Date('2026-07-01T12:00:00.000Z');
    mocked.articleFindAll.mockResolvedValueOnce([]);

    const { embedArticles } = await import('../../services/articles/embedArticles.js');
    await embedArticles(42, {
      batchSize: 10,
      createdAtFrom: crawlStartedAt,
      articleIds: [99, 99]
    });

    const where = mocked.articleFindAll.mock.calls[0][0].where;
    expect(where.createdAt).toEqual({ [Op.gte]: crawlStartedAt });
    expect(where.articleVector).toEqual({ [Op.is]: null });
    expect(where.id[Op.in]).toEqual([99]);
    expect(where.id[Op.gt]).toBe(0);
    expect(where[Op.or]).toBeUndefined();
  });

  it('can opt out of the recent-article guard for intentional historical backfills', async () => {
    mocked.articleFindAll.mockResolvedValueOnce([]);

    const { embedArticles } = await import('../../services/articles/embedArticles.js');
    await embedArticles(42, {
      batchSize: 10,
      maxAgeDays: null
    });

    expect(mocked.articleFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 42,
        id: expect.any(Object),
        duplicateOfArticleId: expect.any(Object),
        articleVector: { [Op.is]: null }
      })
    }));
    expect(mocked.articleFindAll.mock.calls[0][0].where).not.toHaveProperty('createdAt');
  });
});
