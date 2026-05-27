import { Op } from 'sequelize';
import db from '../../models/index.js';
import buildArticleInterestScoresForUser from './buildArticleInterestScores.js';
import { buildInterestIslandProfilesForUser } from './islandArticleProfiles.js';
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
  resolveTopicFallbackLabel
} from './islandVectorUtils.js';

// This service builds and enriches "interest islands" from user behavior and topic history.
// Islands represent durable preference areas that can later score articles and group topics.

const { User, Island, IslandTaxonomy, sequelize } = db;

export { cosineSimilarity } from './islandVectorUtils.js';
export { buildInterestIslandProfilesForUser } from './islandArticleProfiles.js';
export { buildTopicInterestIslandProfilesForUser } from './islandTopicProfiles.js';

// This function builds and persists behavior-derived islands for one user.
export async function buildInterestIslandsFromBehaviorForUser(userId, options = {}) {
  const profiles = await buildInterestIslandProfilesForUser(userId, options);

  const islands = await sequelize.transaction((transaction) =>
    persistInterestIslandProfiles(userId, profiles, transaction, options)
  );

  return {
    userId,
    islandCount: islands.length,
    articleCount: profiles.reduce((sum, profile) => sum + (profile.articles || []).length, 0),
    profiles
  };
}

// This function builds behavior-derived islands for one user or every user.
export async function buildInterestIslandsFromBehavior(options = {}) {
  const { userId = null, maxIslands = DEFAULT_MAX_ISLANDS_PER_USER } = options;

  if (userId) {
    return buildInterestIslandsFromBehaviorForUser(userId, { ...options, maxIslands });
  }

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  const results = [];

  for (const user of users) {
    try {
      const result = await buildInterestIslandsFromBehaviorForUser(user.id, { ...options, maxIslands });
      results.push(result);
    } catch (err) {
      console.error(`[ISLANDS] Failed building interest islands for user ${user.id}:`, err);
    }
  }

  return {
    userCount: users.length,
    results
  };
}

// This function enriches existing islands with topic memberships based on vector similarity.
export async function enrichInterestIslandsFromTopicsForUser(userId, options = {}) {
  const topicConfidenceThreshold =
    options.topicConfidenceThreshold ?? DEFAULT_TOPIC_CONFIDENCE_THRESHOLD;

  return sequelize.transaction(async (transaction) => {
    const [islands, topicProfiles, taxonomyRows] = await Promise.all([
      Island.findAll({
        where: { userId, archivedInd: false, islandVector: { [Op.ne]: null } },
        order: [['weight', 'DESC'], ['id', 'ASC']],
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

    let enrichedIslandCount = 0;
    let islandTopicLinkCount = 0;

    for (const island of islands) {
      const candidateTopicRows = topicProfiles
        .flatMap(profile => profile.topics || [])
        .filter(topic => Array.isArray(topic.vector) && topic.vector.length)
        .map(topic => {
          const similarity = cosineSimilarity(island.islandVector, topic.vector);
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
      const topicRowsById = new Map();

      for (const row of candidateTopicRows) {
        const topicId = Number(row.topicId);
        const previous = topicRowsById.get(topicId);
        if (!previous || row.confidence > previous.confidence) {
          topicRowsById.set(topicId, row);
        }
      }

      const topicRows = [...topicRowsById.values()];

      if (!topicRows.length) continue;

      await evolveIslandTopicMemberships(island.id, topicRows, transaction);

      const matchedTopicIds = new Set(topicRows.map(row => Number(row.topicId)));
      const matchedTopics = topicProfiles
        .flatMap(profile => profile.topics || [])
        .filter(topic => matchedTopicIds.has(Number(topic.topicId)));
      const labelProfile = {
        vector: island.islandVector,
        topics: matchedTopics
      };
      const taxonomyLabel = resolveTaxonomyDisplayName(island.islandVector, taxonomyRows);
      const topicFallbackLabel = resolveTopicFallbackLabel(labelProfile);
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
    }

    return {
      userId,
      enrichedIslandCount,
      islandTopicLinkCount
    };
  });
}

// This function enriches islands from topics for one user or every user.
export async function enrichInterestIslandsFromTopics(options = {}) {
  const { userId = null, maxIslands = DEFAULT_MAX_ISLANDS_PER_USER } = options;

  if (userId) {
    return enrichInterestIslandsFromTopicsForUser(userId, { ...options, maxIslands });
  }

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  const results = [];

  for (const user of users) {
    try {
      const result = await enrichInterestIslandsFromTopicsForUser(user.id, { ...options, maxIslands });
      results.push(result);
    } catch (err) {
      console.error(`[ISLANDS] Failed enriching interest islands for user ${user.id}:`, err);
    }
  }

  return {
    userCount: users.length,
    results
  };
}

// This function runs the full island pipeline for one user and refreshes article interest scores.
export async function buildInterestIslandsForUser(userId, options = {}) {
  const behaviorResult = await buildInterestIslandsFromBehaviorForUser(userId, options);
  const enrichmentResult = await enrichInterestIslandsFromTopicsForUser(userId, options);
  const scoringResult = await buildArticleInterestScoresForUser(userId);

  return {
    userId,
    islandCount: behaviorResult.islandCount,
    articleCount: behaviorResult.articleCount,
    enrichedIslandCount: enrichmentResult.enrichedIslandCount,
    islandTopicLinkCount: enrichmentResult.islandTopicLinkCount,
    topicScoredCount: Number(scoringResult?.topicScoredCount || 0),
    fallbackScoredCount: Number(scoringResult?.fallbackScoredCount || 0),
    rescoredArticleCount: Number(scoringResult?.updatedCount || 0),
    profiles: behaviorResult.profiles
  };
}

// This function runs the full island pipeline for one user or every user.
export async function buildInterestIslands(options = {}) {
  const { userId = null, maxIslands = DEFAULT_MAX_ISLANDS_PER_USER } = options;

  if (userId) {
    return buildInterestIslandsForUser(userId, { ...options, maxIslands });
  }

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  const results = [];

  for (const user of users) {
    try {
      const result = await buildInterestIslandsForUser(user.id, { ...options, maxIslands });
      results.push(result);
    } catch (err) {
      console.error(`[ISLANDS] Failed building interest islands for user ${user.id}:`, err);
    }
  }

  return {
    userCount: users.length,
    results
  };
}

export default buildInterestIslands;
