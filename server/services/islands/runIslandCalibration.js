import { Op } from 'sequelize';
import { randomUUID } from 'node:crypto';
import db from '../../models/index.js';
import scoreArticlesFromIslandsForUser from '../score/scoreArticlesFromIslands.js';
import { buildInterestIslandProfilesForUser as buildIslandProfilesForUser } from './islandArticleProfiles.js';
import { buildTopicInterestIslandProfilesForUser } from './islandTopicProfiles.js';
import { buildPopulationAuditEntry, appendPopulationAudit } from './islandAudit.js';
import { evolveIslandTopicMemberships } from './islandMemberships.js';
import { persistInterestIslandProfiles } from './islandPersistence.js';
import {
  DEFAULT_MAX_ISLANDS_PER_USER,
  DEFAULT_TOPIC_CONFIDENCE_THRESHOLD,
  DEFAULT_TOPIC_ENRICHMENT_SIMILARITY_THRESHOLD,
  clamp,
  cosineSimilarity,
  resolveTaxonomyDisplayName,
  resolveTopicFallbackLabel,
  sortIslandsByWeight
} from './islandVectorUtils.js';
import { recordProcessingFailure } from '../observability/processingFailures.js';

// This service recalibrates "interest islands" from user behavior and topic history.
// Islands represent durable preference areas that can later score articles and group topics.

// Provides the shared dependencies used by this service.
const { User, Island, IslandTaxonomy, Sequelize, sequelize } = db;

export { cosineSimilarity } from './islandVectorUtils.js';
export { buildIslandProfilesForUser };
export { buildTopicInterestIslandProfilesForUser } from './islandTopicProfiles.js';

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
  // Loads the related records concurrently while performing log island run summary.
  const [activeIslandCount, topicMembershipRows, largestIslandRows] = await Promise.all([
    Island.count({ where: { userId, archivedInd: false } }),
    sequelize.query(
      `
        SELECT COUNT(*) AS count
        FROM island_topics AS islandTopic
        INNER JOIN islands AS island
          ON island.id = islandTopic.islandId
        WHERE island.userId = :userId
      `,
      {
        replacements: { userId },
        type: Sequelize.QueryTypes.SELECT
      }
    ),
    sequelize.query(
      `
        SELECT islandTopic.islandId, COUNT(islandTopic.topicId) AS topicCount
        FROM island_topics AS islandTopic
        INNER JOIN islands AS island
          ON island.id = islandTopic.islandId
        WHERE island.userId = :userId
        GROUP BY islandTopic.islandId
        ORDER BY topicCount DESC
        LIMIT 1
      `,
      {
        replacements: { userId },
        type: Sequelize.QueryTypes.SELECT
      }
    )
  ]);

  // Derives the persistence required while performing log island run summary.
  const persistence = result.persistenceSummary || {};
  // Coerces the topic membership count into the representation required while performing log island run summary.
  const topicMembershipCount = Number(topicMembershipRows?.[0]?.count || 0);
  // Selects the average topics per island based on whether active island count is available.
  const averageTopicsPerIsland = activeIslandCount
    ? (topicMembershipCount / activeIslandCount).toFixed(1)
    : '0.0';
  // Coerces the largest island topic count into the representation required while performing log island run summary.
  const largestIslandTopicCount = Number(largestIslandRows?.[0]?.topicCount || 0);

  console.log('[ISLAND] =============================================');
  console.log(`[ISLAND] Existing islands.............. ${formatIslandCount(persistence.existingIslandCount)}`);
  console.log(`[ISLAND] New islands................... ${formatIslandCount(persistence.createdIslandCount)}`);
  console.log(`[ISLAND] Archived islands.............. ${formatIslandCount(persistence.archivedIslandCount)}`);
  console.log(`[ISLAND] Active islands................ ${formatIslandCount(activeIslandCount)}`);
  console.log('[ISLAND]');
  console.log(`[ISLAND] Topic memberships............. ${formatIslandCount(topicMembershipCount)}`);
  console.log(`[ISLAND] New memberships............... ${formatIslandCount((persistence.newMembershipCount || 0) + (result.enrichmentNewMembershipCount || 0))}`);
  console.log(`[ISLAND] Removed memberships........... ${formatIslandCount((persistence.removedMembershipCount || 0) + (result.enrichmentRemovedMembershipCount || 0))}`);
  console.log('[ISLAND]');
  console.log(`[ISLAND] Articles scored............... ${formatIslandCount(result.rescoredArticleCount)}`);
  console.log(`[ISLAND]  ├─ via Topics................ ${formatIslandCount(result.topicScoredCount)}`);
  console.log(`[ISLAND]  └─ via Island vectors........ ${formatIslandCount(result.fallbackScoredCount)}`);
  console.log('[ISLAND]');
  console.log(`[ISLAND] Average topics/island......... ${averageTopicsPerIsland}`);
  console.log(`[ISLAND] Largest island................ ${formatIslandCount(largestIslandTopicCount)} topics`);
  console.log(`[ISLAND] Finished...................... ${formatElapsedSeconds(startedAt)} sec`);
  console.log('[ISLAND] =============================================');
}

