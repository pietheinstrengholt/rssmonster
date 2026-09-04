import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  embedArticles: vi.fn(),
  markDuplicateArticlesForUser: vi.fn(),
  runIncrementalEventsForUser: vi.fn(),
  scoreArticlesFromIslandsForUser: vi.fn(),
  runIslandCalibrationForUser: vi.fn(),
  recordProcessingFailure: vi.fn(),
  tryReconcileSemanticLabelJobsForUser: vi.fn(),
  runHotArticleReconciliation: vi.fn()
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

vi.mock('../../services/observability/processingFailures.js', () => ({
  recordProcessingFailure: mocked.recordProcessingFailure
}));

vi.mock('../../services/semanticLabels/semanticLabelJobs.js', () => ({
  tryReconcileSemanticLabelJobsForUser: mocked.tryReconcileSemanticLabelJobsForUser
}));

vi.mock('../../services/crawl/hot/reconcileHotArticles.js', () => ({
  hotArticleCutoffDate: () => new Date('2026-08-21T12:00:00.000Z')
}));

vi.mock('../../services/crawl/hot/runHotArticleReconciliation.js', () => ({
  default: mocked.runHotArticleReconciliation
}));

describe('runPostCrawlSemanticPipeline', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    mocked.embedArticles.mockReset();
    mocked.markDuplicateArticlesForUser.mockReset();
    mocked.runIncrementalEventsForUser.mockReset();
    mocked.scoreArticlesFromIslandsForUser.mockReset();
    mocked.runIslandCalibrationForUser.mockReset();
    mocked.recordProcessingFailure.mockReset().mockResolvedValue(undefined);
    mocked.tryReconcileSemanticLabelJobsForUser.mockReset().mockResolvedValue({});
    mocked.runHotArticleReconciliation.mockReset().mockResolvedValue({});
  });

  it('reconciles hotness after semantic duplicate eligibility changes', async () => {
    mocked.embedArticles.mockResolvedValue({});
    mocked.markDuplicateArticlesForUser.mockResolvedValue({ duplicateCount: 2 });
    mocked.runIncrementalEventsForUser.mockResolvedValue({});
    mocked.scoreArticlesFromIslandsForUser.mockResolvedValue({});

    const { runPostCrawlSemanticPipeline } = await import('../../services/crawl/orchestration/postCrawlSemanticPipeline.js');
    await runPostCrawlSemanticPipeline({
      processedUserIds: [42],
      crawlRunId: 91
    }, {
      executionId: 'a0d0cabe-6e98-46e4-9665-d14ca7e44496'
    });

    expect(mocked.runHotArticleReconciliation).toHaveBeenCalledWith({
      processedUserIds: [42],
      cutoffDate: new Date('2026-08-21T12:00:00.000Z'),
      crawlRunId: 91,
      executionId: 'a0d0cabe-6e98-46e4-9665-d14ca7e44496',
      source: 'semantic_duplicates'
    });
  });

  it('passes the crawl start time as the incremental clustering boundary', async () => {
    const crawlStartedAt = new Date('2026-07-01T12:00:00.000Z');

    mocked.embedArticles.mockResolvedValue({
      scannedCount: 3,
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
      durations: { eventsMs: 1300, topicsMs: 420 },
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
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const { runPostCrawlSemanticPipeline } = await import('../../services/crawl/orchestration/postCrawlSemanticPipeline.js');
    const result = await runPostCrawlSemanticPipeline({
      processedUserIds: [42],
      crawlStartedAt
    });

    expect(mocked.embedArticles).toHaveBeenCalledWith(42, expect.objectContaining({
      createdAtFrom: crawlStartedAt,
      processingContext: expect.objectContaining({ userId: 42 })
    }));
    expect(mocked.markDuplicateArticlesForUser).toHaveBeenCalledWith(42, {
      createdAtFrom: crawlStartedAt
    });
    expect(mocked.runIncrementalEventsForUser).toHaveBeenCalledWith(42, {
      createdAtFrom: crawlStartedAt,
      skipTopicAssignment: false,
      processingContext: expect.objectContaining({ userId: 42 })
    });
    expect(mocked.runIslandCalibrationForUser).not.toHaveBeenCalled();
    expect(mocked.scoreArticlesFromIslandsForUser).toHaveBeenCalledWith(42, {
      createdAtFrom: crawlStartedAt
    });
    expect(mocked.tryReconcileSemanticLabelJobsForUser).toHaveBeenCalledWith(42);
    expect(mocked.tryReconcileSemanticLabelJobsForUser.mock.invocationCallOrder[0])
      .toBeGreaterThan(mocked.scoreArticlesFromIslandsForUser.mock.invocationCallOrder[0]);
    expect(result.users).toBe(1);
    expect(result.embedded).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.results[0].events.touchedEventIds).toEqual([10, 11]);
    expect(result.results[0].interestScores.updatedCount).toBe(5);
    expect(log.mock.calls.map(([line]) => line)).toEqual([
      expect.stringMatching(
        /^\[EMBEDDING\] processed=3 embedded=2 skipped=1 user=42 duration=\d+(?:ms|\.\d+s)$/
      ),
      '[EVENTS] processed=3 assigned=2 standalone=1 newEvents=1 ' +
        'existingEvents=1 touched=2 user=42 duration=1.3s',
      '[TOPICS] events=2 matched=1 created=1 unmatched=1 user=42 duration=420ms',
      expect.stringMatching(
        /^\[ISLANDS\] interestScoresUpdated=5 topicScored=4 fallbackScored=1 user=42 duration=\d+(?:ms|\.\d+s)$/
      )
    ]);
  });

  // This test verifies a crawl with no affected users skips every semantic stage.
  it('returns an empty summary when the crawl did not process any users', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
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
    expect(mocked.tryReconcileSemanticLabelJobsForUser).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
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
    expect(mocked.embedArticles).toHaveBeenCalledWith(23, expect.objectContaining({
      createdAtFrom: null,
      processingContext: expect.objectContaining({ userId: 23 })
    }));
    expect(mocked.markDuplicateArticlesForUser).toHaveBeenCalledWith(23, { createdAtFrom: null });
    expect(mocked.runIncrementalEventsForUser).toHaveBeenCalledWith(23, {
      createdAtFrom: null,
      skipTopicAssignment: false,
      processingContext: expect.objectContaining({ userId: 23 })
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

  it('records the owning semantic stage before propagating its failure', async () => {
    const failure = Object.assign(new Error('duplicate scan failed'), {
      code: 'DATABASE_UNAVAILABLE'
    });
    mocked.embedArticles.mockResolvedValue({});
    mocked.markDuplicateArticlesForUser.mockRejectedValue(failure);

    const { runPostCrawlSemanticPipeline } = await import('../../services/crawl/orchestration/postCrawlSemanticPipeline.js');

    await expect(runPostCrawlSemanticPipeline({
      processedUserIds: [42],
      crawlRunId: 91
    }, {
      executionId: 'a0d0cabe-6e98-46e4-9665-d14ca7e44496'
    })).rejects.toBe(failure);

    expect(mocked.recordProcessingFailure).toHaveBeenCalledWith(expect.objectContaining({
      crawlRunId: 91,
      executionId: 'a0d0cabe-6e98-46e4-9665-d14ca7e44496',
      userId: 42,
      stage: 'semantic_duplicates',
      severity: 'FATAL',
      error: failure
    }));
    expect(mocked.runIncrementalEventsForUser).not.toHaveBeenCalled();
  });
});
