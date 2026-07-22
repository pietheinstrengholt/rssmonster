// scripts/backfillHistoricalEventArticles.js
/**
 * Historical event backfill command runner.
 *
 * Usage:
 *   npm run events:backfill
 *   node scripts/backfillHistoricalEventArticles.js
 *   node scripts/backfillHistoricalEventArticles.js --userId=3
 *   node scripts/backfillHistoricalEventArticles.js --batchSize=500
 *
 * This scope backfills missing events from all vectorized articles. It does not
 * clear or reclassify existing event assignments like a true rebuild would.
 */

import db from '../models/index.js';
const { User } = db;

import { backfillHistoricalEventsForUser } from '../services/reconcile/semanticPipelineScopes.js';

// This function parses CLI flags for the historical event backfill runner.
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

// This function backfills historical event assignment for one user or every user.
export async function backfillHistoricalEventArticles({
  userId = null,
  batchSize = 250,
  skipTopicAssignment = false
} = {}) {
  if (userId) {
    await backfillHistoricalEventsForUser(userId, { batchSize, skipTopicAssignment });
    return;
  }

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  console.log(`[SEMANTIC] Historical event backfill users=${users.length}`);

  for (const user of users) {
    try {
      await backfillHistoricalEventsForUser(user.id, { batchSize, skipTopicAssignment });
    } catch (err) {
      console.error(`[EVENT BACKFILL] Failed for user ${user.id}:`, err);
    }
  }

  console.log('[SEMANTIC] Historical event backfill finished');
}

export default backfillHistoricalEventArticles;

if (process.argv[1]?.includes('backfillHistoricalEventArticles')) {
  const { userId, batchSize, skipTopicAssignment } = parseArgs(process.argv);

  backfillHistoricalEventArticles({ userId, batchSize, skipTopicAssignment })
    .then(() => {
      console.log('[SEMANTIC] Historical event backfill done');
      process.exit(0);
    })
    .catch(err => {
      console.error('[SEMANTIC] Historical event backfill fatal error:', err);
      process.exit(1);
    });
}
