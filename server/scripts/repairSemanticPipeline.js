/**
 * Recent semantic repair pipeline.
 *
 * Usage:
 *   npm run semantic:repair
 *   node scripts/repairSemanticPipeline.js
 *   node scripts/repairSemanticPipeline.js --userId=3
 */

import dotenv from 'dotenv';
dotenv.config();

import db from '../models/index.js';
import { repairRecentEventsForUser } from '../services/reconcile/semanticPipelineScopes.js';
import scoreArticlesFromIslandsForUser from '../services/score/scoreArticlesFromIslands.js';

const { User, sequelize } = db;

// This function parses CLI flags for semantic pipeline runners.
function parseArgs(argv) {
  const userIdArg = argv.slice(2).find(arg => arg.startsWith('--userId='));
  const userId = userIdArg ? Number(userIdArg.split('=')[1]) : null;

  return {
    userId: Number.isFinite(userId) && userId > 0 ? userId : null
  };
}

// This function loads the users that should be processed by a semantic pipeline.
async function loadUsers(userId = null) {
  if (userId) {
    return [{ id: userId }];
  }

  return User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']],
    raw: true
  });
}

// This function runs the recent semantic repair pipeline for one user.
async function repairUser(userId) {
  console.log(`[SEMANTIC] user=${userId} Stage 1 Events`);
  const eventResult = await repairRecentEventsForUser(userId, { skipTopicAssignment: false });

  console.log(
    `[SEMANTIC] user=${userId} stage=events ` +
    `articles=${eventResult.articleCount} ` +
    `newEvents=${eventResult.newEventsCreatedCount} ` +
    `linked=${eventResult.linkedToExistingEventCount} ` +
    `unassigned=${eventResult.unassignedCount} ` +
    `touchedEvents=${eventResult.touchedEventIds.length}`
  );

  const topicStats = eventResult.topicAssignment?.stats || {};
  console.log(`[SEMANTIC] user=${userId} Stage 2 Topics`);
  console.log(
    `[SEMANTIC] user=${userId} stage=topics ` +
    `touchedTopics=${eventResult.touchedTopicIds.length} ` +
    `createdTopics=${topicStats.newTopicsCreated || 0} ` +
    `matchedEvents=${topicStats.eventsMatched || 0} ` +
    `unmatchedEvents=${topicStats.eventsUnmatched || 0}`
  );

  console.log(`[SEMANTIC] user=${userId} Stage 3 Interest Scores`);
  const scoringResult = await scoreArticlesFromIslandsForUser(userId);
  console.log(
    `[SEMANTIC] user=${userId} stage=interest-scores ` +
    `updated=${scoringResult.updatedCount || 0} ` +
    `topicScored=${scoringResult.topicScoredCount || 0} ` +
    `fallbackScored=${scoringResult.fallbackScoredCount || 0}`
  );

  console.log(`[SEMANTIC] user=${userId} Finished`);

  return {
    userId,
    events: eventResult,
    interestScores: scoringResult
  };
}

// This function runs recent semantic repair for one user or every user.
export async function repairSemanticPipeline({ userId = null } = {}) {
  await sequelize.authenticate();
  const users = await loadUsers(userId);
  const results = [];

  console.log('[SEMANTIC] Recent repair started');
  console.log(`[SEMANTIC] users=${users.length}`);

  for (const user of users) {
    try {
      results.push(await repairUser(user.id));
    } catch (err) {
      console.error(`[SEMANTIC] user=${user.id} repair failed:`, err);
    }
  }

  console.log('[SEMANTIC] Recent repair Finished');

  return {
    userCount: users.length,
    results
  };
}

export default repairSemanticPipeline;

if (process.argv[1]?.includes('repairSemanticPipeline')) {
  const { userId } = parseArgs(process.argv);

  repairSemanticPipeline({ userId })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[SEMANTIC] Recent repair failed:', err);
      process.exit(1);
    });
}




