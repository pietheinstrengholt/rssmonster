import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  authenticate: vi.fn(),
  articleFindAll: vi.fn(),
  hotArticleCutoffDate: vi.fn(),
  runHotArticleReconciliation: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: { findAll: mocked.articleFindAll },
    sequelize: { authenticate: mocked.authenticate }
  }
}));

vi.mock('../../services/crawl/hot/reconcileHotArticles.js', () => ({
  hotArticleCutoffDate: mocked.hotArticleCutoffDate
}));

vi.mock('../../services/crawl/hot/runHotArticleReconciliation.js', () => ({
  default: mocked.runHotArticleReconciliation
}));

const { rebuildHotlinks } = await import('../../scripts/rebuildHotlinks.js');

describe('rebuildHotlinks command', () => {
  beforeEach(() => {
    mocked.authenticate.mockReset().mockResolvedValue(undefined);
    mocked.articleFindAll.mockReset().mockResolvedValue([
      { userId: 7 },
      { userId: 9 }
    ]);
    mocked.hotArticleCutoffDate.mockReset().mockReturnValue(
      new Date('2026-08-21T12:00:00.000Z')
    );
    mocked.runHotArticleReconciliation.mockReset().mockResolvedValue({
      userIds: [7, 9],
      scannedCount: 12,
      updatedCount: 4,
      hotCount: 3,
      madeHotCount: 2,
      clearedCount: 1
    });
  });

  it('reuses authoritative reconciliation for every article owner', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await rebuildHotlinks();

    expect(mocked.authenticate).toHaveBeenCalledOnce();
    expect(mocked.articleFindAll).toHaveBeenCalledWith({
      attributes: ['userId'],
      group: ['userId'],
      raw: true
    });
    expect(mocked.runHotArticleReconciliation).toHaveBeenCalledWith({
      processedUserIds: [7, 9],
      cutoffDate: new Date('2026-08-21T12:00:00.000Z'),
      continueOnError: false,
      source: 'repair'
    });
    expect(result.updatedCount).toBe(4);
    expect(log).toHaveBeenLastCalledWith(
      '[HOTLINK] Rebuild completed users=2 scanned=12 updated=4 madeHot=2 hot=3 cleared=1'
    );
  });
});
