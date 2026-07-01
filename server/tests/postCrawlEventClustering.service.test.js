import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  embedArticles: vi.fn(),
  incrementalClusterForUser: vi.fn()
}));

vi.mock('../services/articles/embedArticles.js', () => ({
  embedArticles: mocked.embedArticles
}));

vi.mock('../services/events/reclusterForUser.js', () => ({
  incrementalClusterForUser: mocked.incrementalClusterForUser
}));

describe('runPostCrawlEventClustering', () => {
  beforeEach(() => {
    mocked.embedArticles.mockReset();
    mocked.incrementalClusterForUser.mockReset();
  });

  it('passes the crawl start time as the incremental clustering boundary', async () => {
    const crawlStartedAt = new Date('2026-07-01T12:00:00.000Z');

    mocked.embedArticles.mockResolvedValue({
      embeddedCount: 2,
      skippedCount: 1
    });

    const { runPostCrawlEventClustering } = await import('../services/crawl/postCrawlEventClustering.js');
    const result = await runPostCrawlEventClustering({
      processedUserIds: [42],
      crawlStartedAt
    });

    expect(mocked.embedArticles).toHaveBeenCalledWith(42, {
      createdAfter: crawlStartedAt
    });
    expect(mocked.incrementalClusterForUser).toHaveBeenCalledWith(42, {
      createdAfter: crawlStartedAt,
      skipTopicAssignment: true
    });
    expect(result).toEqual({
      users: 1,
      embedded: 2,
      skipped: 1
    });
  });
});
