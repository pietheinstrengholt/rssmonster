/**
 * Recluster Articles CLI runner
 *
 * Usage:
 *   npm run recluster
 *   node scripts/reclusterArticles.js
 *
 * Programmatic usage:
 *   fullReclusterArticles({ userId })
 */

import db from '../models/index.js';
const { User } = db;

import { reclusterForUser } from '../util/reclusterForUser.js';



/* ------------------------------------------------------------------
 * FULL reclustering entrypoint
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

  // Case 2: No userId → recluster all users
  console.log('[CLUSTER-REBUILD] No userId provided, reclustering ALL users');

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  console.log(
    `[CLUSTER-REBUILD] Found ${users.length} users to recluster`
  );

  for (const user of users) {
    try {
      await reclusterForUser(user.id);
    } catch (err) {
      console.error(
        `[CLUSTER-REBUILD] Failed reclustering for user ${user.id}:`,
        err
      );
    }
  }

  console.log('[CLUSTER-REBUILD] Finished reclustering ALL users');
}

export default fullReclusterArticles;

/* ------------------------------------------------------------------
 * CLI runner
 * ------------------------------------------------------------------ */

if (process.argv[1]?.includes('reclusterArticles')) {
  fullReclusterArticles()
    .then(() => {
      console.log('[CLUSTER-REBUILD] Done');
      process.exit(0);
    })
    .catch(err => {
      console.error('[CLUSTER-REBUILD] Failed:', err);
      process.exit(1);
    });
}