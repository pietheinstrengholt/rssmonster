import db from '../models/index.js';
const { User, Article, UserStats } = db;
const { sequelize, Sequelize } = db;
const { fn, col } = Sequelize;

/**
 * Repair user_stats cache for existing users (recovery/maintenance tool).
 * - Recomputes stats for users where stats row is missing or stale
 * - New users get stats on creation via User.afterCreate hook
 * - Triggers keep stats current on article changes
 * - This script is optional, for data recovery or batch maintenance only
 */
const repairUserStats = async () => {
  try {
    console.log('\x1b[36mRepairing user_stats cache...\x1b[0m');

    // Get all users
    const allUsers = await User.findAll({
      attributes: ['id'],
      raw: true
    });

    console.log(`\x1b[36mProcessing ${allUsers.length} users...\x1b[0m`);

    for (let idx = 0; idx < allUsers.length; idx++) {
      const userId = allUsers[idx].id;

      // Compute counts for this user
      const stats = await Article.findOne({
        where: { userId },
        attributes: [
          [fn('COUNT', col('id')), 'totalCount'],
          [sequelize.literal(`SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END)`), 'unreadCount'],
          [sequelize.literal(`SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END)`), 'readCount'],
          [sequelize.literal(`SUM(CASE WHEN starInd = 1 THEN 1 ELSE 0 END)`), 'starCount'],
          [sequelize.literal(`SUM(CASE WHEN hotInd = 1 THEN 1 ELSE 0 END)`), 'hotCount'],
          [sequelize.literal(`SUM(CASE WHEN clickedAmount > 0 THEN 1 ELSE 0 END)`), 'clickedCount']
        ],
        raw: true
      });

      // Upsert to ensure row exists and is current
      await UserStats.upsert({
        userId,
        totalCount: Number(stats?.totalCount) || 0,
        unreadCount: Number(stats?.unreadCount) || 0,
        readCount: Number(stats?.readCount) || 0,
        starCount: Number(stats?.starCount) || 0,
        hotCount: Number(stats?.hotCount) || 0,
        clickedCount: Number(stats?.clickedCount) || 0
      });

      const progress = ((idx + 1) / allUsers.length * 100).toFixed(1);
      if ((idx + 1) % 10 === 0) {
        console.log(`\x1b[32m[${progress}%] Repaired ${idx + 1} users\x1b[0m`);
      }
    }

    console.log(`\x1b[36m✓ User stats repair complete (${allUsers.length} users)\x1b[0m`);
  } catch (error) {
    console.error('Error during repair:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
};

repairUserStats();
