import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  embedArticles: vi.fn(),
  runIncrementalEventsForUser: vi.fn(),
  scoreArticlesFromIslandsForUser: vi.fn(),
  runIslandCalibrationForUser: vi.fn()
}));

vi.mock('../../services/articles/embedArticles.js', () => ({
  embedArticles: mocked.embedArticles
}));

vi.mock('../../services/reconcile/semanticPipelineScopes.js', () => ({
  runIncrementalEventsForUser: mocked.runIncrementalEventsForUser
}));

vi.mock('../../services/score/scoreArticlesFromIslands.js', () => ({
  default: mocked.scoreArticlesFromIslandsForUser
}));

vi.mock('../../services/islands/runIslandCalibration.js', () => ({
  runIslandCalibrationForUser: mocked.runIslandCalibrationForUser
}));

describe('runPostCrawlSemanticPipeline', () => {
  beforeEach(() => {
    mocked.embedArticles.mockReset();
    mocked.runIncrementalEventsForUser.mockReset();
    mocked.scoreArticlesFromIslandsForUser.mockReset();
    mocked.runIslandCalibrationForUser.mockReset();
  });

  it('passes the crawl start time as the incremental clustering boundary', async () => {
    const crawlStartedAt = new Date('2026-07-01T12:00:00.000Z');

    mocked.embedArticles.mockResolvedValue({
      embeddedCount: 2,
      skippedCount: 1
    });
    mocked.runIncrementalEventsForUser.mockResolvedValue({
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
    mocked.scoreArticlesFromIslandsForUser.mockResolvedValue({
      updatedCount: 5,
      topicScoredCount: 4,
      fallbackScoredCount: 1
    });

    const { runPostCrawlSemanticPipeline } = await import('../../services/crawl/postCrawlSemanticPipeline.js');
    const result = await runPostCrawlSemanticPipeline({
      processedUserIds: [42],
      crawlStartedAt
    });

    expect(mocked.embedArticles).toHaveBeenCalledWith(42, {
      createdAfter: crawlStartedAt
    });
    expect(mocked.runIncrementalEventsForUser).toHaveBeenCalledWith(42, {
      createdAfter: crawlStartedAt,
      skipTopicAssignment: false
    });
    expect(mocked.runIslandCalibrationForUser).not.toHaveBeenCalled();
    expect(mocked.scoreArticlesFromIslandsForUser).toHaveBeenCalledWith(42);
    expect(result.users).toBe(1);
    expect(result.embedded).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.results[0].events.touchedEventIds).toEqual([10, 11]);
    expect(result.results[0].interestScores.updatedCount).toBe(5);
  });
});




