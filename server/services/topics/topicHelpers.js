import crypto from 'crypto';
import db from '../../models/index.js';
import {
  MAX_CANDIDATES,
  TOPIC_VECTOR_ALPHA,
  TOPIC_IDENTITY_THRESHOLD
} from '../config/semanticConfig.js';

const { Event } = db;

const MIN_EVENTS_FOR_TOPIC_CREATION = Number.parseInt(process.env.TOPIC_MIN_EVENTS_FOR_CREATION || '2', 10);
const TOPIC_VECTOR_DRIFT_ENABLED = ['1', 'true', 'yes'].includes(
  String(process.env.TOPIC_VECTOR_DRIFT_ENABLED || 'false').toLowerCase()
);
const TOPIC_VECTOR_DRIFT_ALPHA = Number.parseFloat(process.env.TOPIC_VECTOR_DRIFT_ALPHA || '0.03');
const TOPIC_VECTOR_DRIFT_MAX_SIMILARITY = Number.parseFloat(process.env.TOPIC_VECTOR_DRIFT_MAX_SIMILARITY || '0.92');
const TOPIC_DEBUG = ['1', 'true', 'yes'].includes(
  String(process.env.TOPIC_DEBUG || process.env.EVENT_DEBUG || '').toLowerCase()
);

export {
  MIN_EVENTS_FOR_TOPIC_CREATION,
  TOPIC_VECTOR_DRIFT_ALPHA,
  TOPIC_IDENTITY_THRESHOLD
};

export function debugTopicGate(message, payload = null) {
  if (!TOPIC_DEBUG) return;

  if (payload == null) {
    console.log(`[TOPIC DEBUG] ${message}`);
    return;
  }

  console.log(`[TOPIC DEBUG] ${message}`, payload);
}

export function cosineSimilarity(a, b) {
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

export function generateTopicKey(topicVector) {
  if (!Array.isArray(topicVector)) return null;

  const slice = topicVector.slice(0, 32);
  const buffer = Buffer.from(
    slice.map(v => Math.round(v * 1e6)).join(',')
  );

  return crypto.createHash('sha1').update(buffer).digest('hex');
}

export function generateTopicName(semanticUnit) {
  if (!semanticUnit?.title) return 'Untitled Topic';

  const name = semanticUnit.title
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trim();

  return name || 'Untitled Topic';
}

export function blendTopicVector(existingVector, incomingVector) {
  if (!Array.isArray(existingVector) || !Array.isArray(incomingVector)) return incomingVector;
  if (existingVector.length !== incomingVector.length) return incomingVector;

  return existingVector.map(
    (value, index) => value * (1 - TOPIC_VECTOR_ALPHA) + incomingVector[index] * TOPIC_VECTOR_ALPHA
  );
}

export function blendTopicVectorWithAlpha(existingVector, incomingVector, alpha) {
  if (!Array.isArray(existingVector) || !Array.isArray(incomingVector)) return incomingVector;
  if (existingVector.length !== incomingVector.length) return incomingVector;

  return existingVector.map(
    (value, index) => value * (1 - alpha) + incomingVector[index] * alpha
  );
}

export function averageVector(vectors = []) {
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

export async function collectTopicSeedEvents(userId, eventTopicVector, currentEventId) {
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

export function upsertTopicInCache(topicsCache, topic) {
  if (!topicsCache) return;

  const existingIndex = topicsCache.findIndex(item => item.id === topic.id);
  if (existingIndex >= 0) {
    topicsCache[existingIndex] = topic;
    return;
  }

  topicsCache.unshift(topic);
}

export function shouldDriftTopicVector(similarity, assignmentContext) {
  if (!TOPIC_VECTOR_DRIFT_ENABLED) return false;
  if (assignmentContext === 'replay') return false;
  if (!Number.isFinite(similarity)) return false;

  return similarity <= TOPIC_VECTOR_DRIFT_MAX_SIMILARITY;
}
