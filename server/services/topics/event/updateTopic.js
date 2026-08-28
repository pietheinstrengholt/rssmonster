import {
  TOPIC_VECTOR_DRIFT_ALPHA,
  blendTopicVector,
  blendTopicVectorWithAlpha,
  shouldDriftTopicVector,
  upsertTopicInCache
} from '../shared/topicHelpers.js';
import { debugSemanticLog } from '../../observability/semanticLogging.js';

// This service updates existing topics after semantic assignment matches.
// It centralizes vector drift, activity timestamps, and in-memory cache refreshes.

// This function formats topic drift similarity values for concise logs.
function formatTopicMetric(value, digits = 3) {
  // Coerces the numeric into the representation required while performing format topic metric.
  const numeric = Number(value);
  // Selects the result based on whether numeric is finite.
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : 'n/a';
}

// This function logs when an event causes a topic vector to drift.
function logTopicDrift({ topicId, similarity, semanticUnit }) {
  debugSemanticLog('topic',
    `topic=${topicId} drift ` +
    `sim=${formatTopicMetric(similarity)} ` +
    `alpha=${formatTopicMetric(TOPIC_VECTOR_DRIFT_ALPHA, 2)} ` +
    `event=${semanticUnit?.id ?? 'n/a'}`
  );
}

// This function updates all matched candidate topics and drifts the primary topic when allowed.
export async function updateMatchedTopics({
  rankedCandidates,
  primaryCandidate,
  semanticVector,
  semanticUnit = null,
  assignmentContext,
  now,
  topicsCache
}) {
  // Transforms source values into the updates required while updating matched topics.
  const updates = rankedCandidates.map(candidate => {
    // Derives the can drift through should drift topic vector while updating matched topics.
    const canDrift = shouldDriftTopicVector(candidate.sim, assignmentContext);

    // Handles the case where primary candidate is available and candidate topic id is primary candidate topic id and can drift is available.
    if (primaryCandidate && candidate.topic.id === primaryCandidate.topic.id && canDrift) {
      // Derives the blended topic vector through blend topic vector while updating matched topics.
      const blendedTopicVector = blendTopicVector(
        candidate.topic.topicVector,
        semanticVector
      );

      // Derives the anchored vector through blend topic vector with alpha while updating matched topics.
      const anchoredVector = blendTopicVectorWithAlpha(
        candidate.topic.topicVector,
        blendedTopicVector,
        Math.max(0, Math.min(TOPIC_VECTOR_DRIFT_ALPHA, 1))
      );

      logTopicDrift({
        topicId: candidate.topic.id,
        similarity: candidate.sim,
        semanticUnit
      });

      return candidate.topic.update({
        topicVector: anchoredVector,
        lastActivityAt: now
      });
    }

    return candidate.topic.update({ lastActivityAt: now });
  });

  // Derives the updated topics through all while updating matched topics.
  const updatedTopics = await Promise.all(updates);

  // Handles the case where topics cache is available.
  if (topicsCache) {
    // Processes each updated topics entry in turn.
    for (const updatedTopic of updatedTopics) {
      upsertTopicInCache(topicsCache, updatedTopic);
    }
  }
}

// This function updates one identity-matched topic and returns a primary assignment row.
export async function updateIdentityTopic({
  bestTopic,
  bestTopicSim,
  semanticVector,
  semanticUnit = null,
  assignmentContext,
  now,
  topicsCache
}) {
  // Derives the can drift through should drift topic vector while updating identity topic.
  const canDrift = shouldDriftTopicVector(bestTopicSim, assignmentContext);
  // Handles the case where can drift is available.
  if (canDrift) {
    logTopicDrift({
      topicId: bestTopic.id,
      similarity: bestTopicSim,
      semanticUnit
    });
  }

  // Selects the updated topic based on whether can drift is available.
  const updatedTopic = canDrift
    ? await bestTopic.update({
      topicVector: blendTopicVectorWithAlpha(
        bestTopic.topicVector,
        semanticVector,
        Math.max(0, Math.min(TOPIC_VECTOR_DRIFT_ALPHA, 1))
      ),
      lastActivityAt: now
    })
    : await bestTopic.update({ lastActivityAt: now });

  upsertTopicInCache(topicsCache, updatedTopic);

  return {
    topicId: updatedTopic.id,
    confidence: Number(bestTopicSim.toFixed(4)),
    rank: 1,
    primaryInd: true
  };
}

// This function refreshes a topic matched by stable topic key and returns a primary assignment row.
export async function updateTopicByKey({
  topic,
  now,
  topicsCache
}) {
  // Derives the updated topic through update while updating topic by key.
  const updatedTopic = await topic.update({ lastActivityAt: now });
  upsertTopicInCache(topicsCache, updatedTopic);

  return {
    topicId: updatedTopic.id,
    confidence: 1,
    rank: 1,
    primaryInd: true
  };
}

export default {
  updateMatchedTopics,
  updateIdentityTopic,
  updateTopicByKey
};
