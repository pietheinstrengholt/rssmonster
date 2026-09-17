import { activeIslandWhere } from './islandDeadline.js';
import { randomUUID } from 'node:crypto';
import { Op, Transaction } from 'sequelize';
import db from '../../models/index.js';
import scoreArticlesFromIslandsForUser from '../score/scoreArticlesFromIslands.js';
import { buildInterestIslandProfilesForUser as buildIslandProfilesForUser } from './islandArticleProfiles.js';
import { persistInterestIslandProfiles } from './islandPersistence.js';
import { DEFAULT_MAX_ISLANDS_PER_USER } from './islandVectorUtils.js';
import { recordProcessingFailure } from '../observability/processingFailures.js';
import { tryEnqueueGeneratedSemanticLabelJobsForUser } from '../semanticLabels/semanticLabelJobs.js';

// This service recalibrates "interest islands" from user behavior.
// Islands represent durable preference areas that can later score articles.

// Provides the shared dependencies used by this service.
const { User, Island, sequelize } = db;

export { cosineSimilarity } from './islandVectorUtils.js';
export { buildIslandProfilesForUser };

// This function formats integers for island summary logs.
function formatIslandCount(value) {
  return Number(value || 0).toLocaleString('en-US');
}

// This function formats elapsed time for island summary logs.
function formatElapsedSeconds(startedAt) {
  return ((Date.now() - startedAt) / 1000).toFixed(1);
}

// This function writes the island run header for one user.
function logIslandRunStart(userId) {
  console.log('[ISLAND] ==================================================');
  console.log(`[ISLAND] Recalibrating Interest Islands for user ${userId}`);
  console.log('[ISLAND] ==================================================');
}

// This function writes the island run summary for one user.
async function logIslandRunSummary(userId, result, startedAt) {
  const activeIslandCount = await Island.count({ where: { userId, ...activeIslandWhere() } });
  const persistence = result.persistenceSummary || {};

  console.log('[ISLAND] =============================================');
  console.log(`[ISLAND] Existing islands.............. ${formatIslandCount(persistence.existingIslandCount)}`);
  console.log(`[ISLAND] New islands................... ${formatIslandCount(persistence.createdIslandCount)}`);
  console.log(`[ISLAND] Archived islands.............. ${formatIslandCount(persistence.archivedIslandCount)}`);
  console.log(`[ISLAND] Active islands................ ${formatIslandCount(activeIslandCount)}`);
  console.log('[ISLAND]');
  console.log('[ISLAND]');
  console.log(`[ISLAND] Articles evaluated............ ${formatIslandCount(result.candidatesRescored)}`);
  console.log(`[ISLAND] Nonzero interest.............. ${formatIslandCount(result.rescoredArticleCount)}`);
  console.log(`[ISLAND] Interest values changed....... ${formatIslandCount(result.interestScoresChanged)}`);
  console.log(`[ISLAND]  └─ via Island vectors........ ${formatIslandCount(result.fallbackScoredCount)}`);
  console.log('[ISLAND]');
  console.log(`[ISLAND] Finished...................... ${formatElapsedSeconds(startedAt)} sec`);
  console.log('[ISLAND] =============================================');
}

// This function persists calibrated island profiles for one user.
export async function persistIslandProfilesForUser(userId, profiles, options = {}) {
  // Derives the islands through transaction while performing persist island profiles for user.
  const islands = await sequelize.transaction(
    sequelize.getDialect() === 'sqlite' ? { type: Transaction.TYPES.IMMEDIATE } : {}, async transaction => {
      // Serialize the read/selection/write sequence, including concurrent manual and worker calibrations.
      const user = await User.findByPk(userId, { transaction, lock: Transaction.LOCK.UPDATE });
      if (!user) throw new Error('Island user no longer exists');
      const persisted = await persistInterestIslandProfiles(userId, profiles, transaction, options);
      await options.afterPersist?.(transaction, {
        userId, islandCount: persisted.length,
        articleCount: profiles.reduce((sum, profile) => sum + (profile.articles || []).length, 0)
      });
      return persisted;
    });

  // Aggregates source values into the result produced while performing persist island profiles for user.
  return {
    userId,
    islandCount: islands.length,
    articleCount: profiles.reduce((sum, profile) => sum + (profile.articles || []).length, 0),
    persistenceSummary: islands.summary || {},
    profiles
  };
}

// This function calibrates behavior-derived island profiles for one user.
export async function calibrateIslandsFromBehaviorForUser(userId, options = {}) {
  // Builds the island profiles for user while performing calibrate islands from behavior for user.
  const profiles = await buildIslandProfilesForUser(userId, options);
  return persistIslandProfilesForUser(userId, profiles, options);
}

// This function calibrates behavior-derived islands for one user or every user.
export async function calibrateIslandsFromBehavior(options = {}) {
  const { userId = null, maxIslands = DEFAULT_MAX_ISLANDS_PER_USER } = options;

  // Returns early when user id is available.
  if (userId) {
    try {
      return await calibrateIslandsFromBehaviorForUser(userId, { ...options, maxIslands });
    } catch (error) {
      await recordProcessingFailure({
        crawlRunId: options.processingContext?.crawlRunId || null,
        executionId: options.processingContext?.executionId || randomUUID(),
        userId,
        stage: 'island_calibration',
        severity: 'FATAL',
        error,
        subjectType: 'user',
        subjectId: userId
      });
      throw error;
    }
  }

  // Loads the users needed while performing calibrate islands from behavior.
  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  // Collects the results while performing calibrate islands from behavior.
  const results = [];

  // Processes each users entry in turn.
  for (const user of users) {
    try {
      // Derives the result through calibrate islands from behavior for user while performing calibrate islands from behavior.
      const result = await calibrateIslandsFromBehaviorForUser(user.id, { ...options, maxIslands });
      results.push(result);
    } catch (err) {
      await recordProcessingFailure({
        crawlRunId: options.processingContext?.crawlRunId || null,
        executionId: options.processingContext?.executionId || randomUUID(),
        userId: user.id,
        stage: 'island_calibration',
        severity: 'FATAL',
        error: err,
        subjectType: 'user',
        subjectId: user.id
      });
      console.error(`[ISLANDS] Failed calibrating interest islands for user ${user.id}:`, err);
    }
  }

  return {
    userCount: users.length,
    results
  };
}

