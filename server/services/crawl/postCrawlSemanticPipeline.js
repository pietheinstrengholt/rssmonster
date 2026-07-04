import { embedArticles } from '../articles/embedArticles.js';
import { runIncrementalEventsForUser } from '../reconcile/semanticPipelineScopes.js';
import scoreArticlesFromIslandsForUser from '../score/scoreArticlesFromIslands.js';

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
      createdAfter: result?.crawlStartedAt || null
    });
    embedded += embedSummary.embeddedCount || 0;
    skipped += embedSummary.skippedCount || 0;

    console.log(
      `[SEMANTIC] user=${userId} stage=embedding ` +
      `embedded=${embedSummary.embeddedCount || 0} skipped=${embedSummary.skippedCount || 0}`
    );

    const eventResult = await runIncrementalEventsForUser(userId, {
      createdAfter: result?.crawlStartedAt || null,
      skipTopicAssignment: false
    });

    console.log(
      `[SEMANTIC] user=${userId} stage=events ` +
      `articles=${eventResult.articleCount} ` +
      `newEvents=${eventResult.newEventsCreatedCount} ` +
      `linked=${eventResult.linkedToExistingEventCount} ` +
      `unassigned=${eventResult.unassignedCount} ` +
      `touchedEvents=${eventResult.touchedEventIds.length}`
    );

    const topicStats = eventResult.topicAssignment?.stats || {};
    console.log(
      `[SEMANTIC] user=${userId} stage=topics ` +
      `touchedTopics=${eventResult.touchedTopicIds.length} ` +
      `createdTopics=${topicStats.newTopicsCreated || 0} ` +
      `matchedEvents=${topicStats.eventsMatched || 0} ` +
      `unmatchedEvents=${topicStats.eventsUnmatched || 0}`
    );

    const scoringResult = await scoreArticlesFromIslandsForUser(userId);

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





