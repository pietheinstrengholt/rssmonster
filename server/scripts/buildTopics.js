// scripts/buildTopics.js
/**
 * Topic builder CLI runner
 *
 * Usage:
 *   npm run topics
 *   node scripts/buildTopics.js
 *   node scripts/buildTopics.js --assignmentContext=incremental
 *   node scripts/buildTopics.js --userId=3
 */

import db from '../models/index.js';
const { User } = db;

import { rebuildTopicsForUser } from '../services/reconcile/reclusterForUser.js';

function parseArgs(argv) {
  const args = argv.slice(2);
  let userId = null;
  let assignmentContext = 'replay';

  for (const arg of args) {
    if (arg.startsWith('--userId=')) {
      userId = Number(arg.split('=')[1]);
    }

    if (arg.startsWith('--assignmentContext=')) {
      const value = String(arg.split('=')[1] || '').toLowerCase();
      if (value === 'incremental' || value === 'replay') {
        assignmentContext = value;
      }
    }
  }

  return { userId, assignmentContext };
}

export async function buildTopics({ userId = null, assignmentContext = 'replay' } = {}) {
  if (userId) {
    await rebuildTopicsForUser(userId, { assignmentContext });
    return;
  }

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  console.log(`[SEMANTIC] Stage 2 Topics assignmentContext=${assignmentContext} users=${users.length}`);

  for (const user of users) {
    try {
      await rebuildTopicsForUser(user.id, { assignmentContext });
    } catch (err) {
      console.error(`[TOPIC BUILD] Failed for user ${user.id}:`, err);
    }
  }

  console.log('[SEMANTIC] Stage 2 Topics Finished');
}

export default buildTopics;

if (process.argv[1]?.includes('buildTopics')) {
  const { userId, assignmentContext } = parseArgs(process.argv);

  buildTopics({ userId, assignmentContext })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[TOPIC BUILD] Fatal error:', err);
      process.exit(1);
    });
}
