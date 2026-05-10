import db from '../models/index.js';
const { SmartFolder, SmartFolderStats, Setting } = db;
import { searchArticles } from './articleSearch.service.js';

/**
 * Refresh smart folder stats for a specific user
 * Executes each smart folder's query and caches the article count
 */
export const refreshSmartFolderStatsForUser = async (userId) => {
  if (!userId) {
    throw new Error('userId is required');
  }

  const smartFolders = await SmartFolder.findAll({
    where: { userId },
    attributes: ['id', 'query', 'limitCount'],
    raw: true
  });

  if (!smartFolders.length) {
    return new Map();
  }

  // Get user's quality filter settings
  const setting = await Setting.findOne({
    where: { userId },
    attributes: ['minAdvertisementScore', 'minSentimentScore', 'minQualityScore'],
    raw: true
  });

  const minAdvertisementScore = setting?.minAdvertisementScore ?? 0;
  const minSentimentScore = setting?.minSentimentScore ?? 0;
  const minQualityScore = setting?.minQualityScore ?? 0;

  const statsMap = new Map();
  const now = new Date();

  // Execute all queries serially to avoid overwhelming the database
  for (const folder of smartFolders) {
    try {
      const result = await searchArticles({
        userId,
        search: folder.query,
        minAdvertisementScore,
        minSentimentScore,
        minQualityScore,
        smartFolderSearch: true,
        limitCount: folder.limitCount || 50
      });

      const articleCount = result.itemIds ? result.itemIds.length : 0;

      // Upsert into stats table
      await SmartFolderStats.upsert({
        smartFolderId: folder.id,
        userId,
        articleCount,
        lastRefreshed: now
      }, {
        where: { smartFolderId: folder.id }
      });

      statsMap.set(folder.id, articleCount);
    } catch (err) {
      console.error(`Error refreshing stats for smart folder ${folder.id}:`, err.message);
      // Still upsert with 0 on error
      await SmartFolderStats.upsert({
        smartFolderId: folder.id,
        userId,
        articleCount: 0,
        lastRefreshed: now
      }, {
        where: { smartFolderId: folder.id }
      });
      statsMap.set(folder.id, 0);
    }
  }

  return statsMap;
};

/**
 * Refresh smart folder stats for all users (bulk operation)
 * Useful for server startup or scheduled jobs
 */
export const refreshSmartFolderStatsForAllUsers = async () => {
  const users = await db.User.findAll({
    attributes: ['id'],
    raw: true
  });

  const startTime = Date.now();
  let usersProcessed = 0;

  for (const user of users) {
    try {
      await refreshSmartFolderStatsForUser(user.id);
      usersProcessed++;
    } catch (err) {
      console.error(`Error refreshing smart folder stats for user ${user.id}:`, err.message);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`SmartFolder stats refresh complete for ${usersProcessed}/${users.length} users in ${elapsed}ms`);

  return usersProcessed;
};

/**
 * Invalidate smart folder stats for a specific user
 * Called when an article is modified that might affect query results
 */
export const invalidateSmartFolderStatsForUser = async (userId) => {
  if (!userId) return;

  // Set lastRefreshed to old date to mark as stale
  // Stats can be refreshed on-demand or via startup warmup
  await SmartFolderStats.update(
    {
      lastRefreshed: new Date(0)
    },
    {
      where: { userId }
    }
  );
};

export default {
  refreshSmartFolderStatsForUser,
  refreshSmartFolderStatsForAllUsers,
  invalidateSmartFolderStatsForUser
};
