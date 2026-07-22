/**
 * Full historical semantic rebuild pipeline.
 *
 * Usage:
 *   npm run semantic:all
 *   node scripts/rebuildSemanticPipeline.js
 *   node scripts/rebuildSemanticPipeline.js --userId=3
 *   node scripts/rebuildSemanticPipeline.js --batchSize=500
 */

import dotenv from 'dotenv';
dotenv.config();

import db from '../models/index.js';
import {
  rebuildAllTopicsForUser,
  backfillHistoricalEventsForUser
} from '../services/reconcile/semanticPipelineScopes.js';
import { runIslandCalibrationForUser } from '../services/islands/runIslandCalibration.js';

const { User, sequelize } = db;

// This function parses CLI flags for the full semantic rebuild runner.
function parseArgs(argv) {
  const args = argv.slice(2);
  let userId = null;
  let batchSize = 250;

  for (const arg of args) {
    if (arg.startsWith('--userId=')) {
      userId = Number(arg.split('=')[1]);
    }

    if (arg.startsWith('--batchSize=')) {
      batchSize = Number(arg.split('=')[1]);
    }
  }

  return {
    userId: Number.isFinite(userId) && userId > 0 ? userId : null,
    batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 250
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

// This function runs the full semantic rebuild pipeline for one user.
async function rebuildUser(userId, options = {}) {
  console.log(`[SEMANTIC] user=${userId} Stage 1 Historical Event Backfill`);
  const eventResult = await backfillHistoricalEventsForUser(userId, {
    batchSize: options.batchSize,
    skipTopicAssignment: true
  });

  console.log(
    `[SEMANTIC] user=${userId} stage=events ` +
    `articles=${eventResult.articleCount} ` +
    `newEvents=${eventResult.newEventsCreatedCount} ` +
    `linked=${eventResult.linkedToExistingEventCount} ` +
    `unassigned=${eventResult.unassignedCount} ` +
    `touchedEvents=${eventResult.touchedEventIds.length}`
  );

  console.log(`[SEMANTIC] user=${userId} Stage 2 Topics`);
  const topicResult = await rebuildAllTopicsForUser(userId, {
    assignmentContext: 'full-rebuild'
  });
  console.log(
    `[SEMANTIC] user=${userId} stage=topics ` +
    `touchedTopics=${topicResult.touchedTopicIds.length} ` +
    `createdTopics=${topicResult.stats.newTopicsCreated || 0} ` +
    `matchedEvents=${topicResult.stats.eventsMatched || 0} ` +
    `unmatchedEvents=${topicResult.stats.eventsUnmatched || 0}`
  );

  console.log(`[SEMANTIC] user=${userId} Stage 3 Interest Islands`);
  const islandResult = await runIslandCalibrationForUser(userId, {
    incremental: false,
    touchedEventIds: eventResult.touchedEventIds,
    touchedTopicIds: topicResult.touchedTopicIds
  });
  console.log(
    `[SEMANTIC] user=${userId} stage=islands ` +
    `islands=${islandResult.islandCount || 0} ` +
    `enriched=${islandResult.enrichedIslandCount || 0} ` +
    `islandTopicLinks=${islandResult.islandTopicLinkCount || 0}`
  );

  console.log(`[SEMANTIC] user=${userId} Stage 4 Interest Scores`);
  console.log(
    `[SEMANTIC] user=${userId} stage=interest-scores ` +
    `updated=${islandResult.rescoredArticleCount || 0} ` +
    `topicScored=${islandResult.topicScoredCount || 0} ` +
    `fallbackScored=${islandResult.fallbackScoredCount || 0}`
  );

  console.log(`[SEMANTIC] user=${userId} Finished`);

  return {
    userId,
    events: eventResult,
    topics: topicResult,
    islands: islandResult
  };
}

// This function runs a full historical semantic rebuild for one user or every user.
export async function rebuildSemanticPipeline({
  userId = null,
  batchSize = 250
} = {}) {
  await sequelize.authenticate();
  const users = await loadUsers(userId);
  const results = [];

  console.log('[SEMANTIC] Historical rebuild started');
  console.log(`[SEMANTIC] users=${users.length} batchSize=${batchSize}`);

  for (const user of users) {
    try {
      results.push(await rebuildUser(user.id, { batchSize }));
    } catch (err) {
      console.error(`[SEMANTIC] user=${user.id} rebuild failed:`, err);
    }
  }

  console.log('[SEMANTIC] Historical rebuild Finished');

  return {
    userCount: users.length,
    results
  };
}

export default rebuildSemanticPipeline;

if (process.argv[1]?.includes('rebuildSemanticPipeline')) {
  const { userId, batchSize } = parseArgs(process.argv);

  rebuildSemanticPipeline({ userId, batchSize })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[SEMANTIC] Historical rebuild failed:', err);
      process.exit(1);
    });
}


