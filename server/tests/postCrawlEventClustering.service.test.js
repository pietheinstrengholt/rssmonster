import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  embedArticles: vi.fn(),
  incrementalClusterForUser: vi.fn(),
  buildArticleInterestScoresForUser: vi.fn(),
  buildInterestIslandsForUser: vi.fn()
}));

vi.mock('../services/articles/embedArticles.js', () => ({
  embedArticles: mocked.embedArticles
}));

vi.mock('../services/reconcile/reclusterForUser.js', () => ({
  incrementalClusterForUser: mocked.incrementalClusterForUser
}));

vi.mock('../services/islands/buildArticleInterestScores.js', () => ({
  default: mocked.buildArticleInterestScoresForUser
}));

vi.mock('../services/islands/buildInterestIslands.js', () => ({
  buildInterestIslandsForUser: mocked.buildInterestIslandsForUser
}));

describe('runPostCrawlEventClustering', () => {
  beforeEach(() => {
    mocked.embedArticles.mockReset();
    mocked.incrementalClusterForUser.mockReset();
    mocked.buildArticleInterestScoresForUser.mockReset();
    mocked.buildInterestIslandsForUser.mockReset();
  });

  it('passes the crawl start time as the incremental clustering boundary', async () => {
    const crawlStartedAt = new Date('2026-07-01T12:00:00.000Z');

    mocked.embedArticles.mockResolvedValue({
      embeddedCount: 2,
      skippedCount: 1
    });
    mocked.incrementalClusterForUser.mockResolvedValue({
      userId: 42,
      mode: 'incremental',
      articleCount: 3,
      touchedEventIds: [10, 11],
      touchedTopicIds: [20],
      newEventsCreatedCount: 1,
      linkedToExistingEventCount: 1,
      unassignedCount: 1,
      topicAssignment: {
        skipped: false,
        eventCount: 2,
        touchedTopicIds: [20],
        stats: {
          eventsSkipped: 0,
          eventsMatched: 1,
          eventsUnmatched: 1,
          newTopicsCreated: 1
        }
      }
    });
    mocked.buildArticleInterestScoresForUser.mockResolvedValue({
      updatedCount: 5,
      topicScoredCount: 4,
      fallbackScoredCount: 1
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
      skipTopicAssignment: false
    });
    expect(mocked.buildInterestIslandsForUser).not.toHaveBeenCalled();
    expect(mocked.buildArticleInterestScoresForUser).toHaveBeenCalledWith(42);
    expect(result.users).toBe(1);
    expect(result.embedded).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.results[0].events.touchedEventIds).toEqual([10, 11]);
    expect(result.results[0].interestScores.updatedCount).toBe(5);
  });
});
