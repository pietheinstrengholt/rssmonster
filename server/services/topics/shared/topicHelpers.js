import crypto from 'crypto';
import db from '../../../models/index.js';
import {
  MAX_CANDIDATES,
  TOPIC_VECTOR_ALPHA,
  TOPIC_IDENTITY_THRESHOLD
} from '../../config/semanticConfig.js';
import {
  averageVector,
  blendVector,
  cosineSimilarity
} from '../../vectors/index.js';
import { canonicalArticleWhere } from '../../duplicates/articleDuplicates.js';

// Provides the shared dependencies used by this service.
const { Article, Event } = db;

// This module contains shared topic math, gating, cache, and seed-evidence helpers.
// Event-topic creation and matching use these helpers to keep topic behavior consistent.

// Defines the min events for topic creation enforced by this service.
const MIN_EVENTS_FOR_TOPIC_CREATION = Number.parseInt(process.env.TOPIC_MIN_EVENTS_FOR_CREATION || '2', 10);
// Defines the min articles for topic creation enforced by this service.
const MIN_ARTICLES_FOR_TOPIC_CREATION = Number.parseInt(process.env.TOPIC_MIN_ARTICLES_FOR_CREATION || '3', 10);
// Defines the min strong event articles enforced by this service.
const MIN_STRONG_EVENT_ARTICLES = Number.parseInt(process.env.TOPIC_MIN_STRONG_EVENT_ARTICLES || '2', 10);
// Defines the min strong event sources enforced by this service.
const MIN_STRONG_EVENT_SOURCES = Number.parseInt(process.env.TOPIC_MIN_STRONG_EVENT_SOURCES || '2', 10);
// Defines the min strong event strength enforced by this service.
const MIN_STRONG_EVENT_STRENGTH = Number.parseFloat(process.env.TOPIC_MIN_STRONG_EVENT_STRENGTH || '0.35');
// Defines the topic vector drift enabled enforced by this service.
const TOPIC_VECTOR_DRIFT_ENABLED = ['1', 'true', 'yes'].includes(
  String(process.env.TOPIC_VECTOR_DRIFT_ENABLED || 'false').toLowerCase()
);
// Defines the topic vector drift alpha enforced by this service.
const TOPIC_VECTOR_DRIFT_ALPHA = Number.parseFloat(process.env.TOPIC_VECTOR_DRIFT_ALPHA || '0.03');
// Defines the topic vector drift max similarity enforced by this service.
const TOPIC_VECTOR_DRIFT_MAX_SIMILARITY = Number.parseFloat(process.env.TOPIC_VECTOR_DRIFT_MAX_SIMILARITY || '0.92');
// Defines the topic debug enforced by this service.
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

// This function writes topic gate debug output when topic debugging is enabled.
export function debugTopicGate(message, payload = null) {
  // Returns early when topic debug is unavailable.
  if (!TOPIC_DEBUG) return;

  // Handles the case where payload is value.
  if (payload == null) {
    console.log(`[TOPIC DEBUG] ${message}`);
    return;
  }

  console.log(`[TOPIC DEBUG] ${message}`, payload);
}

export { averageVector, cosineSimilarity };

// This function creates a stable short hash key from the leading topic vector dimensions.
export function generateTopicKey(topicVector) {
  // Returns no result when topic vector is not an array.
  if (!Array.isArray(topicVector)) return null;

  // Derives the slice through slice while generating topic key.
  const slice = topicVector.slice(0, 32);
  // Derives the buffer through from while generating topic key.
  const buffer = Buffer.from(
    slice.map(v => Math.round(v * 1e6)).join(',')
  );

  return crypto.createHash('sha1').update(buffer).digest('hex');
}

// This function blends a topic vector with the configured default drift alpha.
export function blendTopicVector(existingVector, incomingVector) {
  return blendVector(existingVector, incomingVector, TOPIC_VECTOR_ALPHA);
}

// This function blends two topic vectors with an explicit alpha.
export function blendTopicVectorWithAlpha(existingVector, incomingVector, alpha) {
  return blendVector(existingVector, incomingVector, alpha);
}

// This function parses numeric evidence fields with a safe fallback.
function asNumber(value, fallback = 0) {
  // Coerces the parsed into the representation required while performing as number.
  const parsed = Number(value);
  // Selects the result based on whether parsed is finite.
  return Number.isFinite(parsed) ? parsed : fallback;
}

