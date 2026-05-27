import crypto from 'crypto';
import db from '../../models/index.js';
import {
  MAX_CANDIDATES,
  TOPIC_VECTOR_ALPHA,
  TOPIC_IDENTITY_THRESHOLD
} from '../config/semanticConfig.js';

const { Article, Event } = db;

const MIN_EVENTS_FOR_TOPIC_CREATION = Number.parseInt(process.env.TOPIC_MIN_EVENTS_FOR_CREATION || '2', 10);
const MIN_ARTICLES_FOR_TOPIC_CREATION = Number.parseInt(process.env.TOPIC_MIN_ARTICLES_FOR_CREATION || '3', 10);
const MIN_STRONG_EVENT_ARTICLES = Number.parseInt(process.env.TOPIC_MIN_STRONG_EVENT_ARTICLES || '2', 10);
const MIN_STRONG_EVENT_SOURCES = Number.parseInt(process.env.TOPIC_MIN_STRONG_EVENT_SOURCES || '2', 10);
const MIN_STRONG_EVENT_STRENGTH = Number.parseFloat(process.env.TOPIC_MIN_STRONG_EVENT_STRENGTH || '0.35');
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
  MIN_ARTICLES_FOR_TOPIC_CREATION,
  MIN_STRONG_EVENT_ARTICLES,
  MIN_STRONG_EVENT_SOURCES,
  MIN_STRONG_EVENT_STRENGTH,
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

function asNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeIdentityText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasMeaningfulEventName(name = '') {
  const normalized = normalizeIdentityText(name);
  if (!normalized) return false;
  if (/^event\s+\d+$/.test(normalized)) return false;
  if (normalized === 'untitled topic') return false;

  const tokens = normalized.split(/\s+/).filter(token => token.length > 2);
  return tokens.length >= 2 || tokens.some(token => token.length >= 5);
}

function identityCandidatesFromTopicName(topicName = '') {
  const candidates = new Set();
  const normalizedName = normalizeIdentityText(topicName);

  if (normalizedName) candidates.add(normalizedName);

  for (const part of String(topicName).split(/\s*\/\s*|,|:|\|/)) {
    const normalizedPart = normalizeIdentityText(part);
    if (normalizedPart) candidates.add(normalizedPart);
  }

  return [...candidates]
    .filter(candidate => {
      const tokens = candidate.split(/\s+/).filter(Boolean);
      return tokens.length >= 2 || candidate.length >= 5;
    })
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function titleContainsCandidate(title, candidate) {
  const normalizedTitle = ` ${normalizeIdentityText(title)} `;
  const normalizedCandidate = ` ${normalizeIdentityText(candidate)} `;

  return normalizedCandidate.trim() && normalizedTitle.includes(normalizedCandidate);
}

function hasRepeatedEntityEvidence({ topicName, titles = [] }) {
  const usableTitles = [...new Map(titles
    .map(title => [normalizeIdentityText(title), String(title || '')])
    .filter(([key]) => key)
  ).values()];
  if (usableTitles.length < 2) return false;

  const candidates = identityCandidatesFromTopicName(topicName);
  return candidates.some(candidate =>
    usableTitles.filter(title => titleContainsCandidate(title, candidate)).length >= 2
  );
}

export function evaluateTopicCreationGate({
  semanticUnit = null,
  currentEvent = null,
  topicSeedEvents = [],
  seedArticleCount = 0,
  topSeedSimilarity = 0,
  topicName = '',
  currentEventArticleTitles = []
} = {}) {
  const event = currentEvent || semanticUnit || {};
  const articleCount = asNumber(event.articleCount ?? semanticUnit?.articleCount);
  const sourceCount = asNumber(event.sourceCount ?? semanticUnit?.sourceCount);
  const eventStrength = asNumber(event.eventStrength ?? semanticUnit?.eventStrength);
  const eventName = event.name || semanticUnit?.name || semanticUnit?.title || '';
  const status = event.status || semanticUnit?.status || null;

  const hasEnoughEventEvidence = topicSeedEvents.length >= MIN_EVENTS_FOR_TOPIC_CREATION;
  const hasEnoughArticleEvidence = seedArticleCount >= MIN_ARTICLES_FOR_TOPIC_CREATION;
  const hasMinimumEventSize = articleCount >= 2;

  if (hasMinimumEventSize && (hasEnoughEventEvidence || hasEnoughArticleEvidence)) {
    return { passed: true, reason: 'seed-evidence' };
  }

  if (
    articleCount >= MIN_STRONG_EVENT_ARTICLES &&
    sourceCount >= MIN_STRONG_EVENT_SOURCES &&
    eventStrength >= MIN_STRONG_EVENT_STRENGTH &&
    hasMeaningfulEventName(eventName) &&
    status !== 'archived'
  ) {
    return { passed: true, reason: 'strong-event' };
  }

  if (
    articleCount === 2 &&
    topSeedSimilarity >= TOPIC_IDENTITY_THRESHOLD &&
    hasRepeatedEntityEvidence({
      topicName,
      titles: [
        eventName,
        semanticUnit?.title,
        ...currentEventArticleTitles
      ]
    })
  ) {
    return { passed: true, reason: 'repeat-entity' };
  }

  return { passed: false, reason: null };
}

export async function collectTopicSeedEvents(userId, eventTopicVector, currentEventId) {
  const events = await Event.findAll({
    where: {
      userId,
      topicId: null,
      eventVector: { [db.Sequelize.Op.ne]: null }
    },
    attributes: [
      'id',
      'eventVector',
      'name',
      'articleCount',
      'sourceCount',
      'eventStrength',
      'status',
      'lastSeen',
      'updatedAt'
    ],
    order: [['updatedAt', 'DESC'], ['id', 'ASC']],
    limit: MAX_CANDIDATES
  });

  const scored = events
    .map(event => ({
      event,
      similarity: cosineSimilarity(eventTopicVector, event.eventVector)
    }))
    .filter(item => item.similarity >= TOPIC_IDENTITY_THRESHOLD)
    .sort((a, b) => (b.similarity - a.similarity) || (a.event.id - b.event.id));

  if (currentEventId && !scored.some(item => Number(item.event.id) === Number(currentEventId))) {
    const currentEvent = await Event.findByPk(currentEventId, {
      attributes: [
        'id',
        'eventVector',
        'name',
        'articleCount',
        'sourceCount',
        'eventStrength',
        'status',
        'lastSeen',
        'updatedAt'
      ]
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

export async function collectEventArticleTitles(userId, eventId) {
  if (!eventId) return [];

  const articles = await Article.findAll({
    where: { userId, eventId },
    attributes: ['title'],
    order: [['published', 'ASC'], ['id', 'ASC']],
    limit: 6,
    raw: true
  });

  return articles.map(article => article.title).filter(Boolean);
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