// This function persists calibrated island profiles for one user.
export async function persistIslandProfilesForUser(userId, profiles, options = {}) {
  // Derives the islands through transaction while performing persist island profiles for user.
  const islands = await sequelize.transaction((transaction) =>
    persistInterestIslandProfiles(userId, profiles, transaction, options)
  );

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

// This function enriches existing islands with topic memberships based on vector similarity.
export async function enrichIslandsFromTopicsForUser(userId, options = {}) {
  // Resolves the topic confidence threshold that governs performing enrich islands from topics for user.
  const topicConfidenceThreshold =
    options.topicConfidenceThreshold ?? DEFAULT_TOPIC_CONFIDENCE_THRESHOLD;

  // Runs the callback required while performing enrich islands from topics for user.
  return sequelize.transaction(async (transaction) => {
    // Loads the related records concurrently while performing enrich islands from topics for user.
    const [islandRows, topicProfiles, taxonomyRows] = await Promise.all([
      Island.findAll({
        where: { userId, archivedInd: false, islandVector: { [Op.ne]: null } },
        transaction
      }),
      buildTopicInterestIslandProfilesForUser(userId, options),
      IslandTaxonomy.findAll({
        where: {
          status: 'active',
          vector: { [Op.ne]: null }
        },
        attributes: ['displayName', 'vector'],
        transaction
      })
    ]);
    // Derives the islands through sort islands by weight while performing enrich islands from topics for user.
    const islands = sortIslandsByWeight(islandRows);

    let enrichedIslandCount = 0;
    let islandTopicLinkCount = 0;
    let enrichmentNewMembershipCount = 0;
    let enrichmentRemovedMembershipCount = 0;

    // Processes each islands entry in turn.
    for (const island of islands) {
      // Keeps the candidate topic rows entries eligible while performing enrich islands from topics for user.
      const candidateTopicRows = topicProfiles
        .flatMap(profile => profile.topics || [])
        .filter(topic => Array.isArray(topic.vector) && topic.vector.length)
        .map(topic => {
          // Derives the similarity through cosine similarity while performing enrich islands from topics for user.
          const similarity = cosineSimilarity(island.islandVector, topic.vector);
          // Derives the evidence through clamp while performing enrich islands from topics for user.
          const evidence = clamp(
            Math.abs(Number(topic.strength || 0)) + Math.min(Number(topic.evidenceCount || 0), 5) * 0.04,
            0.25,
            1
          );

          return {
            topicId: topic.topicId,
            similarity: Number(similarity.toFixed(4)),
            confidence: Number(clamp(similarity * evidence, 0, 1).toFixed(4))
          };
        })
        .filter(row =>
          row.similarity >= DEFAULT_TOPIC_ENRICHMENT_SIMILARITY_THRESHOLD &&
          row.confidence >= topicConfidenceThreshold
        );
      // Derives the topic rows by id required while performing enrich islands from topics for user.
      const topicRowsById = new Map();

      // Processes each candidate topic rows entry in turn.
      for (const row of candidateTopicRows) {
        // Coerces the topic id into the representation required while performing enrich islands from topics for user.
        const topicId = Number(row.topicId);
        // Derives the previous through get while performing enrich islands from topics for user.
        const previous = topicRowsById.get(topicId);
        // Handles the case where previous is unavailable or row confidence exceeds previous confidence.
        if (!previous || row.confidence > previous.confidence) {
          topicRowsById.set(topicId, row);
        }
      }

      // Collects the topic rows while performing enrich islands from topics for user.
      const topicRows = [...topicRowsById.values()];

      // Skips the current entry when topic rows is empty.
      if (!topicRows.length) continue;

      // Derives the membership summary through evolve island topic memberships while performing enrich islands from topics for user.
      const membershipSummary = await evolveIslandTopicMemberships(island.id, topicRows, transaction);

      // Tracks distinct matched topic id while performing enrich islands from topics for user.
      const matchedTopicIds = new Set(topicRows.map(row => Number(row.topicId)));
      // Keeps the matched topics entries eligible while performing enrich islands from topics for user.
      const matchedTopics = topicProfiles
        .flatMap(profile => profile.topics || [])
        .filter(topic => matchedTopicIds.has(Number(topic.topicId)));
      // Builds the label profile assembled while performing enrich islands from topics for user.
      const labelProfile = {
        vector: island.islandVector,
        topics: matchedTopics
      };
      // Resolves the taxonomy display name while performing enrich islands from topics for user.
      const taxonomyLabel = resolveTaxonomyDisplayName(island.islandVector, taxonomyRows);
      // Resolves the topic fallback label while performing enrich islands from topics for user.
      const topicFallbackLabel = resolveTopicFallbackLabel(labelProfile);
      // Derives the resolved label required while performing enrich islands from topics for user.
      const resolvedLabel = taxonomyLabel || topicFallbackLabel || island.label;

      await island.update(
        {
          label: resolvedLabel,
          populationAudit: appendPopulationAudit(
            island.populationAudit,
            await buildPopulationAuditEntry({
              userId,
              topicIds: [...matchedTopicIds],
              transaction
            })
          )
        },
        { transaction }
      );

      enrichedIslandCount += 1;
      islandTopicLinkCount += topicRows.length;
      enrichmentNewMembershipCount += membershipSummary.newMembershipCount;
      enrichmentRemovedMembershipCount += membershipSummary.removedMembershipCount;
    }

    return {
      userId,
      enrichedIslandCount,
      islandTopicLinkCount,
      enrichmentNewMembershipCount,
      enrichmentRemovedMembershipCount
    };
  });
}

// This function enriches islands from topics for one user or every user.
export async function enrichIslandsFromTopics(options = {}) {
  const { userId = null, maxIslands = DEFAULT_MAX_ISLANDS_PER_USER } = options;

  // Returns early when user id is available.
  if (userId) {
    try {
      return await enrichIslandsFromTopicsForUser(userId, { ...options, maxIslands });
    } catch (error) {
      await recordProcessingFailure({
        crawlRunId: options.processingContext?.crawlRunId || null,
        executionId: options.processingContext?.executionId || randomUUID(),
        userId,
        stage: 'island_enrichment',
        severity: 'FATAL',
        error,
        subjectType: 'user',
        subjectId: userId
      });
      throw error;
    }
  }

  // Loads the users needed while performing enrich islands from topics.
  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  // Collects the results while performing enrich islands from topics.
  const results = [];

  // Processes each users entry in turn.
  for (const user of users) {
    try {
      // Derives the result through enrich islands from topics for user while performing enrich islands from topics.
      const result = await enrichIslandsFromTopicsForUser(user.id, { ...options, maxIslands });
      results.push(result);
    } catch (err) {
      await recordProcessingFailure({
        crawlRunId: options.processingContext?.crawlRunId || null,
        executionId: options.processingContext?.executionId || randomUUID(),
        userId: user.id,
        stage: 'island_enrichment',
        severity: 'FATAL',
        error: err,
        subjectType: 'user',
        subjectId: user.id
      });
      console.error(`[ISLANDS] Failed enriching interest islands for user ${user.id}:`, err);
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
  const processingContext = {
    crawlRunId: options.processingContext?.crawlRunId || null,
    executionId: options.processingContext?.executionId || randomUUID(),
    userId
  };
  logIslandRunStart(userId);
  // Derives the behavior result through calibrate islands from behavior for user while performing run island calibration for user.
  let behaviorResult;
  try {
    behaviorResult = await calibrateIslandsFromBehaviorForUser(userId, options);
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
  // Derives the enrichment result through enrich islands from topics for user while performing run island calibration for user.
  let enrichmentResult;
  try {
    enrichmentResult = await enrichIslandsFromTopicsForUser(userId, options);
  } catch (error) {
    await recordProcessingFailure({
      ...processingContext,
      stage: 'island_enrichment',
      severity: 'FATAL',
      error,
      subjectType: 'user',
      subjectId: userId
    });
    throw error;
  }
  // Derives the scoring result through score articles from islands for user while performing run island calibration for user.
  let scoringResult;
  try {
    scoringResult = await scoreArticlesFromIslandsForUser(userId);
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
    islandCount: behaviorResult.islandCount,
    articleCount: behaviorResult.articleCount,
    enrichedIslandCount: enrichmentResult.enrichedIslandCount,
    islandTopicLinkCount: enrichmentResult.islandTopicLinkCount,
    enrichmentNewMembershipCount: Number(enrichmentResult.enrichmentNewMembershipCount || 0),
    enrichmentRemovedMembershipCount: Number(enrichmentResult.enrichmentRemovedMembershipCount || 0),
    topicScoredCount: Number(scoringResult?.topicScoredCount || 0),
    fallbackScoredCount: Number(scoringResult?.fallbackScoredCount || 0),
    rescoredArticleCount: Number(scoringResult?.updatedCount || 0),
    persistenceSummary: behaviorResult.persistenceSummary,
    profiles: behaviorResult.profiles
  };

  await logIslandRunSummary(userId, result, startedAt);

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

