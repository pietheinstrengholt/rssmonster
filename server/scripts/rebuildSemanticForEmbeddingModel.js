/**
 * Destructively reset and rebuild semantic state for a newly selected embedding model.
 *
 * Only starred articles and articles with at least one click receive new article
 * vectors. Feeds, articles, engagement state, tags, and classifications are preserved.
 *
 * Usage:
 *   npm run semantic:model-rebuild -- --dry-run
 *   npm run semantic:model-rebuild -- --confirm
 *   npm run semantic:model-rebuild -- --confirm --userId=3 --batchSize=100
 */

import dotenv from 'dotenv';
dotenv.config();

import { Op } from 'sequelize';
import db from '../models/index.js';
import { getEmbeddingInfo } from '../services/embeddings/embeddingService.js';
import { markDuplicateArticlesForUser } from '../services/duplicates/articleDuplicates.js';
import {
  backfillHistoricalEventsForUser,
  rebuildAllTopicsForUser
} from '../services/reconcile/semanticPipelineScopes.js';
import { calibrateBehavioralTopicsForUser } from '../services/topics/behavioral/calibrateBehavioralTopics.js';
import { runIslandCalibrationForUser } from '../services/islands/runIslandCalibration.js';
import { backfillEngagedArticleVectors } from './backfillEngagedArticleVectors.js';
import { generateIslandTaxonomyVectors } from './generateIslandTaxonomyVectors.js';
import { resetSemanticStateForUser } from './resetSemanticState.js';

const { Article, Event, Island, IslandTaxonomy, Topic, User, sequelize } = db;
const DEFAULT_BATCH_SIZE = 100;

export function parseSemanticModelRebuildArgs(argv) {
  const options = {
    batchSize: DEFAULT_BATCH_SIZE,
    confirm: false,
    dryRun: false,
    userId: null
  };

  for (const arg of argv.slice(2)) {
    if (arg === '--confirm') options.confirm = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--batchSize=')) options.batchSize = Number(arg.split('=')[1]);
    else if (arg.startsWith('--userId=')) options.userId = Number(arg.split('=')[1]);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
    throw new Error('--batchSize must be a positive integer');
  }
  if (options.userId !== null && (!Number.isInteger(options.userId) || options.userId < 1)) {
    throw new Error('--userId must be a positive integer');
  }
  if (!options.dryRun && !options.confirm) {
    throw new Error('Destructive rebuild requires --confirm. Use --dry-run to inspect the scope.');
  }

  return options;
}

async function loadTargetUsers(userId, models = { User }) {
  if (userId) {
    const user = await models.User.findByPk(userId, { attributes: ['id'], raw: true });
    if (!user) throw new Error(`User ${userId} does not exist`);
    return [user];
  }

  return models.User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']],
    raw: true
  });
}

async function inspectScope(users, models = { Article, Event, Island, IslandTaxonomy, Topic }) {
  const userIds = users.map(user => user.id);
  const userWhere = { userId: { [Op.in]: userIds } };
  const [articles, vectors, rebuildTargets, events, topics, islands, taxonomyVectors] =
    await Promise.all([
      models.Article.count({ where: userWhere }),
      models.Article.count({ where: { ...userWhere, articleVector: { [Op.ne]: null } } }),
      models.Article.count({
        where: {
          ...userWhere,
          [Op.or]: [
            { favoriteInd: 1 },
            { clickedAmount: { [Op.gt]: 0 } }
          ]
        }
      }),
      models.Event.count({ where: userWhere }),
      models.Topic.count({ where: userWhere }),
      models.Island.count({ where: userWhere }),
      models.IslandTaxonomy.count({ where: { vector: { [Op.ne]: null } } })
    ]);

  return { articles, vectors, rebuildTargets, events, topics, islands, taxonomyVectors };
}

async function rebuildDuplicatesForUser(userId, batchSize, markDuplicates) {
  let afterId = 0;
  let scannedCount = 0;
  let duplicateCount = 0;

  while (true) {
    const result = await markDuplicates(userId, { afterId, limit: batchSize });
    scannedCount += result.scannedCount || 0;
    duplicateCount += result.duplicateCount || 0;
    if (!result.scannedCount || !result.lastArticleId) break;
    afterId = result.lastArticleId;
  }

  return { scannedCount, duplicateCount };
}

