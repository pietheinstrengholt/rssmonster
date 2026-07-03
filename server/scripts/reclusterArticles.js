// scripts/reclusterArticles.js
/**
 * Recluster Articles CLI runner
 *
 * Usage:
 *   npm run semantic:repair
 *   node scripts/reclusterArticles.js
 *
 * Programmatic usage:
 *   fullReclusterArticles({ userId })
 */

import db from '../models/index.js';
const { User } = db;

import { reclusterForUser } from '../services/reconcile/reclusterForUser.js';

/* ------------------------------------------------------------------
 * Seven-day replay clustering entrypoint
 * ------------------------------------------------------------------ */

/**
 * @param {Object} [options]
 * @param {number|null} [options.userId]
 */
export async function fullReclusterArticles({ userId = null } = {}) {
  // Case 1: Explicit userId provided
  if (userId) {
    await reclusterForUser(userId);
    return;
  }

  // Case 2: No userId provided, replay the recent window for all users.
  console.log('[SEMANTIC] Stage 1 Events recent replay for ALL users');

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  console.log(
    `[SEMANTIC] Stage 1 Events users=${users.length}`
  );

  for (const user of users) {
    try {
      await reclusterForUser(user.id);
    } catch (err) {
      console.error(
        `[CLUSTER-REBUILD] Failed replay for user ${user.id}:`,
        err
      );
    }
  }

  console.log('[SEMANTIC] Stage 1 Events Finished');
}

export default fullReclusterArticles;

/* ------------------------------------------------------------------
 * CLI runner
 * ------------------------------------------------------------------ */

if (process.argv[1]?.includes('reclusterArticles')) {
  fullReclusterArticles()
    .then(() => {
      console.log('[SEMANTIC] Stage 1 Events Done');
      process.exit(0);
    })
    .catch(err => {
      console.error('[SEMANTIC] Stage 1 Events Failed:', err);
      process.exit(1);
    });
}
