import crypto from 'crypto';
import db from '../../models/index.js';
import {
  MAX_CANDIDATES,
  TOPIC_SIM_THRESHOLD,
  TOPIC_VECTOR_ALPHA
} from './semanticConfig.js';

const { Topic } = db;
const MAX_TOPIC_CANDIDATES = 3;

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

export async function assignEventToTopic({ article, articleTopicVector, topicsCache = null }) {
  if (!articleTopicVector) return null;

  let bestTopicSim = 0;
  let bestTopic = null;
  const matchedCandidates = [];

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

    if (sim >= TOPIC_SIM_THRESHOLD) {
      matchedCandidates.push({ topic, sim });
    }
  }

  if (bestTopic && bestTopicSim >= TOPIC_SIM_THRESHOLD) {
    const now = article.published || new Date();
    const blendedTopicVector = blendTopicVector(
      bestTopic.topicVector,
      articleTopicVector
    );

    const [updatedTopic] = await Promise.all([
      bestTopic.update({
        topicVector: blendedTopicVector,
        lastActivityAt: now
      }),
      matchedCandidates
        .sort((a, b) => b.sim - a.sim)
        .slice(0, MAX_TOPIC_CANDIDATES)
        .reduce((promise, candidate) => promise.then(() => {
          if (candidate.topic.id === bestTopic.id) return Promise.resolve();
          return candidate.topic.update({ lastActivityAt: now });
        }), Promise.resolve())
    ]);

    if (topicsCache) {
      const cacheIndex = topicsCache.findIndex(topic => topic.id === updatedTopic.id);
      if (cacheIndex >= 0) {
        topicsCache[cacheIndex] = updatedTopic;
      }
    }

    return updatedTopic;
  }

  const topicKey = generateTopicKey(articleTopicVector);
  const now = article.published || new Date();

  const createdTopic = await Topic.create({
    userId: article.userId,
    name: generateTopicName(article),
    topicKey: topicKey || `topic-${article.userId}-${article.id}`,
    topicVector: articleTopicVector,
    articleCount: 0,
    eventCount: 0,
    lastActivityAt: now
  });

  if (topicsCache) {
    topicsCache.unshift(createdTopic);
    if (topicsCache.length > MAX_CANDIDATES) {
      topicsCache.pop();
    }
  }

  return createdTopic;
}

export default assignEventToTopic;
