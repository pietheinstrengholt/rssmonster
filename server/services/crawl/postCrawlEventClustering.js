import { embedArticles } from '../articles/embedArticles.js';
import { incrementalClusterForUser } from '../events/reclusterForUser.js';

// This function returns the users whose articles should be clustered after a crawl.
function getPostCrawlUserIds(result, userId = null) {
  if (userId) {
    return [userId];
  }

  return [...new Set((result?.processedUserIds || []).filter(Boolean))];
}

// This function generates embeddings and assigns newly crawled articles into events.
export async function runPostCrawlEventClustering(result, options = {}) {
  const userIds = getPostCrawlUserIds(result, options.userId);
  const onProgress = typeof options.onProgress === 'function'
    ? options.onProgress
    : null;

  if (!userIds.length) {
    return {
      users: 0,
      embedded: 0,
      skipped: 0
    };
  }

  let embedded = 0;
  let skipped = 0;

  onProgress?.({
    type: 'semantic_started',
    stage: 'event_clustering',
    users: userIds.length
  });

  for (const userId of userIds) {
    const embedSummary = await embedArticles(userId, {
      createdAfter: result?.crawlStartedAt || null
    });
    embedded += embedSummary.embeddedCount || 0;
    skipped += embedSummary.skippedCount || 0;

    await incrementalClusterForUser(userId, {
      createdAfter: result?.crawlStartedAt || null,
      skipTopicAssignment: true
    });
  }

  onProgress?.({
    type: 'semantic_completed',
    stage: 'event_clustering',
    users: userIds.length,
    embedded,
    skipped
  });

  return {
    users: userIds.length,
    embedded,
    skipped
  };
}

export default runPostCrawlEventClustering;
