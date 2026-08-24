import { embedArticles } from '../../articles/embedArticles.js';
import { markDuplicateArticlesForUser } from '../../duplicates/articleDuplicates.js';
import { runIncrementalEventsForUser } from '../../reconcile/semanticPipelineScopes.js';
import scoreArticlesFromIslandsForUser from '../../score/scoreArticlesFromIslands.js';
import { randomUUID } from 'node:crypto';
import { recordProcessingFailure } from '../../observability/processingFailures.js';

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

    console.log(
      `[SEMANTIC] user=${userId} stage=embedding ` +
      `embedded=${embedSummary.embeddedCount || 0} skipped=${embedSummary.skippedCount || 0}`
    );

    // Derives the duplicate result through mark duplicate articles for user while performing run post crawl semantic pipeline.
    const duplicateResult = await runSemanticStage(
      'semantic_duplicates',
      processingContext,
      () => markDuplicateArticlesForUser(userId, {
        createdAtFrom: result?.crawlStartedAt || null
      })
    );

    console.log(
      `[SEMANTIC] user=${userId} stage=duplicates ` +
      `scanned=${duplicateResult.scannedCount || 0} ` +
      `duplicates=${duplicateResult.duplicateCount || 0}`
    );

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

    console.log(
      `[SEMANTIC] user=${userId} stage=events ` +
      `articles=${eventResult.articleCount} ` +
      `newEvents=${eventResult.newEventsCreatedCount} ` +
      `linked=${eventResult.linkedToExistingEventCount} ` +
      `unassigned=${eventResult.unassignedCount} ` +
      `touchedEvents=${eventResult.touchedEventIds?.length || 0}`
    );

    // Tracks topic stats for the processing summary.
    const topicStats = eventResult.topicAssignment?.stats || {};
    console.log(
      `[SEMANTIC] user=${userId} stage=topics ` +
      `touchedTopics=${eventResult.touchedTopicIds?.length || 0} ` +
      `createdTopics=${topicStats.newTopicsCreated || 0} ` +
      `matchedEvents=${topicStats.eventsMatched || 0} ` +
      `unmatchedEvents=${topicStats.eventsUnmatched || 0}`
    );

    // Derives the scoring result through score articles from islands for user while performing run post crawl semantic pipeline.
    const scoringResult = await runSemanticStage(
      'interest_scoring',
      processingContext,
      () => scoreArticlesFromIslandsForUser(userId, {
        createdAtFrom: result?.crawlStartedAt || null
      })
    );

    console.log(
      `[SEMANTIC] user=${userId} stage=interest-scores ` +
      `updated=${scoringResult.updatedCount || 0} ` +
      `topicScored=${scoringResult.topicScoredCount || 0} ` +
      `fallbackScored=${scoringResult.fallbackScoredCount || 0}`
    );
    console.log(`[SEMANTIC] user=${userId} stage=completed`);

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
