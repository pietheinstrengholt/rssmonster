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

  it('only scans articles from feeds that allow embeddings', async () => {
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
        id: expect.any(Object)
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
      createdAfter: crawlStartedAt
    });

    expect(mocked.articleFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        userId: 42,
        id: expect.any(Object)
      })
    }));
  });

  it('includes explicitly changed articles outside the creation-time boundary', async () => {
    const crawlStartedAt = new Date('2026-07-01T12:00:00.000Z');
    mocked.articleFindAll.mockResolvedValueOnce([]);

    const { embedArticles } = await import('../../services/articles/embedArticles.js');
    await embedArticles(42, {
      batchSize: 10,
      createdAfter: crawlStartedAt,
      articleIds: [99, 99]
    });

    const where = mocked.articleFindAll.mock.calls[0][0].where;
    const scopeFilters = Object.getOwnPropertySymbols(where)
      .flatMap(symbol => Array.isArray(where[symbol]) ? where[symbol] : []);
    expect(scopeFilters).toEqual(expect.arrayContaining([
      expect.objectContaining({ createdAt: expect.any(Object) }),
      expect.objectContaining({ id: expect.any(Object) })
    ]));
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
        duplicateOfArticleId: expect.any(Object)
      })
    }));
  });
});
