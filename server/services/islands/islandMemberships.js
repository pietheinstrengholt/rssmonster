import { Op } from 'sequelize';
import db from '../../models/index.js';
import {
  DEFAULT_ISLAND_MEMBERSHIP_BLEND,
  DEFAULT_ISLAND_MEMBERSHIP_DECAY,
  DEFAULT_ISLAND_MEMBERSHIP_MIN_CONFIDENCE,
  ISLAND_DEBUG,
  clamp
} from './islandVectorUtils.js';

// Provides the shared dependencies used by this service.
const { IslandTopic } = db;

// This function formats island metric values for concise logs.
function formatIslandMetric(value, digits = 3) {
  // Coerces the numeric into the representation required while performing format island metric.
  const numeric = Number(value);
  // Selects the result based on whether numeric is finite.
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : 'n/a';
}

// This function writes verbose island membership logs only when island debugging is enabled.
function debugIslandLog(message) {
  // Returns early when island debug is unavailable.
  if (!ISLAND_DEBUG) return;
  console.log(`[ISLAND] ${message}`);
}

// This function evolves IslandTopic memberships with blending, decay, and cleanup.
export async function evolveIslandTopicMemberships(islandId, islandRows, transaction) {
  // Loads the existing rows needed while performing evolve island topic memberships.
  const existingRows = await IslandTopic.findAll({
    where: { islandId },
    raw: true,
    transaction
  });

  // Derives the existing by topic id required while performing evolve island topic memberships.
  const existingByTopicId = new Map(
    existingRows.map(row => [Number(row.topicId), row])
  );

  // Collects the next rows while performing evolve island topic memberships.
  const nextRows = [];
  // Tracks distinct next topic id while performing evolve island topic memberships.
  const nextTopicIds = new Set();
  let newMembershipCount = 0;
  // Derives the blend weight through clamp while performing evolve island topic memberships.
  const blendWeight = clamp(DEFAULT_ISLAND_MEMBERSHIP_BLEND, 0, 1);
  // Derives the decay weight through clamp while performing evolve island topic memberships.
  const decayWeight = clamp(DEFAULT_ISLAND_MEMBERSHIP_DECAY, 0, 1);

  // Processes each island rows entry in turn.
  for (const row of islandRows) {
    // Coerces the topic id into the representation required while performing evolve island topic memberships.
    const topicId = Number(row.topicId);
    // Skips the current entry when topic id is not finite.
    if (!Number.isFinite(topicId)) continue;

    // Derives the previous through get while performing evolve island topic memberships.
    const previous = existingByTopicId.get(topicId);
    // Selects the similarity based on whether previous is available.
    const similarity = previous
      ? clamp(Number(previous.similarity || 0) * (1 - blendWeight) + Number(row.similarity || 0) * blendWeight, 0, 1)
      : clamp(Number(row.similarity || 0), 0, 1);
    // Selects the confidence based on whether previous is available.
    const confidence = previous
      ? clamp(Number(previous.confidence || 0) * (1 - blendWeight) + Number(row.confidence || 0) * blendWeight, 0, 1)
      : clamp(Number(row.confidence || 0), 0, 1);

    nextRows.push({
      islandId,
      topicId,
      similarity: Number(similarity.toFixed(4)),
      confidence: Number(confidence.toFixed(4))
    });
    // Handles the case where previous is unavailable.
    if (!previous) {
      newMembershipCount += 1;
    }

    debugIslandLog(
      `island=${islandId} ↔ topic=${topicId} affinity=${formatIslandMetric(similarity)}`
    );

    nextTopicIds.add(topicId);
  }

  // Processes each existing rows entry in turn.
  for (const previous of existingRows) {
    // Coerces the topic id into the representation required while performing evolve island topic memberships.
    const topicId = Number(previous.topicId);
    // Skips the current entry when next topic id contains topic id.
    if (nextTopicIds.has(topicId)) continue;

    // Derives the decayed confidence through clamp while performing evolve island topic memberships.
    const decayedConfidence = clamp(Number(previous.confidence || 0) * decayWeight, 0, 1);
    // Skips the current entry when decayed confidence is below default island membership min confidence.
    if (decayedConfidence < DEFAULT_ISLAND_MEMBERSHIP_MIN_CONFIDENCE) continue;

    // Derives the decayed similarity through clamp while performing evolve island topic memberships.
    const decayedSimilarity = clamp(Number(previous.similarity || 0) * decayWeight, 0, 1);

    nextRows.push({
      islandId,
      topicId,
      similarity: Number(decayedSimilarity.toFixed(4)),
      confidence: Number(decayedConfidence.toFixed(4))
    });

    nextTopicIds.add(topicId);
  }

  // Handles the case where next rows is non-empty.
  if (nextRows.length) {
    await IslandTopic.bulkCreate(nextRows, {
      updateOnDuplicate: ['similarity', 'confidence'],
      transaction
    });
  }

  // Keeps the removable topic id entries eligible while performing evolve island topic memberships.
  const removableTopicIds = existingRows
    .map(row => Number(row.topicId))
    .filter(topicId => Number.isFinite(topicId) && !nextTopicIds.has(topicId));

  // Handles the case where removable topic id is non-empty.
  if (removableTopicIds.length) {
    // Processes each existing rows entry in turn.
    for (const row of existingRows) {
      // Coerces the topic id into the representation required while performing evolve island topic memberships.
      const topicId = Number(row.topicId);
      // Skips the current entry when removable topic id does not contain topic id.
      if (!removableTopicIds.includes(topicId)) continue;

      debugIslandLog(
        `island=${islandId} ✕ topic=${topicId} ` +
        `confidence=${formatIslandMetric(row.confidence, 2)} removed`
      );
    }

    await IslandTopic.destroy({
      where: {
        islandId,
        topicId: { [Op.in]: removableTopicIds }
      },
      transaction
    });
  }

  return {
    islandId,
    totalMembershipCount: nextRows.length,
    newMembershipCount,
    removedMembershipCount: removableTopicIds.length
  };
}
