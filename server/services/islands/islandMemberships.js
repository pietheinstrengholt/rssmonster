import { Op } from 'sequelize';
import db from '../../models/index.js';
import {
  DEFAULT_ISLAND_MEMBERSHIP_BLEND,
  DEFAULT_ISLAND_MEMBERSHIP_DECAY,
  DEFAULT_ISLAND_MEMBERSHIP_MIN_CONFIDENCE,
  clamp
} from './islandVectorUtils.js';

const { IslandTopic } = db;

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
    await IslandTopic.destroy({
      where: {
        islandId,
        topicId: { [Op.in]: removableTopicIds }
      },
      transaction
    });
  }
}
