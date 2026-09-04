import { embedArticles } from '../../articles/embedArticles.js';
import { markDuplicateArticlesForUser } from '../../duplicates/articleDuplicates.js';
import { runIncrementalEventsForUser } from '../../reconcile/semanticPipelineScopes.js';
import scoreArticlesFromIslandsForUser from '../../score/scoreArticlesFromIslands.js';
import { randomUUID } from 'node:crypto';
import { recordProcessingFailure } from '../../observability/processingFailures.js';
import { formatDuration } from '../../feeds/crawlResult.js';
import { tryReconcileSemanticLabelJobsForUser } from '../../semanticLabels/semanticLabelJobs.js';
import { hotArticleCutoffDate } from '../hot/reconcileHotArticles.js';
import runHotArticleReconciliation from '../hot/runHotArticleReconciliation.js';

// This function returns the users whose articles should be processed after a crawl.
function getPostCrawlUserIds(result, userId = null) {
  // Returns an empty result when user id is available.
  if (userId) {
    return [userId];
  }

  return [...new Set((result?.processedUserIds || []).filter(Boolean))];
}

// Runs one semantic stage and persists only abnormal terminal outcomes.
async function runSemanticStage(stage, processingContext, operation) {
  try {
    return await operation();
  } catch (error) {
    await recordProcessingFailure({
      ...processingContext,
      stage,
      error,
      severity: 'FATAL',
      subjectType: 'user',
      subjectId: processingContext.userId
    });
    throw error;
  }
}

// This function runs the incremental semantic hierarchy for users touched by a crawl.
export async function runPostCrawlSemanticPipeline(result, options = {}) {
  // Derives the user id through get post crawl user id while performing run post crawl semantic pipeline.
  const userIds = getPostCrawlUserIds(result, options.userId);
  // Selects the on progress based on whether options is function.
  const onProgress = typeof options.onProgress === 'function'
    ? options.onProgress
    : null;

  // Returns early when user id is empty.
  if (!userIds.length) {
    return {
      users: 0,
      embedded: 0,
      skipped: 0,
      results: []
    };
  }

  let embedded = 0;
  let skipped = 0;
  // Collects the results while performing run post crawl semantic pipeline.
  const results = [];

  onProgress?.({
    type: 'semantic_started',
    stage: 'semantic_pipeline',
    users: userIds.length
  });

  // Processes each user id entry in turn.
  for (const userId of userIds) {
    const crawlRunId = options.crawlRunId ?? result?.crawlRunId ??
      result?.crawlRunIdsByUserId?.[userId] ?? null;
    const executionId = options.executionId ?? result?.executionId ??
      result?.executionIdsByUserId?.[userId] ?? randomUUID();
    const processingContext = { crawlRunId, executionId, userId };
    // Derives the embed summary through embed articles while performing run post crawl semantic pipeline.
    const embeddingStartedAt = Date.now();
    const embedSummary = await runSemanticStage(
      'embedding',
      processingContext,
      () => embedArticles(userId, {
        createdAtFrom: result?.crawlStartedAt || null,
        processingContext
      })
    );
    embedded += embedSummary.embeddedCount || 0;
    skipped += embedSummary.skippedCount || 0;

    if (Number(embedSummary.scannedCount || 0) > 0) {
      console.log(
        `[EMBEDDING] processed=${embedSummary.scannedCount || 0} ` +
        `embedded=${embedSummary.embeddedCount || 0} ` +
        `skipped=${embedSummary.skippedCount || 0} ` +
        `user=${userId} ` +
        `duration=${formatDuration(Date.now() - embeddingStartedAt)}`
      );
    }

    // Derives the duplicate result through mark duplicate articles for user while performing run post crawl semantic pipeline.
    const duplicateResult = await runSemanticStage(
      'semantic_duplicates',
      processingContext,
      () => markDuplicateArticlesForUser(userId, {
        createdAtFrom: result?.crawlStartedAt || null
      })
    );

    // Semantic duplicate marking changes source eligibility after the normal
    // end-of-crawl reconciliation. Reconcile again only when that state changed.
    if (Number(duplicateResult.duplicateCount || 0) > 0) {
      await runHotArticleReconciliation({
        processedUserIds: [userId],
        cutoffDate: hotArticleCutoffDate(),
        crawlRunId,
        executionId,
        source: 'semantic_duplicates'
      });
    }

    // Derives the event result through run incremental events for user while performing run post crawl semantic pipeline.
    const eventResult = await runSemanticStage(
      'event_assignment',
      processingContext,
      () => runIncrementalEventsForUser(userId, {
        createdAtFrom: result?.crawlStartedAt || null,
        skipTopicAssignment: false,
        processingContext
      })
    );

    if (Number(eventResult.articleCount || 0) > 0) {
      console.log(
        `[EVENTS] processed=${eventResult.articleCount || 0} ` +
        `assigned=${Math.max(
          Number(eventResult.articleCount || 0) - Number(eventResult.unassignedCount || 0),
          0
        )} ` +
        `standalone=${eventResult.unassignedCount || 0} ` +
        `newEvents=${eventResult.newEventsCreatedCount || 0} ` +
        `existingEvents=${eventResult.linkedToExistingEventCount || 0} ` +
        `touched=${eventResult.touchedEventIds?.length || 0} ` +
        `user=${userId} ` +
        `duration=${formatDuration(eventResult.durations?.eventsMs || 0)}`
      );
    }

    // Tracks topic stats for the processing summary.
    const topicStats = eventResult.topicAssignment?.stats || {};
    if (Number(eventResult.topicAssignment?.eventCount || 0) > 0) {
      console.log(
        `[TOPICS] events=${eventResult.topicAssignment.eventCount || 0} ` +
        `matched=${topicStats.eventsMatched || 0} ` +
        `created=${topicStats.newTopicsCreated || 0} ` +
        `unmatched=${topicStats.eventsUnmatched || 0} ` +
        `user=${userId} ` +
        `duration=${formatDuration(eventResult.durations?.topicsMs || 0)}`
      );
    }

    // Derives the scoring result through score articles from islands for user while performing run post crawl semantic pipeline.
    const scoringStartedAt = Date.now();
    const scoringResult = await runSemanticStage(
      'interest_scoring',
      processingContext,
      () => scoreArticlesFromIslandsForUser(userId, {
        createdAtFrom: result?.crawlStartedAt || null
      })
    );

    if (Number(eventResult.articleCount || 0) > 0 || Number(scoringResult.updatedCount || 0) > 0) {
      console.log(
        `[ISLANDS] interestScoresUpdated=${scoringResult.updatedCount || 0} ` +
        `topicScored=${scoringResult.topicScoredCount || 0} ` +
        `fallbackScored=${scoringResult.fallbackScoredCount || 0} ` +
        `user=${userId} ` +
        `duration=${formatDuration(Date.now() - scoringStartedAt)}`
      );
    }

    await tryReconcileSemanticLabelJobsForUser(userId);

    results.push({
      userId,
      embedding: embedSummary,
      duplicates: duplicateResult,
      events: eventResult,
      interestScores: scoringResult
    });
  }

  onProgress?.({
    type: 'semantic_completed',
    stage: 'semantic_pipeline',
    users: userIds.length,
    embedded,
    skipped
  });

  return {
    users: userIds.length,
    embedded,
    skipped,
    results
  };
}

export default runPostCrawlSemanticPipeline;
