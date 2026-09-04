import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  reconcileHotArticles: vi.fn(),
  recordProcessingFailure: vi.fn(),
  sanitizeFeedLogValue: vi.fn(value => value)
}));

vi.mock('../../services/crawl/hot/reconcileHotArticles.js', () => ({
  default: mocked.reconcileHotArticles,
  normalizeUserIds: userIds => [...new Set(userIds.filter(Boolean))]
}));

vi.mock('../../services/observability/processingFailures.js', () => ({
  recordProcessingFailure: mocked.recordProcessingFailure
}));

vi.mock('../../services/feeds/feedLogging.js', () => ({
  sanitizeFeedLogValue: mocked.sanitizeFeedLogValue
}));

const { default: runHotArticleReconciliation } = await import(
  '../../services/crawl/hot/runHotArticleReconciliation.js'
);

const resultFor = overrides => ({
  userIds: [],
  scannedCount: 5,
  updatedCount: 2,
  hotCount: 3,
  madeHotCount: 1,
  clearedCount: 1,
  agedOutClearedCount: 0,
  ...overrides
});

describe('runHotArticleReconciliation', () => {
  beforeEach(() => {
    mocked.reconcileHotArticles.mockReset();
    mocked.recordProcessingFailure.mockReset().mockResolvedValue(undefined);
    mocked.sanitizeFeedLogValue.mockClear();
  });

  it('logs per-user operational counts and returns an aggregate summary', async () => {
    mocked.reconcileHotArticles
      .mockResolvedValueOnce(resultFor({ scannedCount: 5 }))
      .mockResolvedValueOnce(resultFor({
        scannedCount: 7,
        updatedCount: 3,
        hotCount: 4,
        madeHotCount: 2,
        clearedCount: 1
      }));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await runHotArticleReconciliation({
      processedUserIds: [7, 9, 7],
      cutoffDate: new Date('2026-08-21T12:00:00.000Z'),
      source: 'crawl'
    });

    expect(log).toHaveBeenNthCalledWith(
      1,
      '[HOTLINK] reconciliation source=crawl user=7 inspected=5 ' +
        'changed=2 madeHot=1 hot=3 cleared=1'
    );
    expect(result).toMatchObject({
      users: 2,
      completed: 2,
      failed: 0,
      scannedCount: 12,
      updatedCount: 5,
      hotCount: 7,
      madeHotCount: 3,
      clearedCount: 2
    });
  });

  it('records a user failure and continues with the remaining users', async () => {
    const error = new Error('database unavailable');
    mocked.reconcileHotArticles
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(resultFor({}));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await runHotArticleReconciliation({
      processedUserIds: [7, 9],
      cutoffDate: new Date('2026-08-21T12:00:00.000Z'),
      crawlRunId: 12,
      executionId: 'execution-id',
      source: 'crawl'
    });

    expect(mocked.recordProcessingFailure).toHaveBeenCalledWith({
      crawlRunId: 12,
      executionId: 'execution-id',
      userId: 7,
      stage: 'hot_reconciliation',
      severity: 'ERROR',
      error,
      subjectType: 'user',
      subjectId: 7,
      retryable: true,
      context: {
        source: 'crawl',
        cutoffDate: '2026-08-21T12:00:00.000Z'
      }
    });
    expect(mocked.reconcileHotArticles).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ users: 2, completed: 1, failed: 1 });
  });

  it('reports and rethrows when the caller requires transactional retry', async () => {
    const error = new Error('database unavailable');
    mocked.reconcileHotArticles.mockRejectedValueOnce(error);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(runHotArticleReconciliation({
      processedUserIds: [7, 9],
      cutoffDate: new Date('2026-08-21T12:00:00.000Z'),
      continueOnError: false,
      source: 'repair'
    })).rejects.toBe(error);

    expect(mocked.recordProcessingFailure).toHaveBeenCalledOnce();
    expect(mocked.reconcileHotArticles).toHaveBeenCalledOnce();
  });

  it('uses identical derived results for normal crawl and repair callers', async () => {
    mocked.reconcileHotArticles.mockResolvedValue(resultFor({}));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const input = {
      processedUserIds: [7],
      cutoffDate: new Date('2026-08-21T12:00:00.000Z')
    };

    const crawlResult = await runHotArticleReconciliation({
      ...input,
      source: 'crawl'
    });
    const repairResult = await runHotArticleReconciliation({
      ...input,
      source: 'repair'
    });

    expect(repairResult).toEqual(crawlResult);
    expect(mocked.reconcileHotArticles).toHaveBeenNthCalledWith(1, {
      processedUserIds: [7],
      cutoffDate: input.cutoffDate,
      transaction: null
    });
    expect(mocked.reconcileHotArticles).toHaveBeenNthCalledWith(2, {
      processedUserIds: [7],
      cutoffDate: input.cutoffDate,
      transaction: null
    });
  });
});