const defaultDependencies = {
  authenticate: () => sequelize.authenticate(),
  getEmbeddingInfo,
  loadTargetUsers,
  inspectScope,
  resetUser: resetSemanticStateForUser,
  backfillVectors: backfillEngagedArticleVectors,
  regenerateTaxonomy: generateIslandTaxonomyVectors,
  markDuplicates: markDuplicateArticlesForUser,
  rebuildEvents: backfillHistoricalEventsForUser,
  rebuildEventTopics: rebuildAllTopicsForUser,
  rebuildBehavioralTopics: calibrateBehavioralTopicsForUser,
  rebuildIslands: runIslandCalibrationForUser,
  logger: console
};

export async function rebuildSemanticForEmbeddingModel(options = {}, dependencies = {}) {
  const deps = { ...defaultDependencies, ...dependencies };
  const {
    batchSize = DEFAULT_BATCH_SIZE,
    confirm = false,
    dryRun = false,
    userId = null
  } = options;

  if (!dryRun && !confirm) {
    throw new Error('Destructive rebuild requires confirm=true');
  }

  await deps.authenticate();
  const embeddingInfo = await deps.getEmbeddingInfo();
  const users = await deps.loadTargetUsers(userId);
  const scope = await deps.inspectScope(users);

  deps.logger.log(
    `[SEMANTIC MODEL REBUILD] model=${embeddingInfo.model} dimensions=${embeddingInfo.dimensions}`
  );
  deps.logger.log(
    `[SEMANTIC MODEL REBUILD] users=${users.length} articles=${scope.articles} ` +
    `vectorsToClear=${scope.vectors} starredOrClickedTargets=${scope.rebuildTargets} ` +
    `events=${scope.events} topics=${scope.topics} islands=${scope.islands} ` +
    `taxonomyVectors=${scope.taxonomyVectors}`
  );

  if (dryRun) {
    deps.logger.log('[SEMANTIC MODEL REBUILD] DRY RUN, no data changed');
    return { dryRun: true, embeddingInfo, scope, userCount: users.length };
  }

  for (const user of users) {
    await deps.resetUser(user.id, {
      clearArticleVectors: true,
      clearDuplicateState: true,
      resetInterestScores: true
    });
  }

  const vectorResult = await deps.backfillVectors({
    batchSize,
    includeFeedbackSignals: false,
    userId
  });
  const taxonomyResult = await deps.regenerateTaxonomy({ force: true });
  const results = [];

  for (const user of users) {
    const duplicates = await rebuildDuplicatesForUser(
      user.id,
      batchSize,
      deps.markDuplicates
    );
    const events = await deps.rebuildEvents(user.id, {
      batchSize,
      skipTopicAssignment: true
    });
    const eventTopics = await deps.rebuildEventTopics(user.id, {
      assignmentContext: 'full-rebuild'
    });
    const behavioralTopics = await deps.rebuildBehavioralTopics(user.id);
    const islands = await deps.rebuildIslands(user.id, {
      incremental: false,
      touchedEventIds: events.touchedEventIds,
      touchedTopicIds: [
        ...(eventTopics.touchedTopicIds || []),
        ...(behavioralTopics.touchedTopicIds || [])
      ]
    });

    results.push({
      userId: user.id,
      duplicates,
      events,
      eventTopics,
      behavioralTopics,
      islands
    });
  }

  deps.logger.log('[SEMANTIC MODEL REBUILD] Completed');
  return {
    dryRun: false,
    embeddingInfo,
    scope,
    userCount: users.length,
    vectorResult,
    taxonomyResult,
    results
  };
}

export default rebuildSemanticForEmbeddingModel;

if (process.argv[1]?.includes('rebuildSemanticForEmbeddingModel')) {
  const options = parseSemanticModelRebuildArgs(process.argv);
  rebuildSemanticForEmbeddingModel(options)
    .then(() => process.exit(0))
    .catch(error => {
      console.error('[SEMANTIC MODEL REBUILD] Failed:', error.message);
      process.exit(1);
    });
}
