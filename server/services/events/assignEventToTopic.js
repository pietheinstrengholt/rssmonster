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

const { Topic, Event } = db;
const MAX_TOPIC_CANDIDATES = MAX_TOPICS_PER_ARTICLE;
const REPLAY_PRIMARY_HYSTERESIS = 0.01;
const REPLAY_SECONDARY_HYSTERESIS = 0.02;
const MIN_EVENTS_FOR_TOPIC_CREATION = Number.parseInt(process.env.TOPIC_MIN_EVENTS_FOR_CREATION || '2', 10);
const TOPIC_VECTOR_DRIFT_ENABLED = ['1', 'true', 'yes'].includes(
  String(process.env.TOPIC_VECTOR_DRIFT_ENABLED || 'false').toLowerCase()
);
const TOPIC_VECTOR_DRIFT_ALPHA = Number.parseFloat(process.env.TOPIC_VECTOR_DRIFT_ALPHA || '0.03');
const TOPIC_VECTOR_DRIFT_MAX_SIMILARITY = Number.parseFloat(process.env.TOPIC_VECTOR_DRIFT_MAX_SIMILARITY || '0.92');
const TOPIC_DEBUG = ['1', 'true', 'yes'].includes(
  String(process.env.TOPIC_DEBUG || process.env.EVENT_DEBUG || '').toLowerCase()
);

function debugTopicGate(message, payload = null) {
  if (!TOPIC_DEBUG) return;

  if (payload == null) {
    console.log(`[TOPIC DEBUG] ${message}`);
    return;
  }

  console.log(`[TOPIC DEBUG] ${message}`, payload);
}

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

function generateTopicName(semanticUnit) {
  if (!semanticUnit?.title) return 'Untitled Topic';

  const name = semanticUnit.title
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

function averageVector(vectors = []) {
  const usable = vectors.filter(vector => Array.isArray(vector) && vector.length);
  if (!usable.length) return null;

  const dimension = usable[0].length;
  const filtered = usable.filter(vector => vector.length === dimension);
  if (!filtered.length) return null;

  const sum = Array(dimension).fill(0);
  for (const vector of filtered) {
    for (let i = 0; i < dimension; i++) {
      sum[i] += vector[i];
    }
  }

  return sum.map(value => value / filtered.length);
}

async function collectTopicSeedEvents(userId, eventTopicVector, currentEventId) {
  const events = await Event.findAll({
    where: {
      userId,
      topicId: null,
      eventVector: { [db.Sequelize.Op.ne]: null }
    },
    attributes: ['id', 'eventVector', 'name', 'lastSeen', 'updatedAt'],
    order: [['updatedAt', 'DESC']],
    limit: MAX_CANDIDATES
  });

  const scored = events
    .map(event => ({
      event,
      similarity: cosineSimilarity(eventTopicVector, event.eventVector)
    }))
    .filter(item => item.similarity >= TOPIC_IDENTITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity);

  if (currentEventId && !scored.some(item => Number(item.event.id) === Number(currentEventId))) {
    const currentEvent = await Event.findByPk(currentEventId, {
      attributes: ['id', 'eventVector', 'name', 'lastSeen', 'updatedAt']
    });

    if (currentEvent?.eventVector) {
      scored.unshift({
        event: currentEvent,
        similarity: cosineSimilarity(eventTopicVector, currentEvent.eventVector)
      });
    }
  }

  return scored;
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

function shouldDriftTopicVector(similarity, assignmentContext) {
  if (!TOPIC_VECTOR_DRIFT_ENABLED) return false;
  if (assignmentContext === 'replay') return false;
  if (!Number.isFinite(similarity)) return false;

  return similarity <= TOPIC_VECTOR_DRIFT_MAX_SIMILARITY;
}

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

  // Use cached topics if provided; otherwise fetch
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

  if (matchedCandidates.length) {
    const now = semanticUnit.published || new Date();
    const rankedCandidates = matchedCandidates
      .sort((a, b) => (b.sim - a.sim) || (a.topic.id - b.topic.id))
      .slice(0, MAX_TOPIC_CANDIDATES);

    const primaryCandidate = rankedCandidates.find(candidate =>
      candidate.sim >= primaryThreshold
    ) ?? null;

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

    return rankedCandidates.map((candidate, index) => ({
      topicId: candidate.topic.id,
      confidence: Number(candidate.sim.toFixed(4)),
      rank: index + 1,
      primaryInd: Boolean(primaryCandidate && candidate.topic.id === primaryCandidate.topic.id)
    }));
  }

  const topicKey = generateTopicKey(semanticVector);
  const now = semanticUnit.published || new Date();
  const currentEventId = Number(semanticUnit.id) || null;

  // Reuse topic by identity before creating a new semantic region.
  if (bestTopic && bestTopicSim >= TOPIC_IDENTITY_THRESHOLD) {
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
        userId: semanticUnit.userId,
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

  const topicSeedEvents = await collectTopicSeedEvents(semanticUnit.userId, semanticVector, currentEventId);
  const topSeedSimilarity = Number((topicSeedEvents[0]?.similarity || 0).toFixed(4));

  debugTopicGate('topic-creation-gate-evaluated', {
    userId: semanticUnit.userId,
    eventId: currentEventId,
    seedCount: topicSeedEvents.length,
    threshold: MIN_EVENTS_FOR_TOPIC_CREATION,
    topSimilarity: topSeedSimilarity
  });

  if (topicSeedEvents.length < MIN_EVENTS_FOR_TOPIC_CREATION) {
    debugTopicGate('topic-creation-gate-blocked', {
      userId: semanticUnit.userId,
      eventId: currentEventId,
      seedCount: topicSeedEvents.length,
      threshold: MIN_EVENTS_FOR_TOPIC_CREATION,
      topSimilarity: topSeedSimilarity
    });

    return [];
  }

  const topicVector = averageVector(topicSeedEvents.map(item => item.event.eventVector)) || semanticVector;
  const createdTopic = await Topic.create({
    userId: semanticUnit.userId,
    name: generateTopicName(semanticUnit),
    topicKey: topicKey || `topic-${semanticUnit.userId}-${semanticUnit.id}`,
    topicVector,
    articleCount: 0,
    eventCount: 0,
    lastActivityAt: now
  });

  upsertTopicInCache(topicsCache, createdTopic);

  debugTopicGate('topic-creation-gate-passed', {
    userId: semanticUnit.userId,
    eventId: currentEventId,
    topicId: createdTopic.id,
    seedCount: topicSeedEvents.length,
    threshold: MIN_EVENTS_FOR_TOPIC_CREATION,
    topSimilarity: topSeedSimilarity
  });

  return [{
    topicId: createdTopic.id,
    confidence: Number((topicSeedEvents[0]?.similarity || 1).toFixed(4)),
    rank: 1,
    primaryInd: true
  }];
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
