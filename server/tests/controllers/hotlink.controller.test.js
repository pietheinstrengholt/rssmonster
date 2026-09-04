import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Op } from 'sequelize';

const mocked = vi.hoisted(() => ({
  bulkCreate: vi.fn(),
  create: vi.fn(),
  destroy: vi.fn(),
  findAll: vi.fn(),
  findOne: vi.fn(),
  hotArticleCutoffDate: vi.fn(),
  runHotArticleReconciliation: vi.fn(),
  transaction: vi.fn()
}));

vi.mock('../../services/crawl/hot/reconcileHotArticles.js', () => ({
  hotArticleCutoffDate: mocked.hotArticleCutoffDate
}));

vi.mock('../../services/crawl/hot/runHotArticleReconciliation.js', () => ({
  default: mocked.runHotArticleReconciliation
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Hotlink: {
      bulkCreate: mocked.bulkCreate,
      create: mocked.create,
      destroy: mocked.destroy,
      findAll: mocked.findAll,
      findOne: mocked.findOne
    },
    sequelize: {
      transaction: mocked.transaction
    }
  }
}));

const {
  all,
  clearCache,
  get,
  replaceMany,
  set,
  setMany
} = await import('../../controllers/hotlink.js');

describe('hotlink controller', () => {
  beforeEach(() => {
    mocked.bulkCreate.mockReset().mockResolvedValue(undefined);
    mocked.create.mockReset().mockResolvedValue(undefined);
    mocked.destroy.mockReset().mockResolvedValue(undefined);
    mocked.findAll.mockReset().mockResolvedValue([]);
    mocked.findOne.mockReset().mockResolvedValue(null);
    mocked.hotArticleCutoffDate.mockReset().mockReturnValue(
      new Date('2026-08-21T12:00:00.000Z')
    );
    mocked.runHotArticleReconciliation.mockReset().mockResolvedValue({});
    mocked.transaction.mockReset().mockImplementation(callback =>
      callback('transaction')
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('removes hotlinks older than the retention window', async () => {
    await clearCache();

    const cleanupDate = mocked.destroy.mock.calls[0][0].where.createdAt[Op.lte];
    expect(cleanupDate).toEqual(new Date('2026-08-21T12:00:00.000Z'));
  });

  it('reconciles users whose expired observations were removed', async () => {
    const cutoffDate = new Date('2026-08-21T12:00:00.000Z');
    mocked.findAll.mockResolvedValueOnce([
      { userId: 20 },
      { userId: 30 }
    ]);

    await clearCache();

    expect(mocked.findAll).toHaveBeenCalledWith({
      attributes: ['userId'],
      where: {
        createdAt: { [Op.lte]: cutoffDate }
      },
      group: ['userId'],
      transaction: 'transaction',
      raw: true
    });
    expect(mocked.destroy.mock.invocationCallOrder[0])
      .toBeLessThan(mocked.runHotArticleReconciliation.mock.invocationCallOrder[0]);
    expect(mocked.runHotArticleReconciliation).toHaveBeenCalledWith({
      processedUserIds: [20, 30],
      cutoffDate,
      transaction: 'transaction',
      continueOnError: false,
      source: 'observation_cleanup'
    });
  });

  it('propagates reconciliation failures through the cleanup transaction', async () => {
    const error = new Error('hot reconciliation failed');
    mocked.findAll.mockResolvedValueOnce([{ userId: 20 }]);
    mocked.runHotArticleReconciliation.mockRejectedValueOnce(error);

    await expect(clearCache()).rejects.toBe(error);

    expect(mocked.destroy).toHaveBeenCalledTimes(1);
    expect(mocked.transaction).toHaveBeenCalledTimes(1);
  });

  it('skips cleanup when a legacy database lacks the createdAt column', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocked.destroy.mockRejectedValueOnce(
      Object.assign(new Error("Unknown column 'createdAt' in 'where clause'"), {
        name: 'SequelizeDatabaseError'
      })
    );

    await expect(clearCache()).resolves.toBeUndefined();

    expect(warning).toHaveBeenCalledWith(
      'Skipping hotlink cleanup: hotlinks.createdAt column is missing.'
    );
  });

  it('propagates cleanup failures unrelated to the legacy schema', async () => {
    const error = new Error('database unavailable');
    mocked.destroy.mockRejectedValueOnce(error);

    await expect(clearCache()).rejects.toBe(error);
  });

  it('propagates database errors that do not identify a missing column', async () => {
    const error = { name: 'SequelizeDatabaseError' };
    mocked.destroy.mockRejectedValueOnce(error);

    await expect(clearCache()).rejects.toBe(error);
  });

  it('delegates single-record writes and reads to the model', async () => {
    const storedHotlink = { id: 1 };
    mocked.create.mockResolvedValueOnce(storedHotlink);
    mocked.findOne.mockResolvedValueOnce(storedHotlink);
    mocked.findAll.mockResolvedValueOnce([storedHotlink]);

    await set('https://example.com', 10, 20);
    const foundHotlink = await get('https://example.com', 10, 20);
    const hotlinks = await all();

    expect(mocked.create).toHaveBeenCalledWith({
      url: 'https://example.com',
      feedId: 10,
      userId: 20
    });
    expect(mocked.findOne).toHaveBeenCalledWith({
      where: {
        url: 'https://example.com',
        feedId: 10,
        userId: 20
      }
    });
    expect(foundHotlink).toBe(storedHotlink);
    expect(hotlinks).toEqual([storedHotlink]);
  });

  it('stores unique batch links when no source article is supplied', async () => {
    await setMany(
      ['https://example.com/one', '', 'https://example.com/one'],
      10,
      20
    );

    expect(mocked.bulkCreate).toHaveBeenCalledWith([
      {
        url: 'https://example.com/one',
        feedId: 10,
        userId: 20
      }
    ]);
    expect(mocked.transaction).not.toHaveBeenCalled();
  });

  it('does not write an empty source-less batch', async () => {
    await setMany([null, ''], 10, 20);

    expect(mocked.bulkCreate).not.toHaveBeenCalled();
    expect(mocked.transaction).not.toHaveBeenCalled();
  });

  it('ignores replacement entries without a source article', async () => {
    await replaceMany([
      {
        sourceArticleId: null,
        urls: ['https://example.com/one']
      }
    ], 10, 20);

    expect(mocked.transaction).not.toHaveBeenCalled();
    expect(mocked.destroy).not.toHaveBeenCalled();
  });

  it('counts repeated links from the same source article only once', async () => {
    await setMany(
      ['https://example.com/one', 'https://example.com/one'],
      10,
      20,
      30
    );

    expect(mocked.destroy).toHaveBeenCalledWith({
      where: {
        userId: 20,
        feedId: 10,
        sourceArticleId: {
          [Op.in]: [30]
        }
      },
      transaction: 'transaction'
    });
    expect(mocked.bulkCreate).toHaveBeenCalledWith([
      {
        url: 'https://example.com/one',
        feedId: 10,
        userId: 20,
        sourceArticleId: 30
      }
    ], {
      transaction: 'transaction'
    });
  });

  it('removes stale observations when a revision has no hotlinks', async () => {
    await setMany([], 10, 20, 30);

    expect(mocked.destroy).toHaveBeenCalledTimes(1);
    expect(mocked.bulkCreate).not.toHaveBeenCalled();
  });

  it('replaces multiple article observations in one transaction', async () => {
    await replaceMany([
      {
        sourceArticleId: 30,
        urls: ['https://example.com/one']
      },
      {
        sourceArticleId: 31,
        urls: ['https://example.com/two']
      }
    ], 10, 20);

    expect(mocked.transaction).toHaveBeenCalledTimes(1);
    expect(mocked.bulkCreate).toHaveBeenCalledWith([
      {
        url: 'https://example.com/one',
        feedId: 10,
        userId: 20,
        sourceArticleId: 30
      },
      {
        url: 'https://example.com/two',
        feedId: 10,
        userId: 20,
        sourceArticleId: 31
      }
    ], {
      transaction: 'transaction'
    });
  });
});
