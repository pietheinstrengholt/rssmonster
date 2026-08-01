import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  embedArticles: vi.fn(),
  markDuplicateArticlesForUser: vi.fn(),
  runIncrementalEventsForUser: vi.fn(),
  scoreArticlesFromIslandsForUser: vi.fn(),
  runIslandCalibrationForUser: vi.fn()
}));

vi.mock('../../services/articles/embedArticles.js', () => ({
  embedArticles: mocked.embedArticles
}));

vi.mock('../../services/duplicates/articleDuplicates.js', () => ({
  markDuplicateArticlesForUser: mocked.markDuplicateArticlesForUser
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
    mocked.markDuplicateArticlesForUser.mockReset();
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
    mocked.markDuplicateArticlesForUser.mockResolvedValue({
      scannedCount: 3,
      duplicateCount: 0
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

    const { runPostCrawlSemanticPipeline } = await import('../../services/crawl/orchestration/postCrawlSemanticPipeline.js');
    const result = await runPostCrawlSemanticPipeline({
      processedUserIds: [42],
      crawlStartedAt
    });

    expect(mocked.embedArticles).toHaveBeenCalledWith(42, {
      createdAtFrom: crawlStartedAt
    });
    expect(mocked.markDuplicateArticlesForUser).toHaveBeenCalledWith(42, {
      createdAtFrom: crawlStartedAt
    });
    expect(mocked.runIncrementalEventsForUser).toHaveBeenCalledWith(42, {
      createdAtFrom: crawlStartedAt,
      skipTopicAssignment: false
    });
    expect(mocked.runIslandCalibrationForUser).not.toHaveBeenCalled();
    expect(mocked.scoreArticlesFromIslandsForUser).toHaveBeenCalledWith(42, {
      createdAtFrom: crawlStartedAt
    });
    expect(result.users).toBe(1);
    expect(result.embedded).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.results[0].events.touchedEventIds).toEqual([10, 11]);
    expect(result.results[0].interestScores.updatedCount).toBe(5);
  });

  // This test verifies a crawl with no affected users skips every semantic stage.
  it('returns an empty summary when the crawl did not process any users', async () => {
    const { runPostCrawlSemanticPipeline } = await import('../../services/crawl/orchestration/postCrawlSemanticPipeline.js');
    const result = await runPostCrawlSemanticPipeline(undefined, {
      onProgress: 'not-a-function'
    });

    expect(result).toEqual({
      users: 0,
      embedded: 0,
      skipped: 0,
      results: []
    });
    expect(mocked.embedArticles).not.toHaveBeenCalled();
    expect(mocked.markDuplicateArticlesForUser).not.toHaveBeenCalled();
    expect(mocked.runIncrementalEventsForUser).not.toHaveBeenCalled();
    expect(mocked.scoreArticlesFromIslandsForUser).not.toHaveBeenCalled();
  });

  // This test verifies explicit ownership, default counts, and progress callbacks.
  it('uses an explicit user once and reports zero-valued stage defaults', async () => {
    const onProgress = vi.fn();
    mocked.embedArticles.mockResolvedValue({});
    mocked.markDuplicateArticlesForUser.mockResolvedValue({});
    mocked.runIncrementalEventsForUser.mockResolvedValue({});
    mocked.scoreArticlesFromIslandsForUser.mockResolvedValue({});

    const { runPostCrawlSemanticPipeline } = await import('../../services/crawl/orchestration/postCrawlSemanticPipeline.js');
    const result = await runPostCrawlSemanticPipeline({
      processedUserIds: [17, 17, null]
    }, {
      userId: 23,
      onProgress
    });

    expect(mocked.embedArticles).toHaveBeenCalledOnce();
    expect(mocked.embedArticles).toHaveBeenCalledWith(23, { createdAtFrom: null });
    expect(mocked.markDuplicateArticlesForUser).toHaveBeenCalledWith(23, { createdAtFrom: null });
    expect(mocked.runIncrementalEventsForUser).toHaveBeenCalledWith(23, {
      createdAtFrom: null,
      skipTopicAssignment: false
    });
    expect(mocked.scoreArticlesFromIslandsForUser).toHaveBeenCalledWith(23, { createdAtFrom: null });
    expect(onProgress).toHaveBeenNthCalledWith(1, {
      type: 'semantic_started',
      stage: 'semantic_pipeline',
      users: 1
    });
    expect(onProgress).toHaveBeenNthCalledWith(2, {
      type: 'semantic_completed',
      stage: 'semantic_pipeline',
      users: 1,
      embedded: 0,
      skipped: 0
    });
    expect(result).toMatchObject({ users: 1, embedded: 0, skipped: 0 });
  });
});
