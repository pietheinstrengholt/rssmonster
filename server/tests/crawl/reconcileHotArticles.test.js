import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Op } from 'sequelize';

const mocked = vi.hoisted(() => ({
  articleFindAll: vi.fn(),
  articleUpdate: vi.fn(),
  hotlinkFindAll: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: {
      findAll: mocked.articleFindAll,
      update: mocked.articleUpdate
    },
    Hotlink: { findAll: mocked.hotlinkFindAll }
  }
}));

vi.mock('../../services/duplicates/articleDuplicates.js', () => ({
  canonicalArticleWhere: () => ({
    duplicateOfArticleId: null,
    filteredInd: false
  })
}));

const { default: reconcileHotArticles } = await import(
  '../../services/crawl/hot/reconcileHotArticles.js'
);

describe('reconcileHotArticles', () => {
  beforeEach(() => {
    mocked.articleFindAll.mockReset().mockResolvedValue([]);
    mocked.articleUpdate.mockReset().mockResolvedValue([0]);
    mocked.hotlinkFindAll.mockReset().mockResolvedValue([]);
  });

  it('marks a target ingested after references and normalizes tracking parameters', async () => {
    const cutoffDate = new Date('2026-08-21T12:00:00.000Z');
    const articles = [{
      id: 10,
      userId: 1,
      feedId: 20,
      normalizedUrl: 'https://example.com/story',
      hotInd: 0,
      hotlinks: 0
    }];
    mocked.articleFindAll.mockResolvedValue(articles);
    mocked.hotlinkFindAll.mockResolvedValue([
      { userId: 1, feedId: 21, url: 'https://example.com/story?utm_source=rss' },
      { userId: 1, feedId: 21, url: 'https://example.com/story' },
      { userId: 1, feedId: 22, url: 'https://example.com/story/' },
      { userId: 2, feedId: 30, url: 'https://example.com/story' }
    ]);

    const result = await reconcileHotArticles({
      processedUserIds: [1, 2, 1, null],
      cutoffDate
    });

    expect(mocked.articleFindAll).toHaveBeenCalledWith({
      attributes: ['id', 'userId', 'feedId', 'normalizedUrl', 'hotInd', 'hotlinks'],
      where: {
        userId: { [Op.in]: [1, 2] },
        publishedAt: { [Op.gte]: cutoffDate },
        duplicateOfArticleId: null,
        filteredInd: false
      },
      raw: true
    });
    expect(mocked.hotlinkFindAll).toHaveBeenCalledWith({
      attributes: ['userId', 'feedId', 'sourceArticleId', 'url'],
      where: {
        userId: { [Op.in]: [1, 2] },
        createdAt: { [Op.gte]: cutoffDate }
      },
      raw: true
    });
    expect(result.articles).toBe(articles);
    expect(result.observationCountsByUserId.get(1)).toEqual(new Map([
      ['https://example.com/story', new Map([[21, 2], [22, 1]])]
    ]));
    expect(result.observationCountsByUserId.get(2)).toEqual(new Map([
      ['https://example.com/story', new Map([[30, 1]])]
    ]));
    expect(mocked.articleUpdate).toHaveBeenCalledWith(
      { hotInd: 1, hotlinks: 3 },
      { where: { id: 10, userId: 1 } }
    );
    expect(result).toMatchObject({
      scannedCount: 1,
      updatedCount: 1,
      hotCount: 1,
      madeHotCount: 1,
      clearedCount: 0
    });
  });

  it('excludes observations whose source article is filtered or duplicate', async () => {
    mocked.articleFindAll
      .mockResolvedValueOnce([{
        id: 10,
        userId: 1,
        feedId: 20,
        normalizedUrl: 'https://example.com/story',
        hotInd: 0,
        hotlinks: 0
      }])
      .mockResolvedValueOnce([{ id: 101 }]);
    mocked.hotlinkFindAll.mockResolvedValue([
      {
        userId: 1,
        feedId: 21,
        sourceArticleId: 101,
        url: 'https://example.com/story'
      },
      {
        userId: 1,
        feedId: 22,
        sourceArticleId: 102,
        url: 'https://example.com/story'
      },
      {
        userId: 1,
        feedId: 23,
        sourceArticleId: 103,
        url: 'https://example.com/story'
      }
    ]);

    await reconcileHotArticles({
      processedUserIds: [1],
      cutoffDate: new Date('2026-08-21T12:00:00.000Z')
    });

    expect(mocked.articleFindAll).toHaveBeenNthCalledWith(2, {
      attributes: ['id'],
      where: {
        id: { [Op.in]: [101, 102, 103] },
        userId: { [Op.in]: [1] },
        duplicateOfArticleId: null,
        filteredInd: false
      },
      raw: true
    });
    expect(mocked.articleUpdate).toHaveBeenCalledWith(
      { hotInd: 1, hotlinks: 1 },
      { where: { id: 10, userId: 1 } }
    );
  });

  it('marks a target that was ingested before its first reference', async () => {
    const article = {
      id: 10,
      userId: 1,
      feedId: 20,
      normalizedUrl: 'https://example.com/story',
      hotInd: 0,
      hotlinks: 0
    };
    mocked.articleFindAll.mockResolvedValue([article]);
    mocked.hotlinkFindAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { userId: 1, feedId: 21, url: 'https://example.com/story' }
      ]);
    const input = {
      processedUserIds: [1],
      cutoffDate: new Date('2026-08-21T12:00:00.000Z')
    };

    const beforeReference = await reconcileHotArticles(input);
    const afterReference = await reconcileHotArticles(input);

    expect(beforeReference).toMatchObject({ hotCount: 0, madeHotCount: 0 });
    expect(afterReference).toMatchObject({ hotCount: 1, madeHotCount: 1 });
    expect(mocked.articleUpdate).toHaveBeenCalledWith(
      { hotInd: 1, hotlinks: 1 },
      { where: { id: 10, userId: 1 } }
    );
  });

  it('produces the same counts regardless of parallel observation completion order', async () => {
    const article = {
      id: 10,
      userId: 1,
      feedId: 20,
      normalizedUrl: 'https://example.com/story',
      hotInd: 0,
      hotlinks: 0
    };
    const observations = [
      { userId: 1, feedId: 21, url: 'https://example.com/story' },
      { userId: 1, feedId: 22, url: 'https://example.com/story' },
      { userId: 1, feedId: 23, url: 'https://example.com/story' }
    ];
    const reconcileOrder = async orderedObservations => {
      mocked.articleFindAll.mockResolvedValueOnce([article]);
      mocked.hotlinkFindAll.mockResolvedValueOnce(orderedObservations);
      mocked.articleUpdate.mockClear();
      const result = await reconcileHotArticles({
        processedUserIds: [1],
        cutoffDate: new Date('2026-08-21T12:00:00.000Z')
      });
      const hotUpdate = mocked.articleUpdate.mock.calls
        .find(([values]) => values.hotInd === 1);
      return { result, values: hotUpdate[0] };
    };

    const forward = await reconcileOrder(observations);
    const reverse = await reconcileOrder([...observations].reverse());

    expect(forward.values).toEqual({ hotInd: 1, hotlinks: 3 });
    expect(reverse.values).toEqual(forward.values);
    expect(reverse.result.hotCount).toBe(forward.result.hotCount);
  });

  it('keeps meaningful query parameters in the exact-match identity', async () => {
    mocked.articleFindAll.mockResolvedValue([
      {
        id: 10,
        userId: 1,
        feedId: 20,
        normalizedUrl: 'https://example.com/story',
        hotInd: 0,
        hotlinks: 0
      },
      {
        id: 11,
        userId: 1,
        feedId: 20,
        normalizedUrl: 'https://example.com/story?edition=evening',
        hotInd: 0,
        hotlinks: 0
      }
    ]);
    mocked.hotlinkFindAll.mockResolvedValue([{
      userId: 1,
      feedId: 21,
      url: 'https://example.com/story?edition=evening'
    }]);

    await reconcileHotArticles({
      processedUserIds: [1],
      cutoffDate: new Date('2026-08-21T12:00:00.000Z')
    });

    expect(mocked.articleUpdate).toHaveBeenCalledWith(
      { hotInd: 1, hotlinks: 1 },
      { where: { id: 11, userId: 1 } }
    );
    expect(mocked.articleUpdate).not.toHaveBeenCalledWith(
      { hotInd: 1, hotlinks: 1 },
      { where: { id: 10, userId: 1 } }
    );
  });

  it('clears stale hotness when only same-feed observations remain', async () => {
    mocked.articleFindAll.mockResolvedValue([{
      id: 10,
      userId: 1,
      feedId: 20,
      normalizedUrl: 'https://example.com/story',
      hotInd: 1,
      hotlinks: 2
    }]);
    mocked.hotlinkFindAll.mockResolvedValue([
      { userId: 1, feedId: 20, url: 'https://example.com/story' }
    ]);

    const result = await reconcileHotArticles({
      processedUserIds: [1],
      cutoffDate: new Date('2026-08-21T12:00:00.000Z')
    });

    expect(mocked.articleUpdate).toHaveBeenCalledWith(
      { hotInd: 0, hotlinks: 0 },
      { where: { id: 10, userId: 1 } }
    );
    expect(result).toMatchObject({
      scannedCount: 1,
      updatedCount: 1,
      hotCount: 0,
      madeHotCount: 0,
      clearedCount: 1
    });
  });

  it('decrements hotlinks after a publisher revision removes an observation', async () => {
    mocked.articleFindAll.mockResolvedValue([{
      id: 10,
      userId: 1,
      feedId: 20,
      normalizedUrl: 'https://example.com/story',
      hotInd: 1,
      hotlinks: 2
    }]);
    mocked.hotlinkFindAll.mockResolvedValue([
      { userId: 1, feedId: 21, url: 'https://example.com/story' }
    ]);

    const result = await reconcileHotArticles({
      processedUserIds: [1],
      cutoffDate: new Date('2026-08-21T12:00:00.000Z')
    });

    expect(mocked.articleUpdate).toHaveBeenCalledWith(
      { hotInd: 1, hotlinks: 1 },
      { where: { id: 10, userId: 1 } }
    );
    expect(result).toMatchObject({
      updatedCount: 1,
      hotCount: 1,
      madeHotCount: 0,
      clearedCount: 0
    });
  });

  it('clears a recent target after its last observation expires', async () => {
    mocked.articleFindAll.mockResolvedValue([{
      id: 10,
      userId: 1,
      feedId: 20,
      normalizedUrl: 'https://example.com/story',
      hotInd: 1,
      hotlinks: 1
    }]);
    mocked.hotlinkFindAll.mockResolvedValue([]);

    const result = await reconcileHotArticles({
      processedUserIds: [1],
      cutoffDate: new Date('2026-08-21T12:00:00.000Z')
    });

    expect(mocked.articleUpdate).toHaveBeenCalledWith(
      { hotInd: 0, hotlinks: 0 },
      { where: { id: 10, userId: 1 } }
    );
    expect(result).toMatchObject({
      updatedCount: 1,
      hotCount: 0,
      clearedCount: 1
    });
  });

  it('does not rewrite a recent article whose persisted hotness is already current', async () => {
    mocked.articleFindAll.mockResolvedValue([{
      id: 10,
      userId: 1,
      feedId: 20,
      normalizedUrl: 'https://example.com/story',
      hotInd: 1,
      hotlinks: 1
    }]);
    mocked.hotlinkFindAll.mockResolvedValue([
      { userId: 1, feedId: 21, url: 'https://example.com/story' }
    ]);

    const result = await reconcileHotArticles({
      processedUserIds: [1],
      cutoffDate: new Date('2026-08-21T12:00:00.000Z')
    });

    expect(mocked.articleUpdate).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      scannedCount: 1,
      updatedCount: 0,
      hotCount: 1,
      madeHotCount: 0,
      clearedCount: 0
    });
  });

  it('clears nonzero hotness from articles older than the cutoff in one update', async () => {
    const cutoffDate = new Date('2026-08-21T12:00:00.000Z');
    mocked.articleUpdate.mockResolvedValueOnce([3]);

    const result = await reconcileHotArticles({
      processedUserIds: [1, 2],
      cutoffDate
    });

    expect(mocked.articleUpdate).toHaveBeenCalledOnce();
    expect(mocked.articleUpdate).toHaveBeenCalledWith(
      { hotInd: 0, hotlinks: 0 },
      {
        where: {
          userId: { [Op.in]: [1, 2] },
          publishedAt: { [Op.lt]: cutoffDate },
          [Op.or]: [
            { hotInd: { [Op.ne]: 0 } },
            { hotlinks: { [Op.ne]: 0 } }
          ]
        }
      }
    );
    expect(result).toMatchObject({
      scannedCount: 0,
      updatedCount: 3,
      hotCount: 0,
      madeHotCount: 0,
      clearedCount: 3,
      agedOutClearedCount: 3
    });
  });

  it('returns an empty snapshot without querying when no valid users were processed', async () => {
    const result = await reconcileHotArticles({
      processedUserIds: [null, 0, 'invalid'],
      cutoffDate: new Date('2026-08-21T12:00:00.000Z')
    });

    expect(result.articles).toEqual([]);
    expect(result.observationCountsByUserId).toEqual(new Map());
    expect(mocked.articleFindAll).not.toHaveBeenCalled();
    expect(mocked.hotlinkFindAll).not.toHaveBeenCalled();
  });

  it('requires a valid cutoff date', async () => {
    await expect(reconcileHotArticles({
      processedUserIds: [1],
      cutoffDate: 'invalid'
    })).rejects.toThrow('A valid hot article cutoff date is required');
  });

  it('uses a caller transaction for reads and updates', async () => {
    const cutoffDate = new Date('2026-08-21T12:00:00.000Z');

    await reconcileHotArticles({
      processedUserIds: [1],
      cutoffDate,
      transaction: 'transaction'
    });

    expect(mocked.articleFindAll).toHaveBeenCalledWith(expect.objectContaining({
      transaction: 'transaction'
    }));
    expect(mocked.hotlinkFindAll).toHaveBeenCalledWith(expect.objectContaining({
      transaction: 'transaction'
    }));
    expect(mocked.articleUpdate).toHaveBeenCalledWith(
      { hotInd: 0, hotlinks: 0 },
      expect.objectContaining({ transaction: 'transaction' })
    );
  });
});
