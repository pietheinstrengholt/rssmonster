// scripts/runEventsCommand.js
/**
 * Events command runner.
 *
 * Scope:
 *   npm run events defaults to recent-repair event assignment.
 *   --scope=incremental processes only currently unassigned recent articles.
 *
 * Usage:
 *   npm run events
 *   node scripts/runEventsCommand.js
 *   node scripts/runEventsCommand.js --scope=incremental
 *   node scripts/runEventsCommand.js --scope=recent-repair --userId=3
 *
 * This script intentionally skips topic assignment so events can be built
 * independently from topic construction.
 */

import db from '../models/index.js';
const { User } = db;

import {
  runIncrementalEventsForUser,
  repairRecentEventsForUser
} from '../services/reconcile/semanticPipelineScopes.js';

function parseArgs(argv) {
  const args = argv.slice(2);
  let userId = null;
  let scope = 'recent-repair';

  for (const arg of args) {
    if (arg.startsWith('--userId=')) {
      userId = Number(arg.split('=')[1]);
    }

    if (arg.startsWith('--scope=')) {
      const value = String(arg.split('=')[1] || '').toLowerCase();
      if (value === 'incremental' || value === 'recent-repair') {
        scope = value;
      }
    }
  }

  return { userId, scope };
}

async function runForUser(userId, scope) {
  if (scope === 'incremental') {
    await runIncrementalEventsForUser(userId, { skipTopicAssignment: true });
    return;
  }

  await repairRecentEventsForUser(userId, { skipTopicAssignment: true });
}

export async function runEventsCommand({ userId = null, scope = 'recent-repair' } = {}) {
  if (userId) {
    await runForUser(userId, scope);
    return;
  }

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  console.log(`[SEMANTIC] Stage 1 Events scope=${scope} users=${users.length}`);

  for (const user of users) {
    try {
      await runForUser(user.id, scope);
    } catch (err) {
      console.error(`[EVENT ${scope.toUpperCase()}] Failed for user ${user.id}:`, err);
    }
  }

  console.log('[SEMANTIC] Stage 1 Events Finished');
}

export default runEventsCommand;

if (process.argv[1]?.includes('runEventsCommand')) {
  const { userId, scope } = parseArgs(process.argv);

  runEventsCommand({ userId, scope })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[EVENT COMMAND] Fatal error:', err);
      process.exit(1);
    });
}

