import { embedArticles } from '../../articles/embedArticles.js';
import { markDuplicateArticlesForUser } from '../../duplicates/articleDuplicates.js';
import { runIncrementalEventsForUser } from '../../reconcile/semanticPipelineScopes.js';
import scoreArticlesFromIslandsForUser from '../../score/scoreArticlesFromIslands.js';

// This function returns the users whose articles should be processed after a crawl.
function getPostCrawlUserIds(result, userId = null) {
  if (userId) {
    return [userId];
  }

  return [...new Set((result?.processedUserIds || []).filter(Boolean))];
}

// This function runs the incremental semantic hierarchy for users touched by a crawl.
export async function runPostCrawlSemanticPipeline(result, options = {}) {
  const userIds = getPostCrawlUserIds(result, options.userId);
  const onProgress = typeof options.onProgress === 'function'
    ? options.onProgress
    : null;

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
  const results = [];

  onProgress?.({
    type: 'semantic_started',
    stage: 'semantic_pipeline',
    users: userIds.length
  });

  for (const userId of userIds) {
    const embedSummary = await embedArticles(userId, {
      createdAtFrom: result?.crawlStartedAt || null
    });
    embedded += embedSummary.embeddedCount || 0;
    skipped += embedSummary.skippedCount || 0;

    console.log(
      `[SEMANTIC] user=${userId} stage=embedding ` +
      `embedded=${embedSummary.embeddedCount || 0} skipped=${embedSummary.skippedCount || 0}`
    );

    const duplicateResult = await markDuplicateArticlesForUser(userId, {
      createdAtFrom: result?.crawlStartedAt || null
    });

    console.log(
      `[SEMANTIC] user=${userId} stage=duplicates ` +
      `scanned=${duplicateResult.scannedCount || 0} ` +
      `duplicates=${duplicateResult.duplicateCount || 0}`
    );

    const eventResult = await runIncrementalEventsForUser(userId, {
      createdAtFrom: result?.crawlStartedAt || null,
      skipTopicAssignment: false
    });

    console.log(
      `[SEMANTIC] user=${userId} stage=events ` +
      `articles=${eventResult.articleCount} ` +
      `newEvents=${eventResult.newEventsCreatedCount} ` +
      `linked=${eventResult.linkedToExistingEventCount} ` +
      `unassigned=${eventResult.unassignedCount} ` +
      `touchedEvents=${eventResult.touchedEventIds?.length || 0}`
    );

    const topicStats = eventResult.topicAssignment?.stats || {};
    console.log(
      `[SEMANTIC] user=${userId} stage=topics ` +
      `touchedTopics=${eventResult.touchedTopicIds?.length || 0} ` +
      `createdTopics=${topicStats.newTopicsCreated || 0} ` +
      `matchedEvents=${topicStats.eventsMatched || 0} ` +
      `unmatchedEvents=${topicStats.eventsUnmatched || 0}`
    );

    const scoringResult = await scoreArticlesFromIslandsForUser(userId, {
      createdAtFrom: result?.crawlStartedAt || null
    });

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
