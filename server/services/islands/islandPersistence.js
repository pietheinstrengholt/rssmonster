import { Op } from 'sequelize';
import db from '../../models/index.js';
import { formatLogString } from '../../utils/logging.js';
import { buildPopulationAuditEntry, appendPopulationAudit } from './islandAudit.js';
import { evolveIslandTopicMemberships } from './islandMemberships.js';
import {
  buildUniqueIslandName,
  disambiguateDuplicateIslandNamesForUser,
  normalizeIslandName
} from './islandNameDisambiguation.js';
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
  resolveTopicFallbackLabel,
  sortIslandsByWeight
} from './islandVectorUtils.js';

const { Island, IslandTopic, IslandTaxonomy, sequelize } = db;

// This function formats island metric values for concise logs.
function formatIslandMetric(value, digits = 3) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : 'n/a';
}

// This function writes verbose island evidence logs only when island debugging is enabled.
function debugIslandLog(message) {
  if (!ISLAND_DEBUG) return;
  console.log(`[ISLAND] ${message}`);
}

// This function returns a human-readable article engagement label for island logs.
function strongestArticleEngagement(article = {}) {
  const signals = article.positiveSignals || {};
  if (Number(signals.deepReads || 0) > 0) return 'deep-read';
  if (Number(signals.stars || 0) > 0) return 'star';
  if (Number(signals.positives || 0) > 0) return 'positive';
  if (Number(signals.clicks || 0) > 0) return 'click';
  if (Number(signals.negatives || 0) > 0) return 'negative';
  return 'behavior';
}

// This function computes average similarity for topic evidence rows.
function averageSimilarity(rows = []) {
  if (!rows.length) return 0;
  const total = rows.reduce((sum, row) => sum + Number(row.similarity || 0), 0);
  return total / rows.length;
}

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

  const existingIslands = sortIslandsByWeight(await Island.findAll({
    where: { userId },
    transaction
  }));
  const usedIslandNames = new Set(
    existingIslands.map(island => normalizeIslandName(island.label))
  );

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
  let archivedIslandCount = 0;
  let totalMembershipCount = 0;
  let newMembershipCount = 0;
  let removedMembershipCount = 0;
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
      usedIslandNames.add(normalizeIslandName(updatedIsland.label));

      matchedIslandIds.add(updatedIsland.id);
      updatedIslandCount += 1;

      const strongestTopic = (profile.topics || [])
        .slice()
        .sort((a, b) => Math.abs(Number(b.strength || 0)) - Math.abs(Number(a.strength || 0)))[0] || null;
      const strongestArticle = (profile.articles || [])
        .slice()
        .sort((a, b) => Math.abs(Number(b.score || 0)) - Math.abs(Number(a.score || 0)))[0] || null;

      if (strongestTopic) {
        debugIslandLog(
          `island=${updatedIsland.id} ← topic=${strongestTopic.name || strongestTopic.topicId} ` +
          `sim=${formatIslandMetric(bestSimilarity)} weight=${formatIslandMetric(profile.weight, 2)} existing`
        );
      } else if (strongestArticle) {
        debugIslandLog(
          `island=${updatedIsland.id} ← article=${strongestArticle.articleId} ` +
          `sim=${formatIslandMetric(bestSimilarity)} ` +
          `engagement=${strongestArticleEngagement(strongestArticle)} existing`
        );
      }

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
        const membershipSummary = await evolveIslandTopicMemberships(updatedIsland.id, islandRows, transaction);
        totalMembershipCount += membershipSummary.totalMembershipCount;
        newMembershipCount += membershipSummary.newMembershipCount;
        removedMembershipCount += membershipSummary.removedMembershipCount;
      }

      createdIslands.push(updatedIsland);
      continue;
    }

    const uniqueLabel = buildUniqueIslandName(resolvedLabel, usedIslandNames);
    const island = await Island.create({
      label: uniqueLabel,
      weight: profile.weight,
      userId,
      islandVector: profile.vector,
      positiveSignals: normalizePositiveSignals(profile.positiveSignals),
      populationAudit: appendPopulationAudit([], auditEntry),
      archivedInd: false,
      archivedAt: null
    }, { transaction });
    usedIslandNames.add(normalizeIslandName(uniqueLabel));
    createdIslandCount += 1;

    console.log(
      `[ISLAND] new-island=${island.id} ` +
      `name=${formatLogString(uniqueLabel)} ` +
      `seedTopics=${profile.topics.length} ` +
      `seedArticles=${(profile.articles || []).length} ` +
      `avgSim=${formatIslandMetric(averageSimilarity(islandRows))}`
    );

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
      totalMembershipCount += islandRows.length;
      newMembershipCount += islandRows.length;
      for (const row of islandRows) {
        debugIslandLog(
          `island=${island.id} ↔ topic=${row.topicId} affinity=${formatIslandMetric(row.similarity)}`
        );
      }
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
        archivedIslandCount += 1;
      }
    }
  }

  const nameDisambiguationSummary = await disambiguateDuplicateIslandNamesForUser(userId, { transaction });

  createdIslands.summary = {
    existingIslandCount: existingIslands.length,
    createdIslandCount,
    updatedIslandCount,
    archivedIslandCount,
    activeIslandCount: createdIslands.filter(island => !island.archivedInd).length,
    totalMembershipCount,
    newMembershipCount,
    removedMembershipCount,
    renamedDuplicateIslandCount: nameDisambiguationSummary.renamed.length,
    archivedDuplicateIslandCount: nameDisambiguationSummary.archived.length
  };

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
