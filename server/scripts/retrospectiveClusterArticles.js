// scripts/retrospectiveClusterArticles.js
/**
 * Retrospective event clustering CLI runner
 *
 * Usage:
 *   npm run recluster:retrospective
 *   node scripts/retrospectiveClusterArticles.js
 *   node scripts/retrospectiveClusterArticles.js --userId=3
 *   node scripts/retrospectiveClusterArticles.js --batchSize=500
 *
 * This backfills events from all vectorized articles instead of the recent
 * replay window used by reclusterArticles.js.
 */

import db from '../models/index.js';
const { User } = db;

import { retrospectiveClusterForUser } from '../services/events/reclusterForUser.js';

// This function parses CLI flags for the retrospective clustering runner.
function parseArgs(argv) {
  const args = argv.slice(2);
  let userId = null;
  let batchSize = 250;
  let skipTopicAssignment = false;

  for (const arg of args) {
    if (arg.startsWith('--userId=')) {
      userId = Number(arg.split('=')[1]);
    }

    if (arg.startsWith('--batchSize=')) {
      batchSize = Number(arg.split('=')[1]);
    }

    if (arg === '--skipTopicAssignment') {
      skipTopicAssignment = true;
    }
  }

  return {
    userId: Number.isFinite(userId) && userId > 0 ? userId : null,
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 250,
    skipTopicAssignment
  };
}

// This function runs retrospective clustering for one user or every user.
export async function retrospectiveClusterArticles({
  userId = null,
  batchSize = 250,
  skipTopicAssignment = false
} = {}) {
  if (userId) {
    await retrospectiveClusterForUser(userId, { batchSize, skipTopicAssignment });
    return;
  }

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  console.log(
    `[CLUSTER-RETROSPECTIVE] Found ${users.length} users to retrospectively cluster`
  );

  for (const user of users) {
    try {
      await retrospectiveClusterForUser(user.id, { batchSize, skipTopicAssignment });
    } catch (err) {
      console.error(
        `[CLUSTER-RETROSPECTIVE] Failed for user ${user.id}:`,
        err
      );
    }
  }

  console.log('[CLUSTER-RETROSPECTIVE] Finished retrospective clustering');
}

export default retrospectiveClusterArticles;

if (process.argv[1]?.includes('retrospectiveClusterArticles')) {
  const { userId, batchSize, skipTopicAssignment } = parseArgs(process.argv);

  retrospectiveClusterArticles({ userId, batchSize, skipTopicAssignment })
    .then(() => {
      console.log('[CLUSTER-RETROSPECTIVE] Done');
      process.exit(0);
    })
    .catch(err => {
      console.error('[CLUSTER-RETROSPECTIVE] Fatal error:', err);
      process.exit(1);
    });
}
