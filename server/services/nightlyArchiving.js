import { Op } from 'sequelize';
import db from '../models/index.js';
import { cleanupArticles } from './articleCleanup.js';

// Use the same per-user transaction, protections and defaults as manual cleanup.
export async function runNightlyArchiving({ logger = console, shouldStop = () => false } = {}) {
  let lastUserId = 0;
  while (!shouldStop()) {
    const users = await db.User.findAll({
      attributes: ['id'],
      where: { id: { [Op.gt]: lastUserId } },
      order: [['id', 'ASC']],
      limit: 100,
      raw: true
    });
    if (!users.length) return;
    for (const user of users) {
      if (shouldStop()) return;
      lastUserId = user.id;
      try {
        const deletedCount = await cleanupArticles(user.id);
        logger.log(`[Archiving] Completed user=${user.id}: removed ${deletedCount} articles.`);
      } catch (error) {
        logger.error(`[Archiving] Failed user=${user.id}:`, error);
      }
    }
  }
}
