import { Op } from 'sequelize';
import db from '../../models/index.js';
import { buildPopulationAuditEntry, appendPopulationAudit } from './islandAudit.js';
import { evolveIslandTopicMemberships } from './islandMemberships.js';
import {
  DEFAULT_ARCHIVE_CONFIDENCE_THRESHOLD,
  DEFAULT_ISLAND_MATCH_THRESHOLD,
  DEFAULT_TOPIC_CONFIDENCE_THRESHOLD,
  ISLAND_DEBUG,
  blendIslandVector,
  clamp,
  cosineSimilarity,
  debugIsland,
  isStaleIsland,
  mergePositiveSignals,
  normalizePositiveSignals,
  resolveTaxonomyDisplayName,
  resolveTopicFallbackLabel
} from './islandVectorUtils.js';

const { Island, IslandTopic, IslandTaxonomy, sequelize } = db;

// This function creates, updates, archives, and links islands from computed profiles.
export async function persistInterestIslandProfiles(userId, profiles, transaction, options = {}) {
  const topicConfidenceThreshold =
    options.topicConfidenceThreshold ?? DEFAULT_TOPIC_CONFIDENCE_THRESHOLD;

  const persistableProfiles = profiles
    .map(profile => ({
      ...profile,
      topics: (profile.topics || []).filter(topic => Math.abs(topic.strength) >= topicConfidenceThreshold)
    }))
    .filter(profile => Array.isArray(profile.vector) && profile.vector.length)
    .filter(profile => profile.topics.length > 0 || (profile.articles || []).length > 0);

  const existingIslands = await Island.findAll({
    where: { userId },
    order: [['weight', 'DESC'], ['id', 'ASC']],
    transaction
  });

  const taxonomyRows = await IslandTaxonomy.findAll({
    where: {
      status: 'active',
      vector: { [Op.ne]: null }
    },
    attributes: ['displayName', 'vector'],
    transaction
  });

  const matchedIslandIds = new Set();

  const createdIslands = [];
  let createdIslandCount = 0;
  let updatedIslandCount = 0;
  let updatedWithPositiveSignalCount = 0;
  let updatedWithStarSignalCount = 0;
  let updatedWithClickSignalCount = 0;
  let updatedWithNegativeSignalCount = 0;

  for (const profile of persistableProfiles) {
    const taxonomyLabel = resolveTaxonomyDisplayName(profile.vector, taxonomyRows);
    const topicFallbackLabel = resolveTopicFallbackLabel(profile);
    const resolvedLabel = taxonomyLabel || topicFallbackLabel || profile.label || 'Interest Island';

    let bestMatch = null;
    let bestSimilarity = 0;

    for (const island of existingIslands) {
      if (matchedIslandIds.has(island.id)) continue;

      const similarity = cosineSimilarity(profile.vector, island.islandVector);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = island;
      }
    }

    const islandRows = profile.topics
      .map(topic => {
        const similarity = cosineSimilarity(profile.vector, topic.vector);
        return {
          topicId: topic.topicId,
          similarity: Number(similarity.toFixed(4)),
          confidence: Number(clamp(Math.abs(topic.strength) * similarity, 0, 1).toFixed(4))
        };
      })
      .filter(row => row.confidence >= topicConfidenceThreshold);

    const topicIds = islandRows.map(row => Number(row.topicId));
    const articleIds = (profile.articles || [])
      .map(article => Number(article.articleId))
      .filter(Number.isFinite);
    const auditEntry = await buildPopulationAuditEntry({
      userId,
      topicIds,
      articleIds,
      transaction
    });

    if (bestMatch && bestSimilarity >= DEFAULT_ISLAND_MATCH_THRESHOLD) {
      const updatedIsland = await bestMatch.update({
        label: resolvedLabel,
        weight: profile.weight,
        islandVector: blendIslandVector(bestMatch.islandVector, profile.vector),
        positiveSignals: mergePositiveSignals(bestMatch.positiveSignals, profile.positiveSignals),
        populationAudit: appendPopulationAudit(bestMatch.populationAudit, auditEntry),
        archivedInd: false,
        archivedAt: null
      }, { transaction });

      matchedIslandIds.add(updatedIsland.id);
      updatedIslandCount += 1;

      if (Number(profile?.positiveSignals?.stars || 0) > 0) {
        updatedWithStarSignalCount += 1;
      }
      if (Number(profile?.positiveSignals?.positives || 0) > 0) {
        updatedWithPositiveSignalCount += 1;
      }
      if (Number(profile?.positiveSignals?.clicks || 0) > 0) {
        updatedWithClickSignalCount += 1;
      }
      if (Number(profile?.positiveSignals?.negatives || 0) > 0) {
        updatedWithNegativeSignalCount += 1;
      }

      if (islandRows.length) {
        await evolveIslandTopicMemberships(updatedIsland.id, islandRows, transaction);
      }

      createdIslands.push(updatedIsland);
      continue;
    }

    const island = await Island.create({
      label: resolvedLabel,
      weight: profile.weight,
      userId,
      islandVector: profile.vector,
      positiveSignals: normalizePositiveSignals(profile.positiveSignals),
      populationAudit: appendPopulationAudit([], auditEntry),
      archivedInd: false,
      archivedAt: null
    }, { transaction });
    createdIslandCount += 1;

    if (islandRows.length) {
      await IslandTopic.bulkCreate(
        islandRows.map(row => ({
          islandId: island.id,
          topicId: row.topicId,
          similarity: row.similarity,
          confidence: row.confidence
        })),
        { transaction }
      );
    }

    createdIslands.push(island);
  }

  const inactiveIslands = existingIslands.filter(island => !matchedIslandIds.has(island.id));
  const inactiveIds = inactiveIslands.map(island => island.id);

  if (inactiveIds.length) {
    const confidenceRows = await IslandTopic.findAll({
      where: {
        islandId: { [Op.in]: inactiveIds }
      },
      attributes: [
        'islandId',
        [sequelize.fn('AVG', sequelize.col('confidence')), 'avgConfidence']
      ],
      group: ['islandId'],
      raw: true,
      transaction
    });

    const avgConfidenceByIslandId = new Map(
      confidenceRows.map(row => [Number(row.islandId), Number(row.avgConfidence || 0)])
    );

    const now = new Date();

    for (const island of inactiveIslands) {
      const noActivity = true;
      const lowConfidence = (avgConfidenceByIslandId.get(Number(island.id)) || 0) < DEFAULT_ARCHIVE_CONFIDENCE_THRESHOLD;
      const staleAge = isStaleIsland(island);

      if (noActivity && lowConfidence && staleAge) {
        await island.update(
          {
            archivedInd: true,
            archivedAt: now
          },
          { transaction }
        );
      }
    }
  }

  if (ISLAND_DEBUG) {
    debugIsland('island-persistence-summary', {
      userId,
      createdIslandCount,
      updatedIslandCount,
      updatedBySignals: {
        positives: updatedWithPositiveSignalCount,
        stars: updatedWithStarSignalCount,
        clicks: updatedWithClickSignalCount,
        negativeInd: updatedWithNegativeSignalCount
      }
    });
  }

  return createdIslands;
}