// This function normalizes identity text for topic gate entity checks.
function normalizeIdentityText(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// This function decides whether an event name is specific enough to create a topic.
function hasMeaningfulEventName(name = '') {
  // Normalizes the normalized before checking meaningful event name.
  const normalized = normalizeIdentityText(name);
  // Rejects the value when normalized is unavailable.
  if (!normalized) return false;
  // Rejects the value when normalized matches the expected format.
  if (/^event\s+\d+$/.test(normalized)) return false;
  // Rejects the value when normalized is untitled topic.
  if (normalized === 'untitled topic') return false;

  // Keeps the tokens entries eligible while checking meaningful event name.
  const tokens = normalized.split(/\s+/).filter(token => token.length > 2);
  // Checks candidate values while checking meaningful event name.
  return tokens.length >= 2 || tokens.some(token => token.length >= 5);
}

// This function extracts normalized identity candidates from a topic name.
function identityCandidatesFromTopicName(topicName = '') {
  // Tracks distinct candidates while performing identity candidates from topic name.
  const candidates = new Set();
  // Normalizes the name before performing identity candidates from topic name.
  const normalizedName = normalizeIdentityText(topicName);

  // Handles the case where normalized name is available.
  if (normalizedName) candidates.add(normalizedName);

  // Processes each split entry in turn.
  for (const part of String(topicName).split(/\s*\/\s*|,|:|\|/)) {
    // Normalizes the part before performing identity candidates from topic name.
    const normalizedPart = normalizeIdentityText(part);
    // Handles the case where normalized part is available.
    if (normalizedPart) candidates.add(normalizedPart);
  }

  // Filters source values to the entries eligible while performing identity candidates from topic name.
  return [...candidates]
    .filter(candidate => {
      // Keeps the tokens entries eligible while performing identity candidates from topic name.
      const tokens = candidate.split(/\s+/).filter(Boolean);
      return tokens.length >= 2 || candidate.length >= 5;
    })
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
}

// This function checks whether a title contains a normalized identity candidate.
function titleContainsCandidate(title, candidate) {
  // Derives the normalized title required while performing title contains candidate.
  const normalizedTitle = ` ${normalizeIdentityText(title)} `;
  // Collects normalized candidate for the selection made while performing title contains candidate.
  const normalizedCandidate = ` ${normalizeIdentityText(candidate)} `;

  return normalizedCandidate.trim() && normalizedTitle.includes(normalizedCandidate);
}

// This function checks whether repeated titles corroborate the same named entity.
function hasRepeatedEntityEvidence({ topicName, titles = [] }) {
  // Collects the usable titles while checking repeated entity evidence.
  const usableTitles = [...new Map(titles
    .map(title => [normalizeIdentityText(title), String(title || '')])
    .filter(([key]) => key)
  ).values()];
  // Rejects the value when usable titles count is below 2.
  if (usableTitles.length < 2) return false;

  // Derives the candidates through identity candidates from topic name while checking repeated entity evidence.
  const candidates = identityCandidatesFromTopicName(topicName);
  // Checks candidate values while checking repeated entity evidence.
  return candidates.some(candidate =>
    usableTitles.filter(title => titleContainsCandidate(title, candidate)).length >= 2
  );
}

// This function decides whether event evidence is strong enough to create a new topic.
export function evaluateTopicCreationGate({
  semanticUnit = null,
  currentEvent = null,
  topicSeedEvents = [],
  seedArticleCount = 0,
  topSeedSimilarity = 0,
  topicName = '',
  currentEventArticleTitles = []
} = {}) {
  // Derives the event required while performing evaluate topic creation gate.
  const event = currentEvent || semanticUnit || {};
  // Derives the article count through as number while performing evaluate topic creation gate.
  const articleCount = asNumber(event.articleCount ?? semanticUnit?.articleCount);
  // Derives the source count through as number while performing evaluate topic creation gate.
  const sourceCount = asNumber(event.sourceCount ?? semanticUnit?.sourceCount);
  // Derives the event strength through as number while performing evaluate topic creation gate.
  const eventStrength = asNumber(event.eventStrength ?? semanticUnit?.eventStrength);
  // Derives the event name required while performing evaluate topic creation gate.
  const eventName = event.name || semanticUnit?.name || semanticUnit?.title || '';
  // Derives the status required while performing evaluate topic creation gate.
  const status = event.status || semanticUnit?.status || null;

  // Derives the has enough event evidence required while performing evaluate topic creation gate.
  const hasEnoughEventEvidence = topicSeedEvents.length >= MIN_EVENTS_FOR_TOPIC_CREATION;
  // Derives the has enough article evidence required while performing evaluate topic creation gate.
  const hasEnoughArticleEvidence = seedArticleCount >= MIN_ARTICLES_FOR_TOPIC_CREATION;
  // Derives the has minimum event size required while performing evaluate topic creation gate.
  const hasMinimumEventSize = articleCount >= 2;

  // Returns early when has minimum event size is available and has enough event evidence is available or has enough article evidence is available.
  if (hasMinimumEventSize && (hasEnoughEventEvidence || hasEnoughArticleEvidence)) {
    return { passed: true, reason: 'seed-evidence' };
  }

  // Returns early when article count reaches min strong event articles and source count reaches min strong event sources and event strength reaches min strong event strength and has meaningful event name succeeds and status is not archived.
  if (
    articleCount >= MIN_STRONG_EVENT_ARTICLES &&
    sourceCount >= MIN_STRONG_EVENT_SOURCES &&
    eventStrength >= MIN_STRONG_EVENT_STRENGTH &&
    hasMeaningfulEventName(eventName) &&
    status !== 'archived'
  ) {
    return { passed: true, reason: 'strong-event' };
  }

  // Returns early when article count is 2 and top seed similarity reaches topic identity threshold and has repeated entity evidence succeeds.
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

// This function collects existing unassigned events that can seed a topic.
export async function collectTopicSeedEvents(userId, eventTopicVector, currentEventId) {
  // Loads the events needed while collecting topic seed events.
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
      'eventWindowEndAt',
      'updatedAt'
    ],
    order: [['updatedAt', 'DESC'], ['id', 'ASC']],
    limit: MAX_CANDIDATES
  });

  // Derives the scored through sort while collecting topic seed events.
  const scored = events
    .map(event => ({
      event,
      similarity: cosineSimilarity(eventTopicVector, event.eventVector)
    }))
    .filter(item => item.similarity >= TOPIC_IDENTITY_THRESHOLD)
    .sort((a, b) => (b.similarity - a.similarity) || (a.event.id - b.event.id));

  // Handles the case where current event id is available and some is unavailable.
  if (currentEventId && !scored.some(item => Number(item.event.id) === Number(currentEventId))) {
    // Finds the by pk while collecting topic seed events.
    const currentEvent = await Event.findByPk(currentEventId, {
      attributes: [
        'id',
        'eventVector',
        'name',
        'articleCount',
        'sourceCount',
        'eventStrength',
        'status',
        'eventWindowEndAt',
        'updatedAt'
      ]
    });

    // Handles the case where event vector is available.
    if (currentEvent?.eventVector) {
      scored.unshift({
        event: currentEvent,
        similarity: cosineSimilarity(eventTopicVector, currentEvent.eventVector)
      });
    }
  }

  return scored;
}

