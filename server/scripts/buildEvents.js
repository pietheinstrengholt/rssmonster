// scripts/buildEvents.js
/**
 * Event builder CLI runner
 *
 * Usage:
 *   npm run build:events
 *   node scripts/buildEvents.js
 *   node scripts/buildEvents.js --mode=incremental
 *   node scripts/buildEvents.js --mode=replay --userId=3
 *
 * This script intentionally skips topic assignment so events can be built
 * independently from topic construction.
 */

import db from '../models/index.js';
const { User } = db;

import {
  incrementalClusterForUser,
  reclusterForUser
} from '../services/events/reclusterForUser.js';

function parseArgs(argv) {
  const args = argv.slice(2);
  let userId = null;
  let mode = 'replay';

  for (const arg of args) {
    if (arg.startsWith('--userId=')) {
      userId = Number(arg.split('=')[1]);
    }

    if (arg.startsWith('--mode=')) {
      const value = String(arg.split('=')[1] || '').toLowerCase();
      if (value === 'incremental' || value === 'replay') {
        mode = value;
      }
    }
  }

  return { userId, mode };
}

async function runForUser(userId, mode) {
  if (mode === 'incremental') {
    await incrementalClusterForUser(userId, { skipTopicAssignment: true });
    return;
  }

  await reclusterForUser(userId, { skipTopicAssignment: true });
}

export async function buildEvents({ userId = null, mode = 'replay' } = {}) {
  if (userId) {
    await runForUser(userId, mode);
    return;
  }

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  console.log(`[EVENT BUILD] mode=${mode} users=${users.length}`);

  for (const user of users) {
    try {
      await runForUser(user.id, mode);
    } catch (err) {
      console.error(`[EVENT BUILD] Failed for user ${user.id}:`, err);
    }
  }

  console.log('[EVENT BUILD] Finished');
}

export default buildEvents;

if (process.argv[1]?.includes('buildEvents')) {
  const { userId, mode } = parseArgs(process.argv);

  buildEvents({ userId, mode })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[EVENT BUILD] Fatal error:', err);
      process.exit(1);
    });
}
