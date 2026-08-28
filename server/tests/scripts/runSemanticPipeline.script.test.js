import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  authenticate: vi.fn(),
  findUsers: vi.fn(),
  performCrawl: vi.fn(),
  runPostCrawlSemanticPipeline: vi.fn(),
  withCrawlPriorityLease: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    sequelize: {
      authenticate: mocked.authenticate
    },
    User: {
      findAll: mocked.findUsers
    }
  }
}));

vi.mock('../../controllers/crawl.js', () => ({
  default: {
    performCrawl: mocked.performCrawl
  }
}));

vi.mock('../../services/crawl/index.js', () => ({
  runPostCrawlSemanticPipeline: mocked.runPostCrawlSemanticPipeline
}));

vi.mock('../../services/jobs/crawlPriorityLease.js', () => ({
  withCrawlPriorityLease: mocked.withCrawlPriorityLease
}));

describe('incremental crawl pipeline command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    mocked.authenticate.mockReset().mockResolvedValue(undefined);
    mocked.findUsers.mockReset().mockResolvedValue([
      { id: 1 },
      { id: 2 },
      { id: 3 }
    ]);
    mocked.performCrawl.mockReset();
    mocked.runPostCrawlSemanticPipeline.mockReset().mockResolvedValue({
      users: 3,
      embedded: 0,
      skipped: 0
    });
    mocked.withCrawlPriorityLease.mockReset().mockImplementation(operation => operation());
  });

  it('runs one normal crawl per user in bounded batches', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    let activeCrawls = 0;
    let maxActiveCrawls = 0;

    mocked.performCrawl.mockImplementation(async userId => {
      activeCrawls += 1;
      maxActiveCrawls = Math.max(maxActiveCrawls, activeCrawls);
      await new Promise(resolve => setTimeout(resolve, 0));
      activeCrawls -= 1;

      return {
        userId,
        total: 1,
        processed: 1,
        errors: 0,
        timeouts: 0,
        crawlTimedOut: false,
        processedUserIds: [userId],
        crawlStartedAt: new Date(`2026-07-0${userId}T00:00:00.000Z`),
        totalNewArticles: userId,
        totalUpdatedArticles: 0
      };
    });

    const { runSemanticPipeline } = await import('../../scripts/runSemanticPipeline.js');
    const result = await runSemanticPipeline({ userBatchSize: 2 });

    expect(mocked.performCrawl).toHaveBeenCalledTimes(3);
    expect(mocked.performCrawl).toHaveBeenNthCalledWith(1, 1, {
      triggerType: 'scheduled'
    });
    expect(mocked.performCrawl).toHaveBeenNthCalledWith(2, 2, {
      triggerType: 'scheduled'
    });
    expect(mocked.performCrawl).toHaveBeenNthCalledWith(3, 3, {
      triggerType: 'scheduled'
    });
    expect(maxActiveCrawls).toBe(2);
    expect(mocked.runPostCrawlSemanticPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 3,
        processed: 3,
        processedUserIds: [1, 2, 3],
        totalNewArticles: 6,
        crawlStartedAt: new Date('2026-07-01T00:00:00.000Z')
      })
    );
    expect(mocked.withCrawlPriorityLease).toHaveBeenCalledOnce();
    expect(result.crawl.processedUserIds).toEqual([1, 2, 3]);
    expect(log.mock.calls.filter(([line]) => (
      String(line).startsWith('[CRAWL] Completed')
    ))).toHaveLength(3);
  });
});
