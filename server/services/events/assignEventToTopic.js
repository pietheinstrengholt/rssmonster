import crypto from 'crypto';
import db from '../../models/index.js';
import {
  MAX_CANDIDATES,
  TOPIC_VECTOR_ALPHA,
  TOPIC_IDENTITY_THRESHOLD,
  PRIMARY_TOPIC_THRESHOLD,
  SECONDARY_TOPIC_THRESHOLD,
  MAX_TOPICS_PER_ARTICLE
} from './semanticConfig.js';

const { Topic } = db;
const MAX_TOPIC_CANDIDATES = MAX_TOPICS_PER_ARTICLE;
const REPLAY_PRIMARY_HYSTERESIS = 0.01;
const REPLAY_SECONDARY_HYSTERESIS = 0.02;

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (!a.length || !b.length) return 0;
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (!normA || !normB) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function generateTopicKey(topicVector) {
  if (!Array.isArray(topicVector)) return null;

  const slice = topicVector.slice(0, 32);
  const buffer = Buffer.from(
    slice.map(v => Math.round(v * 1e6)).join(',')
  );

  return crypto.createHash('sha1').update(buffer).digest('hex');
}

function generateTopicName(article) {
  if (!article?.title) return 'Untitled Topic';

  const name = article.title
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trim();

  return name || 'Untitled Topic';
}

function blendTopicVector(existingVector, incomingVector) {
  if (!Array.isArray(existingVector) || !Array.isArray(incomingVector)) return incomingVector;
  if (existingVector.length !== incomingVector.length) return incomingVector;

  return existingVector.map(
    (value, index) => value * (1 - TOPIC_VECTOR_ALPHA) + incomingVector[index] * TOPIC_VECTOR_ALPHA
  );
}

function blendTopicVectorWithAlpha(existingVector, incomingVector, alpha) {
  if (!Array.isArray(existingVector) || !Array.isArray(incomingVector)) return incomingVector;
  if (existingVector.length !== incomingVector.length) return incomingVector;

  return existingVector.map(
    (value, index) => value * (1 - alpha) + incomingVector[index] * alpha
  );
}

function upsertTopicInCache(topicsCache, topic) {
  if (!topicsCache) return;

  const existingIndex = topicsCache.findIndex(item => item.id === topic.id);
  if (existingIndex >= 0) {
    topicsCache[existingIndex] = topic;
    return;
  }

  topicsCache.unshift(topic);
}

export async function assignEventToTopic({
  article,
  articleTopicVector,
  topicsCache = null,
  assignmentContext = 'incremental'
}) {
  if (!articleTopicVector) return [];

  const shouldUpdateTopicVector = assignmentContext !== 'replay';
  const primaryThreshold = assignmentContext === 'replay'
    ? Math.min(PRIMARY_TOPIC_THRESHOLD + REPLAY_PRIMARY_HYSTERESIS, 0.999)
    : PRIMARY_TOPIC_THRESHOLD;
  const secondaryThreshold = assignmentContext === 'replay'
    ? Math.min(SECONDARY_TOPIC_THRESHOLD + REPLAY_SECONDARY_HYSTERESIS, 0.999)
    : SECONDARY_TOPIC_THRESHOLD;

  const matchedCandidates = [];
  let bestTopic = null;
  let bestTopicSim = 0;

  // Use cached topics if provided; otherwise fetch
  const topics = topicsCache
    ? topicsCache
    : await Topic.findAll({
        where: { userId: article.userId },
        order: [['updatedAt', 'DESC']],
        limit: MAX_CANDIDATES
      });

  for (const topic of topics) {
    if (!topic.topicVector) continue;

    const sim = cosineSimilarity(
      articleTopicVector,
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

  if (matchedCandidates.length) {
    const now = article.published || new Date();
    const rankedCandidates = matchedCandidates
      .sort((a, b) => (b.sim - a.sim) || (a.topic.id - b.topic.id))
      .slice(0, MAX_TOPIC_CANDIDATES);

    const primaryCandidate = rankedCandidates.find(candidate =>
      candidate.sim >= primaryThreshold
    ) ?? null;

    const updates = rankedCandidates.map(candidate => {
      if (primaryCandidate && candidate.topic.id === primaryCandidate.topic.id && shouldUpdateTopicVector) {
        const blendedTopicVector = blendTopicVector(
          candidate.topic.topicVector,
          articleTopicVector
        );

        return candidate.topic.update({
          topicVector: blendedTopicVector,
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

    return rankedCandidates.map((candidate, index) => ({
      topicId: candidate.topic.id,
      confidence: Number(candidate.sim.toFixed(4)),
      rank: index + 1,
      primaryInd: Boolean(primaryCandidate && candidate.topic.id === primaryCandidate.topic.id)
    }));
  }

  const topicKey = generateTopicKey(articleTopicVector);
  const now = article.published || new Date();

  // Reuse topic by identity before creating a new semantic region.
  if (bestTopic && bestTopicSim >= TOPIC_IDENTITY_THRESHOLD) {
    const updatedTopic = shouldUpdateTopicVector
      ? await bestTopic.update({
        topicVector: blendTopicVectorWithAlpha(
          bestTopic.topicVector,
          articleTopicVector,
          TOPIC_VECTOR_ALPHA * 0.25
        ),
        lastActivityAt: now
      })
      : await bestTopic.update({ lastActivityAt: now });

    upsertTopicInCache(topicsCache, updatedTopic);

    return [{
      topicId: updatedTopic.id,
      confidence: Number(bestTopicSim.toFixed(4)),
      rank: 1,
      primaryInd: true
    }];
  }

  // Deterministic fallback: same vector signature should resolve to same topic.
  if (topicKey) {
    const cachedKeyMatch = topicsCache?.find(topic => topic.topicKey === topicKey) ?? null;
    if (cachedKeyMatch) {
      const updatedTopic = await cachedKeyMatch.update({ lastActivityAt: now });
      upsertTopicInCache(topicsCache, updatedTopic);

      return [{
        topicId: updatedTopic.id,
        confidence: 1,
        rank: 1,
        primaryInd: true
      }];
    }

    const persistedKeyMatch = await Topic.findOne({
      where: {
        userId: article.userId,
        topicKey
      }
    });

    if (persistedKeyMatch) {
      const updatedTopic = await persistedKeyMatch.update({ lastActivityAt: now });
      upsertTopicInCache(topicsCache, updatedTopic);

      return [{
        topicId: updatedTopic.id,
        confidence: 1,
        rank: 1,
        primaryInd: true
      }];
    }
  }

  const createdTopic = await Topic.create({
    userId: article.userId,
    name: generateTopicName(article),
    topicKey: topicKey || `topic-${article.userId}-${article.id}`,
    topicVector: articleTopicVector,
    articleCount: 0,
    eventCount: 0,
    lastActivityAt: now
  });

  upsertTopicInCache(topicsCache, createdTopic);

  return [{
    topicId: createdTopic.id,
    confidence: 1,
    rank: 1,
    primaryInd: true
  }];
}

export default assignEventToTopic;
