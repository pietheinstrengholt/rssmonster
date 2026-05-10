import db from '../models/index.js';
const { Feed, FeedStats, Category, CategoryStats, Article } = db;
import { Op, fn, col, literal } from 'sequelize';

/**
 * Refresh feed stats for a specific user
 * Computes article and unread counts for all user's feeds
 */
export const refreshFeedStatsForUser = async (userId) => {
  if (!userId) {
    throw new Error('userId is required');
  }

  const feeds = await Feed.findAll({
    where: { userId },
    attributes: ['id'],
    raw: true
  });

  if (!feeds.length) {
    return new Map();
  }

  const now = new Date();
  const statsMap = new Map();

  // Get counts for all feeds in bulk
  const counts = await Article.findAll({
    where: {
      userId,
      feedId: { [Op.in]: feeds.map(f => f.id) }
    },
    attributes: [
      'feedId',
      [fn('COUNT', col('id')), 'articleCount'],
      [literal(`SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END)`), 'unreadCount']
    ],
    group: ['feedId'],
    raw: true
  });

  const countMap = new Map(counts.map(c => [c.feedId, c]));

  // Upsert all feed stats
  for (const feed of feeds) {
    const count = countMap.get(feed.id);
    const articleCount = Number(count?.articleCount) || 0;
    const unreadCount = Number(count?.unreadCount) || 0;

    await FeedStats.upsert({
      feedId: feed.id,
      userId,
      articleCount,
      unreadCount,
      lastRefreshed: now
    }, {
      where: { feedId: feed.id }
    });

    statsMap.set(feed.id, { articleCount, unreadCount });
  }

  return statsMap;
};

/**
 * Refresh category stats for a specific user
 * Computes article and unread counts for all user's categories
 */
export const refreshCategoryStatsForUser = async (userId) => {
  if (!userId) {
    throw new Error('userId is required');
  }

  const categories = await Category.findAll({
    where: { userId },
    attributes: ['id'],
    raw: true
  });

  if (!categories.length) {
    return new Map();
  }

  const now = new Date();
  const statsMap = new Map();

  // Get counts for all categories via feeds
  const counts = await Article.findAll({
    attributes: [
      [col('Feed.categoryId'), 'categoryId'],
      [fn('COUNT', col('Article.id')), 'articleCount'],
      [literal(`SUM(CASE WHEN Article.status = 'unread' THEN 1 ELSE 0 END)`), 'unreadCount']
    ],
    include: [
      {
        model: Feed,
        attributes: [],
        required: true,
        where: { userId }
      }
    ],
    where: { userId },
    group: [[col('Feed.categoryId')]],
    raw: true,
    subQuery: false
  });

  const countMap = new Map(counts.map(c => [c.categoryId, c]));

  // Upsert all category stats
  for (const category of categories) {
    const count = countMap.get(category.id);
    const articleCount = Number(count?.articleCount) || 0;
    const unreadCount = Number(count?.unreadCount) || 0;

    await CategoryStats.upsert({
      categoryId: category.id,
      userId,
      articleCount,
      unreadCount,
      lastRefreshed: now
    }, {
      where: { categoryId: category.id }
    });

    statsMap.set(category.id, { articleCount, unreadCount });
  }

  return statsMap;
};

/**
 * Refresh all feed and category stats for a specific user
 */
export const refreshFeedCategoryStatsForUser = async (userId) => {
  await Promise.all([
    refreshFeedStatsForUser(userId),
    refreshCategoryStatsForUser(userId)
  ]);
};

/**
 * Refresh feed and category stats for all users (bulk operation)
 * Useful for server startup or scheduled jobs
 */
export const refreshFeedCategoryStatsForAllUsers = async () => {
  const users = await db.User.findAll({
    attributes: ['id'],
    raw: true
  });

  const startTime = Date.now();
  let usersProcessed = 0;

  for (const user of users) {
    try {
      await refreshFeedCategoryStatsForUser(user.id);
      usersProcessed++;
    } catch (err) {
      console.error(`Error refreshing feed/category stats for user ${user.id}:`, err.message);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`Feed/category stats refresh complete for ${usersProcessed}/${users.length} users in ${elapsed}ms`);

  return usersProcessed;
};

/**
 * Invalidate feed/category stats for a specific user
 * Called when an article is modified that might affect counts
 */
export const invalidateFeedCategoryStatsForUser = async (userId) => {
  if (!userId) return;

  // Set lastRefreshed to old date to mark as stale
  await Promise.all([
    FeedStats.update(
      { lastRefreshed: new Date(0) },
      { where: { userId } }
    ),
    CategoryStats.update(
      { lastRefreshed: new Date(0) },
      { where: { userId } }
    )
  ]);
};

export default {
  refreshFeedStatsForUser,
  refreshCategoryStatsForUser,
  refreshFeedCategoryStatsForUser,
  refreshFeedCategoryStatsForAllUsers,
  invalidateFeedCategoryStatsForUser
};
