// services/events/assignArticleToEvent.js
// This service assigns one article to an existing event, creates a new event, or leaves it eventless.
// It maintains event-owned topic links while preserving behavioral topic evidence owned by ArticleTopic.
import db from '../../models/index.js';
import { Op } from 'sequelize';
import { assignSemanticUnitToTopic } from '../topics/event/assignEventToTopic.js';
import { canonicalArticleWhere, DUPLICATE_ARTICLE_STATUS } from '../duplicates/articleDuplicates.js';
import { createAndAssignEvent as createEventFromCandidates } from './createEvents.js';
import { syncEventTopicsToArticles } from './eventArticleTopicSync.js';
import {
  normalizeTopicAssignments,
  primaryTopicId
} from '../topics/event/eventTopicAssignment.js';
import { assignArticleToExistingEvent as updateExistingEvent } from './updateEvents.js';
import {
  EVENT_SIM_THRESHOLD,
  MAX_CANDIDATES,
  EVENT_MAX_GAP_HOURS,
  EVENT_RECENCY_HALF_LIFE_HOURS,
  EVENT_MIN_HEADLINE_SIM,
  EVENT_MIN_SHARED_ENTITY_OVERLAP
} from '../config/semanticConfig.js';
import {
  HOUR_MS,
  articleEventTimestamp,
  articleWindowScore,
  eventTimestamp,
  eventWindowScore
} from './articleEventTime.js';

// Provides the shared dependencies used by this service.
const { Article, Event, ArticleTopic, EventTopic } = db;
// Defines the duplicate headline sim enforced by this service.
const DUPLICATE_HEADLINE_SIM = 0.92;
// Defines the duplicate headline min semantic enforced by this service.
const DUPLICATE_HEADLINE_MIN_SEMANTIC = 0.75;
// Defines the min event articles enforced by this service.
const MIN_EVENT_ARTICLES = Number.parseInt(process.env.MIN_EVENT_ARTICLES || '2', 10);
// Defines the min event sources enforced by this service.
const MIN_EVENT_SOURCES = Number.parseInt(process.env.MIN_EVENT_SOURCES || '2', 10);
// Defines the require multi source for event enforced by this service.
const REQUIRE_MULTI_SOURCE_FOR_EVENT = ['1', 'true', 'yes'].includes(
  String(process.env.REQUIRE_MULTI_SOURCE_FOR_EVENT || 'false').toLowerCase()
);
// Defines the event debug enforced by this service.
const EVENT_DEBUG = ['1', 'true', 'yes'].includes(
  String(process.env.EVENT_DEBUG || process.env.EVENT_RECLUSTER_DEBUG || '').toLowerCase()
) || process.env.NODE_ENV === 'development';

// Defines the stopwords enforced by this service.
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for',
  'from', 'has', 'have', 'in', 'is', 'it', 'its', 'of', 'on', 'or',
  'that', 'the', 'their', 'this', 'to', 'was', 'were', 'will', 'with'
]);

