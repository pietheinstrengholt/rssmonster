// scripts/repairRecentArticles.js
/**
 * Recent-repair events command runner.
 *
 * Usage:
 *   npm run semantic:repair
 *   node scripts/repairRecentArticles.js
 *
 * Programmatic usage:
 *   repairRecentArticles({ userId })
 */

import db from '../models/index.js';
const { User } = db;

import { repairRecentEventsForUser } from '../services/reconcile/semanticPipelineScopes.js';

/* ------------------------------------------------------------------
 * Seven-day recent-repair event assignment entrypoint
 * ------------------------------------------------------------------ */

/**
 * @param {Object} [options]
 * @param {number|null} [options.userId]
 */
export async function repairRecentArticles({ userId = null } = {}) {
  // Case 1: Explicit userId provided
  if (userId) {
    await repairRecentEventsForUser(userId);
    return;
  }

  // Case 2: No userId provided, repair the recent window for all users.
  console.log('[SEMANTIC] Stage 1 Events recent-repair for ALL users');

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  console.log(
    `[SEMANTIC] Stage 1 Events users=${users.length}`
  );

  for (const user of users) {
    try {
      await repairRecentEventsForUser(user.id);
    } catch (err) {
      console.error(
        `[EVENT RECENT-REPAIR] Failed for user ${user.id}:`,
        err
      );
    }
  }

  console.log('[SEMANTIC] Stage 1 Events Finished');
}

export default repairRecentArticles;

/* ------------------------------------------------------------------
 * CLI runner
 * ------------------------------------------------------------------ */

if (process.argv[1]?.includes('repairRecentArticles')) {
  repairRecentArticles()
    .then(() => {
      console.log('[SEMANTIC] Stage 1 Events Done');
      process.exit(0);
    })
    .catch(err => {
      console.error('[SEMANTIC] Stage 1 Events Failed:', err);
      process.exit(1);
    });
}

