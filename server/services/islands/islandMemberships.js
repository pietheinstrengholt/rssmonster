import { Op } from 'sequelize';
import db from '../../models/index.js';
import {
  DEFAULT_ISLAND_MEMBERSHIP_BLEND,
  DEFAULT_ISLAND_MEMBERSHIP_DECAY,
  DEFAULT_ISLAND_MEMBERSHIP_MIN_CONFIDENCE,
  ISLAND_DEBUG,
  clamp
} from './islandVectorUtils.js';

const { IslandTopic } = db;

// This function formats island metric values for concise logs.
function formatIslandMetric(value, digits = 3) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : 'n/a';
}

// This function writes verbose island membership logs only when island debugging is enabled.
function debugIslandLog(message) {
  if (!ISLAND_DEBUG) return;
  console.log(`[ISLAND] ${message}`);
}

// This function evolves IslandTopic memberships with blending, decay, and cleanup.
export async function evolveIslandTopicMemberships(islandId, islandRows, transaction) {
  const existingRows = await IslandTopic.findAll({
    where: { islandId },
    raw: true,
    transaction
  });

  const existingByTopicId = new Map(
    existingRows.map(row => [Number(row.topicId), row])
  );

  const nextRows = [];
  const nextTopicIds = new Set();
  let newMembershipCount = 0;
  const blendWeight = clamp(DEFAULT_ISLAND_MEMBERSHIP_BLEND, 0, 1);
  const decayWeight = clamp(DEFAULT_ISLAND_MEMBERSHIP_DECAY, 0, 1);

  for (const row of islandRows) {
    const topicId = Number(row.topicId);
    if (!Number.isFinite(topicId)) continue;

    const previous = existingByTopicId.get(topicId);
    const similarity = previous
      ? clamp(Number(previous.similarity || 0) * (1 - blendWeight) + Number(row.similarity || 0) * blendWeight, 0, 1)
      : clamp(Number(row.similarity || 0), 0, 1);
    const confidence = previous
      ? clamp(Number(previous.confidence || 0) * (1 - blendWeight) + Number(row.confidence || 0) * blendWeight, 0, 1)
      : clamp(Number(row.confidence || 0), 0, 1);

    nextRows.push({
      islandId,
      topicId,
      similarity: Number(similarity.toFixed(4)),
      confidence: Number(confidence.toFixed(4))
    });
    if (!previous) {
      newMembershipCount += 1;
    }

    debugIslandLog(
      `island=${islandId} ↔ topic=${topicId} affinity=${formatIslandMetric(similarity)}`
    );

    nextTopicIds.add(topicId);
  }

  for (const previous of existingRows) {
    const topicId = Number(previous.topicId);
    if (nextTopicIds.has(topicId)) continue;

    const decayedConfidence = clamp(Number(previous.confidence || 0) * decayWeight, 0, 1);
    if (decayedConfidence < DEFAULT_ISLAND_MEMBERSHIP_MIN_CONFIDENCE) continue;

    const decayedSimilarity = clamp(Number(previous.similarity || 0) * decayWeight, 0, 1);

    nextRows.push({
      islandId,
      topicId,
      similarity: Number(decayedSimilarity.toFixed(4)),
      confidence: Number(decayedConfidence.toFixed(4))
    });

    nextTopicIds.add(topicId);
  }

  if (nextRows.length) {
    await IslandTopic.bulkCreate(nextRows, {
      updateOnDuplicate: ['similarity', 'confidence'],
      transaction
    });
  }

  const removableTopicIds = existingRows
    .map(row => Number(row.topicId))
    .filter(topicId => Number.isFinite(topicId) && !nextTopicIds.has(topicId));

  if (removableTopicIds.length) {
    for (const row of existingRows) {
      const topicId = Number(row.topicId);
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
