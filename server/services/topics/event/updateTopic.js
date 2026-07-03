import {
  TOPIC_VECTOR_DRIFT_ALPHA,
  blendTopicVector,
  blendTopicVectorWithAlpha,
  shouldDriftTopicVector,
  upsertTopicInCache
} from '../shared/topicHelpers.js';

// This service updates existing topics after semantic assignment matches.
// It centralizes vector drift, activity timestamps, and in-memory cache refreshes.

// This function formats topic drift similarity values for concise logs.
function formatTopicMetric(value, digits = 3) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : 'n/a';
}

// This function logs when an event causes a topic vector to drift.
function logTopicDrift({ topicId, similarity, semanticUnit }) {
  console.log(
    `[TOPIC] topic=${topicId} drift ` +
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
  const updates = rankedCandidates.map(candidate => {
    const canDrift = shouldDriftTopicVector(candidate.sim, assignmentContext);

    if (primaryCandidate && candidate.topic.id === primaryCandidate.topic.id && canDrift) {
      const blendedTopicVector = blendTopicVector(
        candidate.topic.topicVector,
        semanticVector
      );

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

  const updatedTopics = await Promise.all(updates);

  if (topicsCache) {
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
  const canDrift = shouldDriftTopicVector(bestTopicSim, assignmentContext);
  if (canDrift) {
    logTopicDrift({
      topicId: bestTopic.id,
      similarity: bestTopicSim,
      semanticUnit
    });
  }

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
