// scripts/runTopicsCommand.js
/**
 * Topics command runner.
 *
 * Scope:
 *   npm run topics is the full-rebuild topic assignment utility.
 *
 * Usage:
 *   npm run topics
 *   node scripts/runTopicsCommand.js
 *   node scripts/runTopicsCommand.js --scope=full-rebuild
 *   node scripts/runTopicsCommand.js --userId=3
 */

import db from '../models/index.js';
const { User } = db;

import { rebuildAllTopicsForUser } from '../services/reconcile/semanticPipelineScopes.js';

function parseArgs(argv) {
  const args = argv.slice(2);
  let userId = null;
  let scope = 'full-rebuild';

  for (const arg of args) {
    if (arg.startsWith('--userId=')) {
      userId = Number(arg.split('=')[1]);
    }

    if (arg.startsWith('--scope=')) {
      const value = String(arg.split('=')[1] || '').toLowerCase();
      if (value === 'full-rebuild' || value === 'recent-repair' || value === 'incremental') {
        scope = value;
      }
    }
  }

  return { userId, scope };
}

function assignmentContextForScope(scope) {
  return scope === 'incremental' ? 'incremental' : scope;
}

export async function runTopicsCommand({ userId = null, scope = 'full-rebuild' } = {}) {
  const assignmentContext = assignmentContextForScope(scope);

  if (userId) {
    await rebuildAllTopicsForUser(userId, { assignmentContext });
    return;
  }

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  console.log(`[SEMANTIC] Stage 2 Topics scope=${scope} users=${users.length}`);

  for (const user of users) {
    try {
      await rebuildAllTopicsForUser(user.id, { assignmentContext });
    } catch (err) {
      console.error(`[TOPIC ${scope.toUpperCase()}] Failed for user ${user.id}:`, err);
    }
  }

  console.log('[SEMANTIC] Stage 2 Topics Finished');
}

export default runTopicsCommand;

if (process.argv[1]?.includes('runTopicsCommand')) {
  const { userId, scope } = parseArgs(process.argv);

  runTopicsCommand({ userId, scope })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[TOPIC COMMAND] Fatal error:', err);
      process.exit(1);
    });
}

