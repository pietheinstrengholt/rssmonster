// scripts/rebuildAllEventArticles.js
/**
 * Full-rebuild events command runner.
 *
 * Usage:
 *   npm run events:all
 *   node scripts/rebuildAllEventArticles.js
 *   node scripts/rebuildAllEventArticles.js --userId=3
 *   node scripts/rebuildAllEventArticles.js --batchSize=500
 *
 * This full-rebuild scope backfills events from all vectorized articles instead
 * of the recent-repair window used by repairRecentArticles.js.
 */

import db from '../models/index.js';
const { User } = db;

import { rebuildAllEventsForUser } from '../services/reconcile/semanticPipelineScopes.js';

// This function parses CLI flags for the full-rebuild event runner.
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

// This function runs full-rebuild event assignment for one user or every user.
export async function rebuildAllEventArticles({
  userId = null,
  batchSize = 250,
  skipTopicAssignment = false
} = {}) {
  if (userId) {
    await rebuildAllEventsForUser(userId, { batchSize, skipTopicAssignment });
    return;
  }

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  console.log(
    `[SEMANTIC] Stage 1 Events historical users=${users.length}`
  );

  for (const user of users) {
    try {
      await rebuildAllEventsForUser(user.id, { batchSize, skipTopicAssignment });
    } catch (err) {
      console.error(
        `[EVENT FULL-REBUILD] Failed for user ${user.id}:`,
        err
      );
    }
  }

  console.log('[SEMANTIC] Stage 1 Events Historical Finished');
}

export default rebuildAllEventArticles;

if (process.argv[1]?.includes('rebuildAllEventArticles')) {
  const { userId, batchSize, skipTopicAssignment } = parseArgs(process.argv);

  rebuildAllEventArticles({ userId, batchSize, skipTopicAssignment })
    .then(() => {
      console.log('[SEMANTIC] Stage 1 Events Historical Done');
      process.exit(0);
    })
    .catch(err => {
      console.error('[SEMANTIC] Stage 1 Events Historical Fatal error:', err);
      process.exit(1);
    });
}

