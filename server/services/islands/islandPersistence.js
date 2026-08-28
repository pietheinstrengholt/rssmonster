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

// Provides the shared dependencies used by this service.
const { Island, IslandTopic, IslandTaxonomy, sequelize } = db;

// This function formats island metric values for concise logs.
function formatIslandMetric(value, digits = 3) {
  // Coerces the numeric into the representation required while performing format island metric.
  const numeric = Number(value);
  // Selects the result based on whether numeric is finite.
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : 'n/a';
}

// This function writes verbose island evidence logs only when island debugging is enabled.
function debugIslandLog(message) {
  // Returns early when island debug is unavailable.
  if (!ISLAND_DEBUG) return;
  console.log(`[ISLAND] ${message}`);
}

// This function returns a human-readable article engagement label for island logs.
function strongestArticleEngagement(article = {}) {
  // Derives the signals required while performing strongest article engagement.
  const signals = article.positiveSignals || {};
  // Returns early when number exceeds value.
  if (Number(signals.deepReads || 0) > 0) return 'deep-read';
  // Returns early when number exceeds value.
  if (Number(signals.stars || 0) > 0) return 'star';
  // Returns early when number exceeds value.
  if (Number(signals.positives || 0) > 0) return 'positive';
  // Returns early when number exceeds value.
  if (Number(signals.clicks || 0) > 0) return 'click';
  // Returns early when number exceeds value.
  if (Number(signals.negatives || 0) > 0) return 'negative';
  return 'behavior';
}

// This function computes average similarity for topic evidence rows.
function averageSimilarity(rows = []) {
  // Returns early when rows is empty.
  if (!rows.length) return 0;
  // Aggregates source values into the total used while performing average similarity.
  const total = rows.reduce((sum, row) => sum + Number(row.similarity || 0), 0);
  return total / rows.length;
}

