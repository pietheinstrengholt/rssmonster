import db from '../../models/index.js';
import {
  MAX_CANDIDATES,
  TOPIC_IDENTITY_THRESHOLD,
  PRIMARY_TOPIC_THRESHOLD,
  SECONDARY_TOPIC_THRESHOLD,
  MAX_TOPICS_PER_ARTICLE
} from '../config/semanticConfig.js';
import {
  cosineSimilarity,
  generateTopicKey
} from './topicHelpers.js';
import {
  updateMatchedTopics,
  updateIdentityTopic,
  updateTopicByKey
} from './updateTopic.js';
import { createTopic } from './createTopics.js';

const { Topic } = db;
const MAX_TOPIC_CANDIDATES = MAX_TOPICS_PER_ARTICLE;
const REPLAY_PRIMARY_HYSTERESIS = 0.01;
const REPLAY_SECONDARY_HYSTERESIS = 0.02;

export async function assignSemanticUnitToTopic({
  semanticUnit,
  semanticVector,
  topicsCache = null,
  assignmentContext = 'incremental'
}) {
  if (!semanticVector) return [];

  const primaryThreshold = assignmentContext === 'replay'
    ? Math.min(PRIMARY_TOPIC_THRESHOLD + REPLAY_PRIMARY_HYSTERESIS, 0.999)
    : PRIMARY_TOPIC_THRESHOLD;
  const secondaryThreshold = assignmentContext === 'replay'
    ? Math.min(SECONDARY_TOPIC_THRESHOLD + REPLAY_SECONDARY_HYSTERESIS, 0.999)
    : SECONDARY_TOPIC_THRESHOLD;

  const matchedCandidates = [];
  let bestTopic = null;
  let bestTopicSim = 0;

  const topics = topicsCache
    ? topicsCache
    : await Topic.findAll({
      where: { userId: semanticUnit.userId },
      order: [['updatedAt', 'DESC']],
      limit: MAX_CANDIDATES
    });

  for (const topic of topics) {
    if (!topic.topicVector) continue;

    const sim = cosineSimilarity(
      semanticVector,
      topic.topicVector
    );

    if (sim > bestTopicSim) {
      bestTopicSim = sim;
      bestTopic = topic;
    }

    if (sim >= secondaryThreshold) {
      matchedCandidates.push({ topic, sim });
    }
  }

  const now = semanticUnit.published || new Date();

  if (matchedCandidates.length) {
    const rankedCandidates = matchedCandidates
      .sort((a, b) => (b.sim - a.sim) || (a.topic.id - b.topic.id))
      .slice(0, MAX_TOPIC_CANDIDATES);

    const primaryCandidate = rankedCandidates.find(candidate =>
      candidate.sim >= primaryThreshold
    ) ?? null;

    await updateMatchedTopics({
      rankedCandidates,
      primaryCandidate,
      semanticVector,
      assignmentContext,
      now,
      topicsCache
    });

    return rankedCandidates.map((candidate, index) => ({
      topicId: candidate.topic.id,
      confidence: Number(candidate.sim.toFixed(4)),
      rank: index + 1,
      primaryInd: Boolean(primaryCandidate && candidate.topic.id === primaryCandidate.topic.id)
    }));
  }

  const topicKey = generateTopicKey(semanticVector);
  const currentEventId = Number(semanticUnit.id) || null;

  if (bestTopic && bestTopicSim >= TOPIC_IDENTITY_THRESHOLD) {
    return [await updateIdentityTopic({
      bestTopic,
      bestTopicSim,
      semanticVector,
      assignmentContext,
      now,
      topicsCache
    })];
  }

  if (topicKey) {
    const cachedKeyMatch = topicsCache?.find(topic => topic.topicKey === topicKey) ?? null;
    if (cachedKeyMatch) {
      return [await updateTopicByKey({
        topic: cachedKeyMatch,
        now,
        topicsCache
      })];
    }

    const persistedKeyMatch = await Topic.findOne({
      where: {
        userId: semanticUnit.userId,
        topicKey
      }
    });

    if (persistedKeyMatch) {
      return [await updateTopicByKey({
        topic: persistedKeyMatch,
        now,
        topicsCache
      })];
    }
  }

  return createTopic({
    semanticUnit,
    semanticVector,
    topicKey,
    now,
    currentEventId,
    topicsCache
  });
}

export async function assignEventToTopic({
  article,
  articleTopicVector,
  topicsCache = null,
  assignmentContext = 'incremental'
}) {
  return assignSemanticUnitToTopic({
    semanticUnit: article,
    semanticVector: articleTopicVector,
    topicsCache,
    assignmentContext
  });
}

export default assignEventToTopic;