// This function orchestrates island calibration for one user and refreshes article scores.
export async function runIslandCalibrationForUser(userId, options = {}) {
  // Derives the started at through now while performing run island calibration for user.
  const startedAt = Date.now();
  // A delayed scoring retry must not present an older calibration as fresh evidence.
  const refreshedAt = options.persistedCalibration
    ? options.persistedCalibration.refreshedAt ? new Date(options.persistedCalibration.refreshedAt) : null
    : new Date(startedAt);
  const processingContext = {
    crawlRunId: options.processingContext?.crawlRunId || null,
    executionId: options.processingContext?.executionId || randomUUID(),
    userId
  };
  logIslandRunStart(userId);
  // Derives the behavior result through calibrate islands from behavior for user while performing run island calibration for user.
  let behaviorResult;
  const calibrationStarted = performance.now();
  try {
    behaviorResult = options.persistedCalibration || await calibrateIslandsFromBehaviorForUser(userId, {
      ...options,
      afterPersist: options.afterPersist && ((transaction, summary) => options.afterPersist(transaction, {
        ...summary, refreshedAt: refreshedAt.toISOString()
      }))
    });
  } catch (error) {
    await recordProcessingFailure({
      ...processingContext,
      stage: 'island_calibration',
      severity: 'FATAL',
      error,
      subjectType: 'user',
      subjectId: userId
    });
    throw error;
  }
  const calibrationDurationMs = options.persistedCalibration ? 0 : Math.round(performance.now() - calibrationStarted);
  // Derives the scoring result through score articles from islands for user while performing run island calibration for user.
  let scoringResult;
  try {
    scoringResult = await scoreArticlesFromIslandsForUser(userId, { assertLease: options.assertLease });
  } catch (error) {
    await recordProcessingFailure({
      ...processingContext,
      stage: 'interest_scoring',
      severity: 'FATAL',
      error,
      subjectType: 'user',
      subjectId: userId
    });
    throw error;
  }

  // Builds the result assembled while performing run island calibration for user.
  const result = {
    userId,
    calibrationDurationMs,
    candidatesRescored: Number(scoringResult?.candidatesRescored || 0),
    interestScoresChanged: Number(scoringResult?.interestScoresChanged || 0),
    islandCount: behaviorResult.islandCount,
    articleCount: behaviorResult.articleCount,
    fallbackScoredCount: Number(scoringResult?.fallbackScoredCount || 0),
    rescoredArticleCount: Number(scoringResult?.updatedCount || 0),
    interestFunnel: scoringResult,
    persistenceSummary: behaviorResult.persistenceSummary,
    profiles: behaviorResult.profiles
  };

  const createdIslandIds = behaviorResult.persistenceSummary?.createdIslandIds || [];
  if (createdIslandIds.length && options.generateLabels !== false) {
    await tryEnqueueGeneratedSemanticLabelJobsForUser(userId, { islandIds: createdIslandIds });
  }

  await logIslandRunSummary(userId, result, startedAt);

  await options.assertLease?.();
  // Record only completed calibration + scoring, and never move freshness backwards.
  // Legacy checkpoints have unknown evidence age and must remain due after scoring succeeds.
  if (refreshedAt) {
    await User.update({ personalizationRefreshedAt: refreshedAt }, {
      where: { id: userId, [Op.or]: [
        { personalizationRefreshedAt: null }, { personalizationRefreshedAt: { [Op.lt]: refreshedAt } }
      ] }, silent: true
    });
    result.refreshedAt = refreshedAt.toISOString();
  }

  return result;
}

// This function orchestrates island calibration for one user or every user.
export async function runIslandCalibration(options = {}) {
  const { userId = null, maxIslands = DEFAULT_MAX_ISLANDS_PER_USER } = options;

  // Returns early when user id is available.
  if (userId) {
    return runIslandCalibrationForUser(userId, { ...options, maxIslands });
  }

  // Loads the users needed while performing run island calibration.
  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  // Collects the results while performing run island calibration.
  const results = [];

  // Processes each users entry in turn.
  for (const user of users) {
    try {
      // Derives the result through run island calibration for user while performing run island calibration.
      const result = await runIslandCalibrationForUser(user.id, { ...options, maxIslands });
      results.push(result);
    } catch (err) {
      await recordProcessingFailure({
        crawlRunId: options.processingContext?.crawlRunId || null,
        executionId: options.processingContext?.executionId || randomUUID(),
        userId: user.id,
        stage: 'island_calibration',
        severity: 'FATAL',
        error: err,
        subjectType: 'user',
        subjectId: user.id
      });
      console.error(`[ISLANDS] Failed calibrating interest islands for user ${user.id}:`, err);
    }
  }

  return {
    userCount: users.length,
    results
  };
}

export default runIslandCalibration;
