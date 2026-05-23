import {
  TOPIC_VECTOR_DRIFT_ALPHA,
  blendTopicVector,
  blendTopicVectorWithAlpha,
  shouldDriftTopicVector,
  upsertTopicInCache
} from './topicHelpers.js';

export async function updateMatchedTopics({
  rankedCandidates,
  primaryCandidate,
  semanticVector,
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

export async function updateIdentityTopic({
  bestTopic,
  bestTopicSim,
  semanticVector,
  assignmentContext,
  now,
  topicsCache
}) {
  const canDrift = shouldDriftTopicVector(bestTopicSim, assignmentContext);
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