// This function creates, updates, archives, and links islands from computed profiles.
export async function persistInterestIslandProfiles(userId, profiles, transaction, options = {}) {
  // Resolves the topic confidence threshold that governs performing persist interest island profiles.
  const topicConfidenceThreshold =
    options.topicConfidenceThreshold ?? DEFAULT_TOPIC_CONFIDENCE_THRESHOLD;

  // Keeps the persistable profiles entries eligible while performing persist interest island profiles.
  const persistableProfiles = profiles
    .map(profile => ({
      ...profile,
      topics: (profile.topics || []).filter(topic => Math.abs(topic.strength) >= topicConfidenceThreshold)
    }))
    .filter(profile => Array.isArray(profile.vector) && profile.vector.length)
    .filter(profile => profile.topics.length > 0 || (profile.articles || []).length > 0);

  // Derives the existing islands through sort islands by weight while performing persist interest island profiles.
  const existingIslands = sortIslandsByWeight(await Island.findAll({
    where: { userId },
    transaction
  }));
  // Tracks distinct used island names while performing persist interest island profiles.
  const usedIslandNames = new Set(
    existingIslands.map(island => normalizeIslandName(island.label))
  );

  // Loads the taxonomy rows needed while performing persist interest island profiles.
  const taxonomyRows = await IslandTaxonomy.findAll({
    where: {
      status: 'active',
      vector: { [Op.ne]: null }
    },
    attributes: ['displayName', 'vector'],
    transaction
  });

  // Tracks distinct matched island id while performing persist interest island profiles.
  const matchedIslandIds = new Set();

  // Collects the created islands while performing persist interest island profiles.
  const createdIslands = [];
  const createdIslandIds = [];
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

  // Processes each persistable profiles entry in turn.
  for (const profile of persistableProfiles) {
    // Resolves the taxonomy display name while performing persist interest island profiles.
    const taxonomyLabel = resolveTaxonomyDisplayName(profile.vector, taxonomyRows);
    // Resolves the topic fallback label while performing persist interest island profiles.
    const topicFallbackLabel = resolveTopicFallbackLabel(profile);
    // Derives the resolved label required while performing persist interest island profiles.
    const resolvedLabel = taxonomyLabel || topicFallbackLabel || profile.label || 'Interest Island';

    let bestMatch = null;
    let bestSimilarity = 0;

    // Processes each existing islands entry in turn.
    for (const island of existingIslands) {
      // Skips the current entry when matched island id contains island id.
      if (matchedIslandIds.has(island.id)) continue;

      // Derives the similarity through cosine similarity while performing persist interest island profiles.
      const similarity = cosineSimilarity(profile.vector, island.islandVector);
      // Handles the case where similarity exceeds best similarity.
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = island;
      }
    }

    // Keeps the island rows entries eligible while performing persist interest island profiles.
    const islandRows = profile.topics
      .map(topic => {
        // Derives the similarity through cosine similarity while performing persist interest island profiles.
        const similarity = cosineSimilarity(profile.vector, topic.vector);
        return {
          topicId: topic.topicId,
          similarity: Number(similarity.toFixed(4)),
          confidence: Number(clamp(Math.abs(topic.strength) * similarity, 0, 1).toFixed(4))
        };
      })
      .filter(row => row.confidence >= topicConfidenceThreshold);

    // Transforms source values into the topic id required while performing persist interest island profiles.
    const topicIds = islandRows.map(row => Number(row.topicId));
    // Keeps the article id entries eligible while performing persist interest island profiles.
    const articleIds = (profile.articles || [])
      .map(article => Number(article.articleId))
      .filter(Number.isFinite);
    // Builds the population audit entry while performing persist interest island profiles.
    const auditEntry = await buildPopulationAuditEntry({
      userId,
      topicIds,
      articleIds,
      transaction
    });

    // Handles the case where best match is available and best similarity reaches default island match threshold.
    if (bestMatch && bestSimilarity >= DEFAULT_ISLAND_MATCH_THRESHOLD) {
      // Derives the updated island through update while performing persist interest island profiles.
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

      // Derives the strongest topic required while performing persist interest island profiles.
      const strongestTopic = (profile.topics || [])
        .slice()
        .sort((a, b) => Math.abs(Number(b.strength || 0)) - Math.abs(Number(a.strength || 0)))[0] || null;
      // Derives the strongest article required while performing persist interest island profiles.
      const strongestArticle = (profile.articles || [])
        .slice()
        .sort((a, b) => Math.abs(Number(b.score || 0)) - Math.abs(Number(a.score || 0)))[0] || null;

      // Handles the case where strongest topic is available.
      if (strongestTopic) {
        debugIslandLog(
          `island=${updatedIsland.id} ← topic=${strongestTopic.name || strongestTopic.topicId} ` +
          `sim=${formatIslandMetric(bestSimilarity)} weight=${formatIslandMetric(profile.weight, 2)} existing`
        );
      // Handles the case where strongest article is available.
      } else if (strongestArticle) {
        debugIslandLog(
          `island=${updatedIsland.id} ← article=${strongestArticle.articleId} ` +
          `sim=${formatIslandMetric(bestSimilarity)} ` +
          `engagement=${strongestArticleEngagement(strongestArticle)} existing`
        );
      }

      // Handles the case where number exceeds value.
      if (Number(profile?.positiveSignals?.stars || 0) > 0) {
        updatedWithStarSignalCount += 1;
      }
      // Handles the case where number exceeds value.
      if (Number(profile?.positiveSignals?.positives || 0) > 0) {
        updatedWithPositiveSignalCount += 1;
      }
      // Handles the case where number exceeds value.
      if (Number(profile?.positiveSignals?.clicks || 0) > 0) {
        updatedWithClickSignalCount += 1;
      }
      // Handles the case where number exceeds value.
      if (Number(profile?.positiveSignals?.negatives || 0) > 0) {
        updatedWithNegativeSignalCount += 1;
      }

      // Handles the case where island rows is non-empty.
      if (islandRows.length) {
        // Derives the membership summary through evolve island topic memberships while performing persist interest island profiles.
        const membershipSummary = await evolveIslandTopicMemberships(updatedIsland.id, islandRows, transaction);
        totalMembershipCount += membershipSummary.totalMembershipCount;
        newMembershipCount += membershipSummary.newMembershipCount;
        removedMembershipCount += membershipSummary.removedMembershipCount;
      }

      createdIslands.push(updatedIsland);
      continue;
    }

    // Builds the unique island name while performing persist interest island profiles.
    const uniqueLabel = buildUniqueIslandName(resolvedLabel, usedIslandNames);
    // Performs the create operation while performing persist interest island profiles.
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
    createdIslandIds.push(Number(island.id));

    console.log(
      `[ISLAND] new-island=${island.id} ` +
      `name=${formatLogString(uniqueLabel)} ` +
      `seedTopics=${profile.topics.length} ` +
      `seedArticles=${(profile.articles || []).length} ` +
      `avgSim=${formatIslandMetric(averageSimilarity(islandRows))}`
    );

    // Handles the case where island rows is non-empty.
    if (islandRows.length) {
      // Maps source values into the result produced while performing persist interest island profiles.
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
      // Processes each island rows entry in turn.
      for (const row of islandRows) {
        debugIslandLog(
          `island=${island.id} ↔ topic=${row.topicId} affinity=${formatIslandMetric(row.similarity)}`
        );
      }
    }

    createdIslands.push(island);
  }

  // Keeps the inactive islands entries eligible while performing persist interest island profiles.
  const inactiveIslands = existingIslands.filter(island => !matchedIslandIds.has(island.id));
  // Transforms source values into the inactive id required while performing persist interest island profiles.
  const inactiveIds = inactiveIslands.map(island => island.id);

  // Handles the case where inactive id is non-empty.
  if (inactiveIds.length) {
    // Loads the confidence rows needed while performing persist interest island profiles.
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

    // Derives the avg confidence by island id required while performing persist interest island profiles.
    const avgConfidenceByIslandId = new Map(
      confidenceRows.map(row => [Number(row.islandId), Number(row.avgConfidence || 0)])
    );

    // Normalizes the now used while performing persist interest island profiles.
    const now = new Date();

    // Processes each inactive islands entry in turn.
    for (const island of inactiveIslands) {
      const noActivity = true;
      // Derives the low confidence required while performing persist interest island profiles.
      const lowConfidence = (avgConfidenceByIslandId.get(Number(island.id)) || 0) < DEFAULT_ARCHIVE_CONFIDENCE_THRESHOLD;
      // Derives the stale age through is stale island while performing persist interest island profiles.
      const staleAge = isStaleIsland(island);

      // Handles the case where no activity is available and low confidence is available and stale age is available.
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

  // Derives the name disambiguation summary through disambiguate duplicate island names for user while performing persist interest island profiles.
  const nameDisambiguationSummary = await disambiguateDuplicateIslandNamesForUser(userId, { transaction });

  // Filters source values to the entries eligible while performing persist interest island profiles.
  createdIslands.summary = {
    existingIslandCount: existingIslands.length,
    createdIslandCount,
    createdIslandIds,
    updatedIslandCount,
    archivedIslandCount,
    activeIslandCount: createdIslands.filter(island => !island.archivedInd).length,
    totalMembershipCount,
    newMembershipCount,
    removedMembershipCount,
    renamedDuplicateIslandCount: nameDisambiguationSummary.renamed.length,
    archivedDuplicateIslandCount: nameDisambiguationSummary.archived.length
  };

  // Handles the case where island debug is available.
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