// This function normalizes a headline into lowercase searchable tokens.
function normalizeHeadline(title = '') {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// This function builds a meaningful token set while removing small words and stopwords.
function tokenSet(text = '') {
  // Maps source values into the result produced while performing token set.
  return new Set(
    normalizeHeadline(text)
      .split(' ')
      .map(token => token.trim())
      .filter(token => token.length > 2 && !STOPWORDS.has(token))
  );
}

// This function returns a precomputed token set when the candidate cache already has one.
function resolveTokenSet(record = {}) {
  // Selects the result based on whether record is available.
  return record.tokenSet instanceof Set
    ? record.tokenSet
    : tokenSet(record.title || '');
}

// This function estimates lexical overlap between two headlines.
function headlineSimilarity(titleA = '', titleB = '') {
  // Derives the a through token set while performing headline similarity.
  const a = tokenSet(titleA);
  // Derives the b through token set while performing headline similarity.
  const b = tokenSet(titleB);
  return headlineSimilarityFromSets(a, b);
}

// This function estimates lexical overlap between two precomputed headline token sets.
function headlineSimilarityFromSets(a = new Set(), b = new Set()) {
  // Returns early when a size is unavailable or b size is unavailable.
  if (!a.size || !b.size) return 0;

  let intersection = 0;
  // Processes each a entry in turn.
  for (const token of a) {
    // Handles the case where b contains token.
    if (b.has(token)) intersection++;
  }

  // Derives the union required while performing headline similarity from sets.
  const union = a.size + b.size - intersection;
  // Returns early when union is unavailable.
  if (!union) return 0;

  return intersection / union;
}

// This function extracts lightweight entity hints from title and description text.
function extractEntitySet(article = {}) {
  // Derives the text required while extracting entity set.
  const text = `${article.title || ''} ${article.description || ''}`;
  // Collects matches for the selection made while extracting entity set.
  const matches = text.match(/\b([A-Z][a-z]{2,}|[A-Z]{2,})\b/g) || [];
  // Maps source values into the result produced while extracting entity set.
  return new Set(matches.map(value => value.toLowerCase()));
}

// This function counts shared entity hints between two extracted entity sets.
function entityOverlapCount(a = new Set(), b = new Set()) {
  // Returns early when a size is unavailable or b size is unavailable.
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  // Processes each a entry in turn.
  for (const value of a) {
    // Handles the case where b contains value.
    if (b.has(value)) overlap++;
  }
  return overlap;
}

// This function returns a precomputed entity set when the candidate cache already has one.
function resolveEntitySet(record = {}) {
  // Selects the result based on whether record is available.
  return record.entitySet instanceof Set
    ? record.entitySet
    : extractEntitySet(record);
}

// This function gradually discounts older events during candidate matching.
function recencyDecayMultiplier(lastSeenAt) {
  // Derives the now through now while performing recency decay multiplier.
  const now = Date.now();
  // Derives the last seen ts through event timestamp while performing recency decay multiplier.
  const lastSeenTs = eventTimestamp(lastSeenAt);
  // Returns early when last seen ts is not finite.
  if (!Number.isFinite(lastSeenTs)) return 0.2;

  // Derives the age hours through max while performing recency decay multiplier.
  const ageHours = Math.max(0, (now - lastSeenTs) / HOUR_MS);
  // Derives the half life through max while performing recency decay multiplier.
  const halfLife = Math.max(EVENT_RECENCY_HALF_LIFE_HOURS, 1);
  return Math.pow(0.5, ageHours / halfLife);
}

// This function combines semantic, headline, temporal, and entity evidence for article-event matching.
function buildMatchSignal({ article, event, articleEventVector }) {
  // Derives the semantic through cosine similarity while building match signal.
  const semantic = cosineSimilarity(articleEventVector, event.eventVector);
  // Derives the headline through headline similarity while building match signal.
  const headline = headlineSimilarity(article.title, event.name || '');
  // Derives the temporal through event window score while building match signal.
  const temporal = eventWindowScore(article, event);

  // Derives the overlap through entity overlap count while building match signal.
  const overlap = entityOverlapCount(
    extractEntitySet(article),
    extractEntitySet({ title: event.name || '' })
  );

  // Derives the near duplicate required while building match signal.
  const nearDuplicate =
    headline >= DUPLICATE_HEADLINE_SIM &&
    semantic >= DUPLICATE_HEADLINE_MIN_SEMANTIC;

  // Derives the recency decay through recency decay multiplier while building match signal.
  const recencyDecay = recencyDecayMultiplier(event.eventWindowEndAt || event.updatedAt);
  // Selects the composite based on whether overlap reaches event min shared entity overlap.
  const composite =
    (semantic * 0.75 + headline * 0.15 + temporal * 0.1) * recencyDecay +
    (overlap >= EVENT_MIN_SHARED_ENTITY_OVERLAP ? 0.03 : 0);

  return {
    semantic,
    headline,
    temporal,
    overlap,
    nearDuplicate,
    composite
  };
}

// This function compares two embedding vectors with cosine similarity.
function cosineSimilarity(a, b) {
  // Returns early when a is not an array or b is not an array.
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  // Returns early when a is empty or b is empty.
  if (!a.length || !b.length) return 0;
  // Returns early when a count is not b count.
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  // Repeats this processing step while eligible work remains.
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  // Returns early when norm a is unavailable or norm b is unavailable.
  if (!normA || !normB) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// This function compares normalized vectors with a fast dot product.
function dotProductSimilarity(a, b) {
  // Returns early when a is not an array or b is not an array.
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  // Returns early when a is empty or b is empty.
  if (!a.length || !b.length) return 0;
  // Returns early when a count is not b count.
  if (a.length !== b.length) return 0;

  let dot = 0;
  // Repeats this processing step while eligible work remains.
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }

  return dot;
}

// This function normalizes the incoming vector once when a cache lookup can reuse it.
function normalizeVector(vector) {
  // Returns no result when vector is not an array or vector is empty.
  if (!Array.isArray(vector) || !vector.length) return null;

  let norm = 0;
  // Processes each vector entry in turn.
  for (const value of vector) {
    norm += value * value;
  }

  // Returns no result when norm is unavailable.
  if (!norm) return null;

  // Derives the divisor through sqrt while normalizing vector.
  const divisor = Math.sqrt(norm);
  // Maps source values into the result produced while normalizing vector.
  return vector.map(value => value / divisor);
}

// This function writes debug output only when event debug logging is enabled.
function debugEventLog(message, payload = null) {
  // Returns early when event debug is unavailable.
  if (!EVENT_DEBUG) return;

  // Handles the case where payload is value.
  if (payload == null) {
    console.log(`[EVENT DEBUG] ${message}`);
    return;
  }

  console.log(`[EVENT DEBUG] ${message}`, payload);
}

// This function writes one concise event processing line in development/debug mode.
function conciseEventLog(message) {
  // Returns early when event debug is unavailable.
  if (!EVENT_DEBUG) return;
  console.log(`[EVENT] ${message}`);
}

// This function formats numeric debug values for concise event logs.
function formatEventMetric(value, digits = 3) {
  // Coerces the numeric into the representation required while performing format event metric.
  const numeric = Number(value);
  // Selects the result based on whether numeric is finite.
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : 'n/a';
}

// This function computes average semantic similarity across accepted candidate signals.
function averageAcceptedSemantic(signals = []) {
  // Keeps the accepted signals entries eligible while performing average accepted semantic.
  const acceptedSignals = signals.filter(signal => signal.accepted);
  // Returns early when accepted signals is empty.
  if (!acceptedSignals.length) return 0;

  // Aggregates source values into the total used while performing average accepted semantic.
  const total = acceptedSignals.reduce((sum, signal) => sum + Number(signal.semantic || 0), 0);
  return total / acceptedSignals.length;
}

// This function finds the strongest accepted signal for concise candidate-event logging.
function strongestAcceptedCandidateSignal(signals = [], eventId = null) {
  // Filters source values to the entries eligible while performing strongest accepted candidate signal.
  return signals
    .filter(signal => signal.accepted)
    .filter(signal => eventId == null || Number(signal.eventId) === Number(eventId))
    .sort((left, right) => Number(right.semantic || 0) - Number(left.semantic || 0))[0] || null;
}

// This function loads topic assignments already stored for an event.
async function loadEventTopicAssignments(eventId) {
  // Loads the rows needed while loading event topic assignments.
  const rows = await EventTopic.findAll({
    where: { eventId },
    order: [['rank', 'ASC'], ['confidence', 'DESC']],
    raw: true
  });

  return normalizeTopicAssignments(rows);
}

// This function replaces EventTopic rows and optionally persists the denormalized primary topic.
async function persistEventTopicAssignments(event, topicAssignments, options = {}) {
  const { transaction = null, updateEvent = true } = options;
  // Normalizes the assignments before performing persist event topic assignments.
  const normalizedAssignments = normalizeTopicAssignments(topicAssignments);
  // Derives the primary id through primary topic id while performing persist event topic assignments.
  const primaryId = primaryTopicId(normalizedAssignments);

  await EventTopic.destroy({
    where: { eventId: event.id },
    transaction
  });

  // Handles the case where normalized assignments is non-empty.
  if (normalizedAssignments.length) {
    // Maps source values into the result produced while performing persist event topic assignments.
    await EventTopic.bulkCreate(
      normalizedAssignments.map(assignment => ({
        eventId: event.id,
        topicId: assignment.topicId,
        confidence: assignment.confidence,
        rank: assignment.rank,
        primaryInd: assignment.primaryInd
      })),
      { transaction }
    );
  }

  // Handles the case where update event is available.
  if (updateEvent) {
    await event.update({ topicId: primaryId }, { transaction });
    event.topicId = primaryId;
  }

  return normalizedAssignments;
}

// This function derives event topic assignments from an event vector and the event topic cache.
async function deriveEventTopicAssignments({
  event,
  eventTopicVector,
  topicsCache,
  assignmentContext
}) {
  // Returns an empty result when event topic vector is not an array or event topic vector is empty.
  if (!Array.isArray(eventTopicVector) || !eventTopicVector.length) return [];

  return assignSemanticUnitToTopic({
    semanticUnit: {
      id: event.id,
      userId: event.userId,
      title: event.name || `Event ${event.id}`,
      name: event.name,
      articleCount: event.articleCount,
      sourceCount: event.sourceCount,
      eventStrength: event.eventStrength,
      status: event.status,
      publishedAt: event.eventWindowEndAt || event.updatedAt || new Date()
    },
    semanticVector: eventTopicVector,
    topicsCache,
    assignmentContext
  });
}

// This cache keeps a bounded set of candidate events in memory during one assignment pass.
export class EventCache {
  // Performs the constructor operation.
  constructor(events = []) {
    this._events = events;
  }

  // This function loads the newest candidate events for a user.
  static async forUser(userId, options = {}) {
    // Builds the where assembled while performing for user.
    const where = { userId };
    // Coerces the window hours into the representation required while performing for user.
    const windowHours = Number(options.windowHours || 0);

    // Handles the case where window hours exceeds value.
    if (windowHours > 0) {
      where.eventWindowEndAt = {
        [Op.gte]: new Date(Date.now() - windowHours * HOUR_MS)
      };
      where.status = { [Op.ne]: 'archived' };
    }

    // Loads the events needed while performing for user.
    const events = await Event.findAll({
      where,
      order: [['eventWindowEndAt', 'DESC'], ['updatedAt', 'DESC']],
      limit: MAX_CANDIDATES
    });

    return new EventCache(events);
  }

  // This function loads candidate events that overlap an article's event-time window.
  static async forArticle(article) {
    // Derives the article ts required while performing for article.
    const articleTs = articleEventTimestamp(article) ?? Date.now();
    // Normalizes the cutoff used while performing for article.
    const cutoff = new Date(articleTs - EVENT_MAX_GAP_HOURS * HOUR_MS);
    // Normalizes the upper bound used while performing for article.
    const upperBound = new Date(articleTs + EVENT_MAX_GAP_HOURS * HOUR_MS);

    // Loads the events needed while performing for article.
    const events = await Event.findAll({
      where: {
        userId: article.userId,
        eventWindowStartAt: { [Op.lte]: upperBound },
        eventWindowEndAt: { [Op.gte]: cutoff }
      },
      order: [['eventWindowEndAt', 'DESC']],
      limit: MAX_CANDIDATES
    });

    return new EventCache(events);
  }

  // This getter exposes the current in-memory event list.
  get events() {
    return this._events;
  }

  // This function adds a newly-created event to the front of the cache.
  add(event) {
    this._events.unshift(event);

    // Handles the case where value  events count exceeds max candidates.
    if (this._events.length > MAX_CANDIDATES) {
      this._events.pop();
    }
  }

  // This function patches cached event fields after assignment updates.
  updateInMemory(eventId, updates) {
    // Loads the event needed while updating in memory.
    const event = this._events.find(e => e.id === eventId);
    // Handles the case where event is available.
    if (event) {
      Object.assign(event, updates);
      Object.assign(event.dataValues, updates);
    }
  }
}

// This function creates a new event from corroborating candidate articles and syncs event topics.
async function createAndAssignEvent({
  candidateArticles,
  article,
  cache,
  topicsCache,
  assignmentContext,
  skipTopicAssignment
}) {
  return createEventFromCandidates({
    candidateArticles,
    article,
    cache,
    skipTopicAssignment,
    assignTopicsForEvent: async ({ event, eventTopicVector, transaction }) => {
      // Derives the event topic assignments through derive event topic assignments while creating and assign event.
      const eventTopicAssignments = await deriveEventTopicAssignments({
        event,
        eventTopicVector,
        topicsCache,
        assignmentContext
      });

      // Derives the persisted event topics through persist event topic assignments while creating and assign event.
      const persistedEventTopics = await persistEventTopicAssignments(
        event,
        eventTopicAssignments,
        { transaction }
      );
      await syncEventTopicsToArticles(event.id, persistedEventTopics, transaction);

      return primaryTopicId(persistedEventTopics);
    }
  });
}

// This function removes event ownership from an article without deleting behavioral topic evidence.
async function assignTopicOnly({ article }) {
  // Selects the event owned topic id based on whether article topic id is available.
  const eventOwnedTopicId = article.topicId
    ? await db.Topic.findOne({
      where: {
        id: article.topicId,
        topicType: { [Op.in]: ['event', 'hybrid'] }
      },
      attributes: ['id']
    })
    : null;

  await ArticleTopic.destroy({
    where: {
      articleId: article.id,
      topicId: {
        [Op.in]: db.Sequelize.literal(
          `(SELECT id FROM topics WHERE topicType IN ('event', 'hybrid'))`
        )
      }
    }
  });

  // Selects the next topic id based on whether event owned topic id is available.
  const nextTopicId = eventOwnedTopicId ? null : article.topicId;

  await article.update({
    eventId: null,
    topicId: nextTopicId
  });

  article.eventId = null;
  article.topicId = nextTopicId;
}

// This function resolves the best available vector from an article or run-context record.
function resolveArticleVector(record) {
  // Returns early when event vector is an array.
  if (Array.isArray(record?.eventVector)) return record.eventVector;
  // Returns early when article vector is an array.
  if (Array.isArray(record?.articleVector)) return record.articleVector;
  return null;
}

// This function scores whether a candidate article can corroborate a new event.
function evaluateCandidateSignal({ article, candidate, articleEventVector, normalizedArticleEventVector = null }) {
  // Resolves the article vector while performing evaluate candidate signal.
  const candidateVector = resolveArticleVector(candidate);
  // Collects normalized candidate vector for the selection made while performing evaluate candidate signal.
  const normalizedCandidateVector = candidate.normalizedEventVector || null;

  // Returns early when candidate vector is not an array and normalized candidate vector is not an array.
  if (!Array.isArray(candidateVector) && !Array.isArray(normalizedCandidateVector)) {
    return {
      candidateId: candidate.id,
      semantic: 0,
      temporal: 0,
      headline: 0,
      overlap: 0,
      meetsSemantic: false,
      meetsTemporal: false,
      meetsAuxiliary: false,
      eventId: candidate.eventId ?? null,
      accepted: false
    };
  }

  // Selects the semantic based on whether normalized article event vector is available and normalized candidate vector is available.
  const semantic = normalizedArticleEventVector && normalizedCandidateVector
    ? dotProductSimilarity(normalizedArticleEventVector, normalizedCandidateVector)
    : cosineSimilarity(articleEventVector, candidateVector);
  // Derives the meets semantic required while performing evaluate candidate signal.
  const meetsSemantic = semantic >= EVENT_SIM_THRESHOLD;

  // Derives the temporal through article window score while performing evaluate candidate signal.
  const temporal = articleWindowScore(article, candidate);
  // Derives the meets temporal required while performing evaluate candidate signal.
  const meetsTemporal = temporal > 0;

  // Resolves the token set while performing evaluate candidate signal.
  const articleTokens = resolveTokenSet(article);
  // Resolves the token set while performing evaluate candidate signal.
  const candidateTokens = resolveTokenSet(candidate);
  // Derives the headline through headline similarity from sets while performing evaluate candidate signal.
  const headline = headlineSimilarityFromSets(articleTokens, candidateTokens);
  // Derives the overlap through entity overlap count while performing evaluate candidate signal.
  const overlap = entityOverlapCount(
    resolveEntitySet(article),
    resolveEntitySet(candidate)
  );

  // Derives the meets auxiliary required while performing evaluate candidate signal.
  const meetsAuxiliary = (
    headline >= EVENT_MIN_HEADLINE_SIM ||
    overlap >= EVENT_MIN_SHARED_ENTITY_OVERLAP ||
    semantic >= Math.max(EVENT_SIM_THRESHOLD, DUPLICATE_HEADLINE_SIM)
  );
  // Derives the near duplicate required while performing evaluate candidate signal.
  const nearDuplicate =
    headline >= DUPLICATE_HEADLINE_SIM &&
    semantic >= DUPLICATE_HEADLINE_MIN_SEMANTIC;

  // Derives the accepted required while performing evaluate candidate signal.
  const accepted = meetsTemporal && (
    (meetsSemantic && meetsAuxiliary) ||
    nearDuplicate
  );

  return {
    candidateId: candidate.id,
    semantic,
    temporal,
    headline,
    overlap,
    meetsSemantic,
    meetsTemporal,
    meetsAuxiliary,
    nearDuplicate,
    eventId: candidate.eventId ?? null,
    accepted
  };
}

// This function chooses the strongest existing event represented by accepted candidate articles.
function resolveBestCandidateEvent(candidateSignals, acceptedCandidates) {
  // Derives the accepted by id required while resolving best candidate event.
  const acceptedById = new Map(
    acceptedCandidates.map(candidate => [candidate.id, candidate])
  );
  // Derives the event groups required while resolving best candidate event.
  const eventGroups = new Map();

  // Processes each candidate signals entry in turn.
  for (const signal of candidateSignals) {
    // Skips the current entry when signal accepted is unavailable.
    if (!signal.accepted) continue;

    // Derives the candidate through get while resolving best candidate event.
    const candidate = acceptedById.get(signal.candidateId);
    const eventId = candidate?.eventId;

    // Skips the current entry when event id is value.
    if (eventId == null) continue;

    // Coerces the key into the representation required while resolving best candidate event.
    const key = Number(eventId);
    // Derives the group required while resolving best candidate event.
    const group = eventGroups.get(key) || {
      eventId: key,
      acceptedCandidateCount: 0,
      semanticTotal: 0,
      maxSemantic: 0
    };

    group.acceptedCandidateCount++;
    group.semanticTotal += signal.semantic;
    group.maxSemantic = Math.max(group.maxSemantic, signal.semantic);
    eventGroups.set(key, group);
  }

  // Derives the candidates through sort while resolving best candidate event.
  const candidates = [...eventGroups.values()]
    .map(group => ({
      ...group,
      averageSemantic: group.semanticTotal / group.acceptedCandidateCount
    }))
    .sort((left, right) => (
      right.acceptedCandidateCount - left.acceptedCandidateCount ||
      right.averageSemantic - left.averageSemantic ||
      right.maxSemantic - left.maxSemantic ||
      left.eventId - right.eventId
    ));

  return candidates[0] || null;
}

// This function loads a candidate-backed event and makes sure the cache can see later updates.
async function loadCandidateEvent({ userId, eventId, cache }) {
  // Returns no result when event id is unavailable.
  if (!eventId) return null;

  // Derives the cached event required while loading candidate event.
  const cachedEvent = cache?.events?.find(event => Number(event.id) === Number(eventId));
  // Returns early when cached event is available.
  if (cachedEvent) return cachedEvent;

  // Loads the event needed while loading candidate event.
  const event = await Event.findOne({
    where: {
      id: eventId,
      userId
    }
  });

  // Handles the case where event is available and cache is available.
  if (event && cache) {
    cache.add(event);
  }

  return event;
}

// This function finds persisted recent articles that can corroborate the current article.
async function findCandidateArticles({ article, articleEventVector }) {
  // Derives the article ts required while finding candidate articles.
  const articleTs = articleEventTimestamp(article) ?? Date.now();
  // Normalizes the cutoff used while finding candidate articles.
  const cutoff = new Date(articleTs - EVENT_MAX_GAP_HOURS * HOUR_MS);
  // Normalizes the upper bound used while finding candidate articles.
  const upperBound = new Date(articleTs + EVENT_MAX_GAP_HOURS * HOUR_MS);

  // Loads the candidates needed while finding candidate articles.
  const candidates = await Article.findAll({
    where: {
      userId: article.userId,
      id: { [Op.ne]: article.id },
      ...canonicalArticleWhere(),
      publishedAt: {
        [Op.gte]: cutoff,
        [Op.lte]: upperBound
      }
    },
    attributes: ['id', 'feedId', 'eventId', 'title', 'description', 'publishedAt', 'createdAt', 'articleVector'],
    order: [['publishedAt', 'DESC']],
    limit: MAX_CANDIDATES
  });

  // Transforms source values into the evaluated signals required while finding candidate articles.
  const evaluatedSignals = candidates.map(candidate => evaluateCandidateSignal({
    article,
    candidate,
    articleEventVector
  }));

  // Tracks distinct accepted id while finding candidate articles.
  const acceptedIds = new Set(
    evaluatedSignals
      .filter(signal => signal.accepted)
      .map(signal => signal.candidateId)
  );

  // Keeps the accepted candidates entries eligible while finding candidate articles.
  const acceptedCandidates = candidates.filter(candidate => acceptedIds.has(candidate.id));

  return {
    acceptedCandidates,
    evaluatedSignals
  };
}

// This function finds corroborating candidates from the rolling in-memory article cache.
function findCandidateArticlesFromCache({
  article,
  articleEventVector,
  normalizedArticleEventVector,
  articleCandidateCache
}) {
  // Finds the nearby while finding candidate articles from cache.
  const candidates = articleCandidateCache.findNearby(article);
  // Transforms source values into the evaluated signals required while finding candidate articles from cache.
  const evaluatedSignals = candidates.map(candidate => evaluateCandidateSignal({
    article,
    candidate,
    articleEventVector,
    normalizedArticleEventVector
  }));

  // Tracks distinct accepted id while finding candidate articles from cache.
  const acceptedIds = new Set(
    evaluatedSignals
      .filter(signal => signal.accepted)
      .map(signal => signal.candidateId)
  );

  // Keeps the accepted candidates entries eligible while finding candidate articles from cache.
  const acceptedCandidates = candidates.filter(candidate => acceptedIds.has(candidate.id));

  return {
    acceptedCandidates,
    evaluatedSignals
  };
}

// This function inserts or updates one article record in the current run context.
function upsertRunContextRecord(runContext, record) {
  // Returns early when run context is unavailable.
  if (!runContext) return;

  runContext.records ??= [];
  runContext.indexById ??= new Map();

  // Derives the existing index through get while performing upsert run context record.
  const existingIndex = runContext.indexById.get(record.id);
  // Handles the case where existing index is value.
  if (existingIndex == null) {
    runContext.records.push({ ...record });
    runContext.indexById.set(record.id, runContext.records.length - 1);
    return;
  }

  runContext.records[existingIndex] = {
    ...runContext.records[existingIndex],
    ...record
  };
}

// This function increments one numeric counter on the current run context.
function incrementRunStat(runContext, key, amount = 1) {
  // Returns early when run context is unavailable.
  if (!runContext) return;

  runContext.stats ??= {};
  runContext.stats[key] = Number(runContext.stats[key] || 0) + amount;
}

// This function tracks whether an event was created during the current assignment run.
function isRunCreatedEvent(runContext, eventId) {
  // Rejects the value when new event id is unavailable or event id is value.
  if (!runContext?.newEventIds || eventId == null) return false;

  return runContext.newEventIds.has(Number(eventId));
}

// This function counts assignments only when the target event existed before the current run.
function incrementExistingEventAssignment(runContext, eventId) {
  // Returns early when run context is run created event.
  if (isRunCreatedEvent(runContext, eventId)) return;

  incrementRunStat(runContext, 'linkedToExistingEventCount');
}

// This function records an event created during the current assignment run.
function recordNewEvent(runContext, eventId) {
  // Returns early when run context is unavailable or event id is value.
  if (!runContext || eventId == null) return;

  runContext.newEventIds ??= new Set();
  runContext.newEventIds.add(Number(eventId));
}

// This function finds corroborating candidates from articles already seen in the current run.
function findCandidateArticlesFromContext({ article, articleEventVector, runContext }) {
  // Derives the article ts required while finding candidate articles from context.
  const articleTs = articleEventTimestamp(article) ?? Date.now();
  // Derives the max gap ms required while finding candidate articles from context.
  const maxGapMs = EVENT_MAX_GAP_HOURS * HOUR_MS;

  // Keeps the candidate pool entries eligible while finding candidate articles from context.
  const candidatePool = (runContext?.records || []).filter(candidate => {
    // Rejects the value when candidate id is article id.
    if (candidate.id === article.id) return false;
    // Rejects the value when resolve article vector is not an array.
    if (!Array.isArray(resolveArticleVector(candidate))) return false;

    // Derives the candidate ts through article event timestamp while finding candidate articles from context.
    const candidateTs = articleEventTimestamp(candidate);
    // Rejects the value when candidate ts is not finite.
    if (!Number.isFinite(candidateTs)) return false;

    return Math.abs(articleTs - candidateTs) <= maxGapMs;
  });

  // Transforms source values into the evaluated signals required while finding candidate articles from context.
  const evaluatedSignals = candidatePool.map(candidate => evaluateCandidateSignal({
    article,
    candidate,
    articleEventVector,
    normalizedArticleEventVector: runContext?.normalizedArticleEventVector || null
  }));

  // Tracks distinct accepted id while finding candidate articles from context.
  const acceptedIds = new Set(
    evaluatedSignals
      .filter(signal => signal.accepted)
      .map(signal => signal.candidateId)
  );

  // Keeps the accepted candidates entries eligible while finding candidate articles from context.
  const acceptedCandidates = candidatePool.filter(candidate => acceptedIds.has(candidate.id));

  return {
    acceptedCandidates,
    evaluatedSignals
  };
}

// This function assigns one article to an event, creates a new event, or leaves it eventless.
// It also keeps event-topic denormalization in sync unless topic assignment is explicitly skipped.
export async function assignArticleToEvent(articleIdOrObj, cache = null, vectors = null, topicsCache = null, runContext = null, options = {}) {
  // Derives the assignment context required while assigning article to event.
  const assignmentContext = options.assignmentContext || 'incremental';
  // Coerces the skip topic assignment into the representation required while assigning article to event.
  const skipTopicAssignment = Boolean(options.skipTopicAssignment);
  // Collects article candidate cache for the selection made while assigning article to event.
  const articleCandidateCache = options.articleCandidateCache || null;

  // Selects the article based on whether article id or obj is object.
  const article = typeof articleIdOrObj === 'object'
    ? articleIdOrObj
    : await Article.findByPk(articleIdOrObj);

  // Returns no result when article is unavailable.
  if (!article) return null;
  // Returns no result when article status is duplicate article status or article duplicate of article id is not value.
  if (article.status === DUPLICATE_ARTICLE_STATUS || article.duplicateOfArticleId != null) return null;

  // Derives the article event vector required while assigning article to event.
  const articleEventVector = vectors?.eventVector ?? resolveArticleVector(article);
  // Normalizes the article event vector before assigning article to event.
  const normalizedArticleEventVector = normalizeVector(articleEventVector);

  article.tokenSet ??= tokenSet(article.title || '');
  article.entitySet ??= extractEntitySet(article);

  // Handles the case where article event vector is unavailable.
  if (!articleEventVector) {
    await assignTopicOnly({ article });
    incrementRunStat(runContext, 'topicOnlyNoVectorCount');

    upsertRunContextRecord(runContext, {
      id: article.id,
      feedId: article.feedId,
      title: article.title,
      description: article.description,
      publishedAt: article.publishedAt,
      createdAt: article.createdAt,
      topicId: null,
      topicAssignments: [],
      eventId: null,
      eventVector: null
    });

    return null;
  }

  // Selects the events based on whether cache is available.
  const events = cache
    ? cache.events
    : await Event.findAll({
      where: { userId: article.userId },
      order: [['updatedAt', 'DESC']],
      limit: MAX_CANDIDATES
    });

  let bestEvent = null;
  let bestScore = 0;
  let bestSignal = null;
  // Collects the match diagnostics while assigning article to event.
  const matchDiagnostics = [];

  // Processes each events entry in turn.
  for (const event of events) {
    // Skips the current entry when event event vector is unavailable.
    if (!event.eventVector) continue;

    // Builds the match signal while assigning article to event.
    const signal = buildMatchSignal({
      article,
      event,
      articleEventVector
    });

    // Derives the satisfies strict semantic required while assigning article to event.
    const satisfiesStrictSemantic = signal.semantic >= EVENT_SIM_THRESHOLD;
    const satisfiesNearDuplicate = signal.nearDuplicate;
    // Derives the satisfies auxiliary signal required while assigning article to event.
    const satisfiesAuxiliarySignal =
      signal.temporal > 0 &&
      (
        signal.headline >= EVENT_MIN_HEADLINE_SIM ||
        signal.overlap >= EVENT_MIN_SHARED_ENTITY_OVERLAP ||
        signal.nearDuplicate
      );

    // Handles the case where satisfies strict semantic is unavailable and satisfies near duplicate is unavailable or satisfies auxiliary signal is unavailable.
    if ((!satisfiesStrictSemantic && !satisfiesNearDuplicate) || !satisfiesAuxiliarySignal) {
      // Handles the case where event debug is available.
      if (EVENT_DEBUG) {
        matchDiagnostics.push({
          eventId: event.id,
          semantic: Number(signal.semantic.toFixed(4)),
          headline: Number(signal.headline.toFixed(4)),
          temporal: Number(signal.temporal.toFixed(4)),
          overlap: signal.overlap,
          meetsSemantic: satisfiesStrictSemantic,
          nearDuplicate: satisfiesNearDuplicate,
          meetsAuxiliary: satisfiesAuxiliarySignal,
          accepted: false
        });
      }
      continue;
    }

    // Handles the case where event debug is available.
    if (EVENT_DEBUG) {
      matchDiagnostics.push({
        eventId: event.id,
        semantic: Number(signal.semantic.toFixed(4)),
        headline: Number(signal.headline.toFixed(4)),
        temporal: Number(signal.temporal.toFixed(4)),
        overlap: signal.overlap,
        composite: Number(signal.composite.toFixed(4)),
        meetsSemantic: satisfiesStrictSemantic,
        nearDuplicate: satisfiesNearDuplicate,
        meetsAuxiliary: true,
        accepted: true
      });
    }

    // Handles the case where signal composite exceeds best score.
    if (signal.composite > bestScore) {
      bestScore = signal.composite;
      bestEvent = event;
      bestSignal = signal;
    }
  }

  // Handles the case where event debug is available.
  if (EVENT_DEBUG) {
    // Orders values deterministically while assigning article to event.
    debugEventLog(`article=${article.id} existing-event-eval`, {
      title: (article.title || '').slice(0, 90),
      thresholds: {
        eventSimilarity: EVENT_SIM_THRESHOLD,
        minHeadline: EVENT_MIN_HEADLINE_SIM,
        minEntityOverlap: EVENT_MIN_SHARED_ENTITY_OVERLAP
      },
      topMatches: matchDiagnostics
        .sort((a, b) => (b.composite || b.semantic) - (a.composite || a.semantic))
        .slice(0, 5)
    });
  }

  // Handles the case where best event is available and best signal is available.
  if (bestEvent && bestSignal) {
    // Derives the updated event id through update existing event while assigning article to event.
    const updatedEventId = await updateExistingEvent({
      article,
      articleEventVector,
      bestEvent,
      cache,
      bestScore,
      matchSignal: bestSignal,
      skipTopicAssignment,
      assignTopicsForEvent: async ({ event, eventTopicVector, transaction }) => {
        // Derives the event topic assignments through derive event topic assignments while assigning article to event.
        const eventTopicAssignments = await deriveEventTopicAssignments({
          event,
          eventTopicVector,
          topicsCache,
          assignmentContext
        });

        // Derives the persisted event topics through persist event topic assignments while assigning article to event.
        const persistedEventTopics = await persistEventTopicAssignments(
          event,
          eventTopicAssignments,
          { transaction, updateEvent: false }
        );
        await syncEventTopicsToArticles(event.id, persistedEventTopics, transaction);

        return primaryTopicId(persistedEventTopics);
      }
    });

    // Returns no result when updated event id is unavailable.
    if (!updatedEventId) return null;

    // Selects the event topic assignments based on whether skip topic assignment is available.
    const eventTopicAssignments = skipTopicAssignment
      ? []
      : await loadEventTopicAssignments(updatedEventId);

    upsertRunContextRecord(runContext, {
      id: article.id,
      feedId: article.feedId,
      title: article.title,
      description: article.description,
      publishedAt: article.publishedAt,
      createdAt: article.createdAt,
      topicId: primaryTopicId(eventTopicAssignments),
      topicAssignments: eventTopicAssignments,
      eventId: updatedEventId,
      eventVector: articleEventVector
    });

    incrementExistingEventAssignment(runContext, updatedEventId);
    articleCandidateCache?.updateEventId?.([article.id], updatedEventId);
    conciseEventLog(
      `article=${article.id} → event=${updatedEventId} ` +
      `sim=${formatEventMetric(bestSignal.semantic)} ` +
      `head=${formatEventMetric(bestSignal.headline, 2)} ` +
      `temp=${formatEventMetric(bestSignal.temporal, 2)} ` +
      `overlap=${bestSignal.overlap ?? 0} decision=existing-event`
    );

    return updatedEventId;
  }

  await assignTopicOnly({ article });

  // Selects the candidate result based on whether article candidate cache is available.
  const candidateResult = articleCandidateCache
    ? findCandidateArticlesFromCache({
      article,
      articleEventVector,
      normalizedArticleEventVector,
      articleCandidateCache
    })
    : runContext
    ? findCandidateArticlesFromContext({
      article,
      articleEventVector,
      runContext
    })
    : await findCandidateArticles({
      article,
      articleEventVector
    });
  const candidateArticles = candidateResult.acceptedCandidates;
  // Keeps the assigned candidates entries eligible while assigning article to event.
  const assignedCandidates = candidateArticles.filter(candidate => candidate.eventId != null);
  // Keeps the unassigned candidates entries eligible while assigning article to event.
  const unassignedCandidates = candidateArticles.filter(candidate => candidate.eventId == null);
  // Resolves the best candidate event while assigning article to event.
  const selectedCandidateEvent = resolveBestCandidateEvent(
    candidateResult.evaluatedSignals,
    assignedCandidates
  );
  // Collects selected candidate event id for the selection made while assigning article to event.
  const selectedCandidateEventId = selectedCandidateEvent?.eventId ?? null;
  // Collects the candidate event id while assigning article to event.
  const candidateEventIds = [
    ...new Set(assignedCandidates.map(candidate => Number(candidate.eventId)).filter(Boolean))
  ];
  // Tracks corroborated article count for the processing summary.
  const corroboratedArticleCount = unassignedCandidates.length + 1;
  // Maps source values into the result produced while assigning article to event.
  const corroboratedSourceCount = new Set([
    article.feedId,
    ...unassignedCandidates.map(candidate => candidate.feedId)
  ].filter(feedId => feedId != null)).size;

  // Handles the case where event debug is available.
  if (EVENT_DEBUG) {
    // Orders values deterministically while assigning article to event.
    debugEventLog(`article=${article.id} candidate-eval`, {
      topicId: null,
      totalCandidatePool: candidateResult.evaluatedSignals.length,
      acceptedCandidates: candidateArticles.length,
      assignedCandidateCount: assignedCandidates.length,
      unassignedCandidateCount: unassignedCandidates.length,
      candidateEventIds,
      selectedCandidateEventId,
      corroboratedArticleCount,
      corroboratedSourceCount,
      required: {
        minArticles: MIN_EVENT_ARTICLES,
        minSources: MIN_EVENT_SOURCES,
        requireMultiSource: REQUIRE_MULTI_SOURCE_FOR_EVENT
      },
      topCandidates: candidateResult.evaluatedSignals
        .sort((a, b) => b.semantic - a.semantic)
        .slice(0, 8)
        .map(signal => ({
          candidateId: signal.candidateId,
          eventId: signal.eventId,
          semantic: Number(signal.semantic.toFixed(4)),
          temporal: Number(signal.temporal.toFixed(4)),
          headline: Number(signal.headline.toFixed(4)),
          overlap: signal.overlap,
          nearDuplicate: signal.nearDuplicate,
          accepted: signal.accepted,
          meetsSemantic: signal.meetsSemantic,
          meetsTemporal: signal.meetsTemporal,
          meetsAuxiliary: signal.meetsAuxiliary
        }))
    });
  }

  // Handles the case where selected candidate event id is available.
  if (selectedCandidateEventId) {
    // Loads the candidate event while assigning article to event.
    const candidateEvent = await loadCandidateEvent({
      userId: article.userId,
      eventId: selectedCandidateEventId,
      cache
    });

    // Handles the case where candidate event is available.
    if (candidateEvent) {
      // Derives the updated event id through update existing event while assigning article to event.
      const updatedEventId = await updateExistingEvent({
        article,
        articleEventVector,
        bestEvent: candidateEvent,
        cache,
        bestScore: selectedCandidateEvent.averageSemantic,
        matchSignal: {
          semantic: selectedCandidateEvent.averageSemantic,
          maxSemantic: selectedCandidateEvent.maxSemantic,
          acceptedCandidateCount: selectedCandidateEvent.acceptedCandidateCount
        },
        skipTopicAssignment,
        assignTopicsForEvent: async ({ event, eventTopicVector, transaction }) => {
          // Derives the event topic assignments through derive event topic assignments while assigning article to event.
          const eventTopicAssignments = await deriveEventTopicAssignments({
            event,
            eventTopicVector,
            topicsCache,
            assignmentContext
          });

          // Derives the persisted event topics through persist event topic assignments while assigning article to event.
          const persistedEventTopics = await persistEventTopicAssignments(
            event,
            eventTopicAssignments,
            { transaction, updateEvent: false }
          );
          await syncEventTopicsToArticles(event.id, persistedEventTopics, transaction);

          return primaryTopicId(persistedEventTopics);
        }
      });

      // Returns no result when updated event id is unavailable.
      if (!updatedEventId) return null;

      // Selects the event topic assignments based on whether skip topic assignment is available.
      const eventTopicAssignments = skipTopicAssignment
        ? []
        : await loadEventTopicAssignments(updatedEventId);

      upsertRunContextRecord(runContext, {
        id: article.id,
        feedId: article.feedId,
        title: article.title,
        description: article.description,
        publishedAt: article.publishedAt,
        createdAt: article.createdAt,
        topicId: primaryTopicId(eventTopicAssignments),
        topicAssignments: eventTopicAssignments,
        eventId: updatedEventId,
        eventVector: articleEventVector
      });

      incrementExistingEventAssignment(runContext, updatedEventId);
      articleCandidateCache?.updateEventId?.([article.id], updatedEventId);
      // Derives the selected candidate signal through strongest accepted candidate signal while assigning article to event.
      const selectedCandidateSignal = strongestAcceptedCandidateSignal(
        candidateResult.evaluatedSignals,
        updatedEventId
      );
      conciseEventLog(
        `article=${article.id} → event=${updatedEventId} ` +
        `sim=${formatEventMetric(selectedCandidateEvent.averageSemantic)} ` +
        `head=${formatEventMetric(selectedCandidateSignal?.headline, 2)} ` +
        `temp=${formatEventMetric(selectedCandidateSignal?.temporal, 2)} ` +
        `overlap=${selectedCandidateSignal?.overlap ?? 0} decision=existing-event`
      );

      // Handles the case where event debug is available.
      if (EVENT_DEBUG) {
        debugEventLog(`article=${article.id} candidate-event-selected`, {
          selectedCandidateEventId,
          assignedCandidateCount: assignedCandidates.length,
          unassignedCandidateCount: unassignedCandidates.length,
          candidateEventIds,
          selectedCandidateEvent
        });
      }

      return updatedEventId;
    }
  }

  // Handles the case where corroborated article count is below min event articles or require multi source for event is available and corroborated source count is below min event sources.
  if (
    corroboratedArticleCount < MIN_EVENT_ARTICLES ||
    (REQUIRE_MULTI_SOURCE_FOR_EVENT && corroboratedSourceCount < MIN_EVENT_SOURCES)
  ) {
    await assignTopicOnly({ article });
    incrementRunStat(runContext, 'topicOnlyInsufficientCandidatesCount');

    upsertRunContextRecord(runContext, {
      id: article.id,
      feedId: article.feedId,
      title: article.title,
      description: article.description,
      publishedAt: article.publishedAt,
      createdAt: article.createdAt,
      topicId: null,
      topicAssignments: [],
      eventId: null,
      eventVector: articleEventVector
    });
    articleCandidateCache?.updateEventId?.([article.id], null);

    return null;
  }

  // Creates the and assign event while assigning article to event.
  const newEventId = await createAndAssignEvent({
    candidateArticles: unassignedCandidates,
    article,
    cache,
    topicsCache,
    assignmentContext,
    skipTopicAssignment
  });

  // Handles the case where new event id is available.
  if (newEventId) {
    incrementRunStat(runContext, 'newEventsCreatedCount');
    recordNewEvent(runContext, newEventId);
    // Derives the avg sim through average accepted semantic while assigning article to event.
    const avgSim = averageAcceptedSemantic(candidateResult.evaluatedSignals);
    conciseEventLog(
      `new-event=${newEventId} article=${article.id} ` +
      `corroborated=${corroboratedArticleCount} ` +
      `avgSim=${formatEventMetric(avgSim)} ` +
      `sources=${corroboratedSourceCount} decision=new-event`
    );
  }

  // Selects the event topic assignments based on whether new event id is available and skip topic assignment is unavailable.
  const eventTopicAssignments = (newEventId && !skipTopicAssignment)
    ? await loadEventTopicAssignments(newEventId)
    : [];

  // Processes each unassigned candidates entry in turn.
  for (const candidate of unassignedCandidates) {
    upsertRunContextRecord(runContext, {
      id: candidate.id,
      eventId: newEventId,
      topicId: primaryTopicId(eventTopicAssignments)
    });
  }
  // Maps source values into the result produced while assigning article to event.
  articleCandidateCache?.updateEventId?.(
    [article.id, ...unassignedCandidates.map(candidate => candidate.id)],
    newEventId
  );

  upsertRunContextRecord(runContext, {
    id: article.id,
    feedId: article.feedId,
    title: article.title,
    description: article.description,
    publishedAt: article.publishedAt,
    createdAt: article.createdAt,
    topicId: primaryTopicId(eventTopicAssignments),
    topicAssignments: eventTopicAssignments,
    eventId: newEventId,
    eventVector: articleEventVector
  });

  return newEventId;
}

export default assignArticleToEvent;
