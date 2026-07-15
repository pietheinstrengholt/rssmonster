import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  authenticate: vi.fn(),
  findUsers: vi.fn(),
  performCrawl: vi.fn(),
  runPostCrawlSemanticPipeline: vi.fn()
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

vi.mock('../../services/crawl/postCrawlSemanticPipeline.js', () => ({
  default: mocked.runPostCrawlSemanticPipeline
}));

describe('incremental crawl pipeline command', () => {
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
  });

  it('runs one normal crawl per user in bounded batches', async () => {
    let activeCrawls = 0;
    let maxActiveCrawls = 0;

    mocked.performCrawl.mockImplementation(async userId => {
      activeCrawls += 1;
      maxActiveCrawls = Math.max(maxActiveCrawls, activeCrawls);
      await new Promise(resolve => setTimeout(resolve, 0));
      activeCrawls -= 1;

      return {
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
    expect(mocked.performCrawl).toHaveBeenNthCalledWith(1, 1);
    expect(mocked.performCrawl).toHaveBeenNthCalledWith(2, 2);
    expect(mocked.performCrawl).toHaveBeenNthCalledWith(3, 3);
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
    expect(result.crawl.processedUserIds).toEqual([1, 2, 3]);
  });
});