// This function loads a few article titles for repeated-entity gate checks.
export async function collectEventArticleTitles(userId, eventId) {
  // Returns an empty result when event id is unavailable.
  if (!eventId) return [];

  // Loads the articles needed while collecting event article titles.
  const articles = await Article.findAll({
    where: { userId, eventId, ...canonicalArticleWhere() },
    attributes: ['title'],
    order: [['publishedAt', 'ASC'], ['id', 'ASC']],
    limit: 6,
    raw: true
  });

  // Maps source values into the result produced while collecting event article titles.
  return articles.map(article => article.title).filter(Boolean);
}

// This function inserts or replaces a topic in the in-memory topic cache.
export function upsertTopicInCache(topicsCache, topic) {
  // Returns early when topics cache is unavailable.
  if (!topicsCache) return;

  // Finds the index while performing upsert topic in cache.
  const existingIndex = topicsCache.findIndex(item => item.id === topic.id);
  // Handles the case where existing index reaches value.
  if (existingIndex >= 0) {
    topicsCache[existingIndex] = topic;
    return;
  }

  topicsCache.unshift(topic);
}

// This function decides whether a matched topic vector may drift toward new evidence.
export function shouldDriftTopicVector(similarity, assignmentContext) {
  // Rejects the value when topic vector drift enabled is unavailable.
  if (!TOPIC_VECTOR_DRIFT_ENABLED) return false;
  // Rejects the value when assignment context is not incremental.
  if (assignmentContext !== 'incremental') return false;
  // Rejects the value when similarity is not finite.
  if (!Number.isFinite(similarity)) return false;

  return similarity <= TOPIC_VECTOR_DRIFT_MAX_SIMILARITY;
}
