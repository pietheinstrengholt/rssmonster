// services/articles/assignArticleToEvent.js
// This service assigns one article to an existing event, creates a new event, or leaves it eventless.
// It maintains event-owned topic links while preserving behavioral topic evidence owned by ArticleTopic.
import db from '../../models/index.js';
import { Op } from 'sequelize';
import { assignSemanticUnitToTopic } from '../topics/assignEventToTopic.js';
import { createAndAssignEvent as createEventFromCandidates } from '../events/createEvents.js';
import { syncEventTopicsToArticles } from '../events/eventArticleTopicSync.js';
import {
  normalizeTopicAssignments,
  primaryTopicId
} from '../events/eventTopicAssignment.js';
import { assignArticleToExistingEvent as updateExistingEvent } from '../events/updateEvents.js';
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
} from '../events/articleEventTime.js';

const { Article, Event, ArticleTopic, EventTopic } = db;
const DUPLICATE_HEADLINE_SIM = 0.92;
const MIN_EVENT_ARTICLES = Number.parseInt(process.env.MIN_EVENT_ARTICLES || '2', 10);
const MIN_EVENT_SOURCES = Number.parseInt(process.env.MIN_EVENT_SOURCES || '2', 10);
const REQUIRE_MULTI_SOURCE_FOR_EVENT = ['1', 'true', 'yes'].includes(
  String(process.env.REQUIRE_MULTI_SOURCE_FOR_EVENT || 'false').toLowerCase()
);
const EVENT_DEBUG = ['1', 'true', 'yes'].includes(
  String(process.env.EVENT_DEBUG || process.env.EVENT_RECLUSTER_DEBUG || '').toLowerCase()
);

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
  return new Set(
    normalizeHeadline(text)
      .split(' ')
      .map(token => token.trim())
      .filter(token => token.length > 2 && !STOPWORDS.has(token))
  );
}

// This function estimates lexical overlap between two headlines.
function headlineSimilarity(titleA = '', titleB = '') {
  const a = tokenSet(titleA);
  const b = tokenSet(titleB);
  if (!a.size || !b.size) return 0;

  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }

  const union = a.size + b.size - intersection;
  if (!union) return 0;

  return intersection / union;
}

// This function extracts lightweight entity hints from title and description text.
function extractEntitySet(article = {}) {
  const text = `${article.title || ''} ${article.description || ''}`;
  const matches = text.match(/\b([A-Z][a-z]{2,}|[A-Z]{2,})\b/g) || [];
  return new Set(matches.map(value => value.toLowerCase()));
}

// This function counts shared entity hints between two extracted entity sets.
function entityOverlapCount(a = new Set(), b = new Set()) {
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const value of a) {
    if (b.has(value)) overlap++;
  }
  return overlap;
}

// This function gradually discounts older events during candidate matching.
function recencyDecayMultiplier(lastSeenAt) {
  const now = Date.now();
  const lastSeenTs = eventTimestamp(lastSeenAt);
  if (!Number.isFinite(lastSeenTs)) return 0.2;

  const ageHours = Math.max(0, (now - lastSeenTs) / HOUR_MS);
  const halfLife = Math.max(EVENT_RECENCY_HALF_LIFE_HOURS, 1);
  return Math.pow(0.5, ageHours / halfLife);
}

// This function combines semantic, headline, temporal, and entity evidence for article-event matching.
function buildMatchSignal({ article, event, articleEventVector }) {
  const semantic = cosineSimilarity(articleEventVector, event.eventVector);
  const headline = headlineSimilarity(article.title, event.name || '');
  const temporal = eventWindowScore(article, event);

  const overlap = entityOverlapCount(
    extractEntitySet(article),
    extractEntitySet({ title: event.name || '' })
  );

  const nearDuplicate =
    Boolean(article.contentHash) &&
    Boolean(event.representativeArticleId) &&
    headline >= DUPLICATE_HEADLINE_SIM;

  const recencyDecay = recencyDecayMultiplier(event.eventWindowEndAt || event.updatedAt);
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

// This function writes debug output only when event debug logging is enabled.
function debugEventLog(message, payload = null) {
  if (!EVENT_DEBUG) return;

  if (payload == null) {
    console.log(`[EVENT DEBUG] ${message}`);
    return;
  }

  console.log(`[EVENT DEBUG] ${message}`, payload);
}

// This function loads topic assignments already stored for an event.
async function loadEventTopicAssignments(eventId) {
  const rows = await EventTopic.findAll({
    where: { eventId },
    order: [['rank', 'ASC'], ['confidence', 'DESC']],
    raw: true
  });

  return normalizeTopicAssignments(rows);
}

// This function replaces the EventTopic rows for one event and updates the event primary topic.
async function persistEventTopicAssignments(event, topicAssignments) {
  const normalizedAssignments = normalizeTopicAssignments(topicAssignments);
  const primaryId = primaryTopicId(normalizedAssignments);

  await EventTopic.destroy({ where: { eventId: event.id } });

  if (normalizedAssignments.length) {
    await EventTopic.bulkCreate(
      normalizedAssignments.map(assignment => ({
        eventId: event.id,
        topicId: assignment.topicId,
        confidence: assignment.confidence,
        rank: assignment.rank,
        primaryInd: assignment.primaryInd
      }))
    );
  }

  await event.update({ topicId: primaryId });
  event.topicId = primaryId;

  return normalizedAssignments;
}

// This function derives event topic assignments from an event vector and the event topic cache.
async function deriveEventTopicAssignments({
  event,
  eventTopicVector,
  topicsCache,
  assignmentContext
}) {
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
      published: event.eventWindowEndAt || event.updatedAt || new Date()
    },
    semanticVector: eventTopicVector,
    topicsCache,
    assignmentContext
  });
}

// This cache keeps a bounded set of candidate events in memory during one assignment pass.
export class EventCache {
  constructor(events = []) {
    this._events = events;
  }

  // This function loads the newest candidate events for a user.
  static async forUser(userId) {
    const events = await Event.findAll({
      where: { userId },
      order: [['updatedAt', 'DESC']],
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

    if (this._events.length > MAX_CANDIDATES) {
      this._events.pop();
    }
  }

  // This function patches cached event fields after assignment updates.
  updateInMemory(eventId, updates) {
    const event = this._events.find(e => e.id === eventId);
    if (event) {
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
    assignTopicsForEvent: async ({ event, eventTopicVector }) => {
      const eventTopicAssignments = await deriveEventTopicAssignments({
        event,
        eventTopicVector,
        topicsCache,
        assignmentContext
      });

      const persistedEventTopics = await persistEventTopicAssignments(event, eventTopicAssignments);
      await syncEventTopicsToArticles(event.id, persistedEventTopics);

      return primaryTopicId(persistedEventTopics);
    }
  });
}

// This function removes event ownership from an article without deleting behavioral topic evidence.
async function assignTopicOnly({ article }) {
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
  if (Array.isArray(record?.eventVector)) return record.eventVector;
  if (Array.isArray(record?.articleVector)) return record.articleVector;
  return null;
}

// This function scores whether a candidate article can corroborate a new event.
function evaluateCandidateSignal({ article, candidate, articleEventVector }) {
  const candidateVector = resolveArticleVector(candidate);

  if (!Array.isArray(candidateVector)) {
    return {
      candidateId: candidate.id,
      semantic: 0,
      temporal: 0,
      headline: 0,
      overlap: 0,
      meetsSemantic: false,
      meetsTemporal: false,
      meetsAuxiliary: false,
      accepted: false
    };
  }

  const semantic = cosineSimilarity(articleEventVector, candidateVector);
  const meetsSemantic = semantic >= EVENT_SIM_THRESHOLD;

  const temporal = articleWindowScore(article, candidate);
  const meetsTemporal = temporal > 0;

  const headline = headlineSimilarity(article.title, candidate.title || '');
  const overlap = entityOverlapCount(
    extractEntitySet(article),
    extractEntitySet(candidate)
  );

  const meetsAuxiliary = (
    headline >= EVENT_MIN_HEADLINE_SIM ||
    overlap >= EVENT_MIN_SHARED_ENTITY_OVERLAP ||
    semantic >= Math.max(EVENT_SIM_THRESHOLD, DUPLICATE_HEADLINE_SIM)
  );

  const accepted = meetsSemantic && meetsTemporal && meetsAuxiliary;

  return {
    candidateId: candidate.id,
    semantic,
    temporal,
    headline,
    overlap,
    meetsSemantic,
    meetsTemporal,
    meetsAuxiliary,
    accepted
  };
}

// This function finds persisted unassigned articles that can corroborate the current article.
async function findCandidateArticles({ article, articleEventVector }) {
  const articleTs = articleEventTimestamp(article) ?? Date.now();
  const cutoff = new Date(articleTs - EVENT_MAX_GAP_HOURS * HOUR_MS);
  const upperBound = new Date(articleTs + EVENT_MAX_GAP_HOURS * HOUR_MS);

  const candidates = await Article.findAll({
    where: {
      userId: article.userId,
      eventId: null,
      id: { [Op.ne]: article.id },
      published: {
        [Op.gte]: cutoff,
        [Op.lte]: upperBound
      }
    },
    attributes: ['id', 'feedId', 'title', 'description', 'published', 'createdAt', 'articleVector'],
    order: [['published', 'DESC']],
    limit: MAX_CANDIDATES
  });

  const evaluatedSignals = candidates.map(candidate => evaluateCandidateSignal({
    article,
    candidate,
    articleEventVector
  }));

  const acceptedIds = new Set(
    evaluatedSignals
      .filter(signal => signal.accepted)
      .map(signal => signal.candidateId)
  );

  const acceptedCandidates = candidates.filter(candidate => acceptedIds.has(candidate.id));

  return {
    acceptedCandidates,
    evaluatedSignals
  };
}

// This function inserts or updates one article record in the current run context.
function upsertRunContextRecord(runContext, record) {
  if (!runContext) return;

  runContext.records ??= [];
  runContext.indexById ??= new Map();

  const existingIndex = runContext.indexById.get(record.id);
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
  if (!runContext) return;

  runContext.stats ??= {};
  runContext.stats[key] = Number(runContext.stats[key] || 0) + amount;
}

// This function finds corroborating candidates from articles already seen in the current run.
function findCandidateArticlesFromContext({ article, articleEventVector, runContext }) {
  const articleTs = articleEventTimestamp(article) ?? Date.now();
  const maxGapMs = EVENT_MAX_GAP_HOURS * HOUR_MS;

  const candidatePool = (runContext?.records || []).filter(candidate => {
    if (candidate.id === article.id) return false;
    if (candidate.eventId != null) return false;
    if (!Array.isArray(resolveArticleVector(candidate))) return false;

    const candidateTs = articleEventTimestamp(candidate);
    if (!Number.isFinite(candidateTs)) return false;

    return Math.abs(articleTs - candidateTs) <= maxGapMs;
  });

  const evaluatedSignals = candidatePool.map(candidate => evaluateCandidateSignal({
    article,
    candidate,
    articleEventVector
  }));

  const acceptedIds = new Set(
    evaluatedSignals
      .filter(signal => signal.accepted)
      .map(signal => signal.candidateId)
  );

  const acceptedCandidates = candidatePool.filter(candidate => acceptedIds.has(candidate.id));

  return {
    acceptedCandidates,
    evaluatedSignals
  };
}

// This function assigns one article to an event, creates a new event, or leaves it eventless.
// It also keeps event-topic denormalization in sync unless topic assignment is explicitly skipped.
export async function assignArticleToEvent(articleIdOrObj, cache = null, vectors = null, topicsCache = null, runContext = null, options = {}) {
  const assignmentContext = options.assignmentContext || 'incremental';
  const skipTopicAssignment = Boolean(options.skipTopicAssignment);

  const article = typeof articleIdOrObj === 'object'
    ? articleIdOrObj
    : await Article.findByPk(articleIdOrObj);

  const articleEventVector = vectors?.eventVector ?? null;

  if (!article) return null;

  if (!articleEventVector) {
    await assignTopicOnly({ article });
    incrementRunStat(runContext, 'topicOnlyNoVectorCount');

    upsertRunContextRecord(runContext, {
      id: article.id,
      feedId: article.feedId,
      title: article.title,
      description: article.description,
      published: article.published,
      createdAt: article.createdAt,
      topicId: null,
      topicAssignments: [],
      eventId: null,
      eventVector: null
    });

    return null;
  }

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
  const matchDiagnostics = [];

  for (const event of events) {
    if (!event.eventVector) continue;

    const signal = buildMatchSignal({
      article,
      event,
      articleEventVector
    });

    const satisfiesStrictSemantic = signal.semantic >= EVENT_SIM_THRESHOLD;
    const satisfiesAuxiliarySignal =
      signal.temporal > 0 &&
      (
        signal.headline >= EVENT_MIN_HEADLINE_SIM ||
        signal.overlap >= EVENT_MIN_SHARED_ENTITY_OVERLAP ||
        signal.nearDuplicate
      );

    if (!satisfiesStrictSemantic || !satisfiesAuxiliarySignal) {
      if (EVENT_DEBUG) {
        matchDiagnostics.push({
          eventId: event.id,
          semantic: Number(signal.semantic.toFixed(4)),
          headline: Number(signal.headline.toFixed(4)),
          temporal: Number(signal.temporal.toFixed(4)),
          overlap: signal.overlap,
          meetsSemantic: satisfiesStrictSemantic,
          meetsAuxiliary: satisfiesAuxiliarySignal,
          accepted: false
        });
      }
      continue;
    }

    if (EVENT_DEBUG) {
      matchDiagnostics.push({
        eventId: event.id,
        semantic: Number(signal.semantic.toFixed(4)),
        headline: Number(signal.headline.toFixed(4)),
        temporal: Number(signal.temporal.toFixed(4)),
        overlap: signal.overlap,
        composite: Number(signal.composite.toFixed(4)),
        meetsSemantic: true,
        meetsAuxiliary: true,
        accepted: true
      });
    }

    if (signal.composite > bestScore) {
      bestScore = signal.composite;
      bestEvent = event;
      bestSignal = signal;
    }
  }

  if (EVENT_DEBUG) {
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

  if (bestEvent && bestSignal) {
    await updateExistingEvent({
      article,
      articleEventVector,
      bestEvent,
      cache,
      bestScore,
      matchSignal: bestSignal,
      skipTopicAssignment,
      assignTopicsForEvent: async ({ event, eventTopicVector }) => {
        const eventTopicAssignments = await deriveEventTopicAssignments({
          event,
          eventTopicVector,
          topicsCache,
          assignmentContext
        });

        const persistedEventTopics = await persistEventTopicAssignments(event, eventTopicAssignments);
        await syncEventTopicsToArticles(event.id, persistedEventTopics);

        return primaryTopicId(persistedEventTopics);
      }
    });

    const eventTopicAssignments = skipTopicAssignment
      ? []
      : await loadEventTopicAssignments(bestEvent.id);

    upsertRunContextRecord(runContext, {
      id: article.id,
      feedId: article.feedId,
      title: article.title,
      description: article.description,
      published: article.published,
      createdAt: article.createdAt,
      topicId: primaryTopicId(eventTopicAssignments),
      topicAssignments: eventTopicAssignments,
      eventId: bestEvent.id,
      eventVector: articleEventVector
    });

    incrementRunStat(runContext, 'linkedToExistingEventCount');

    return bestEvent.id;
  }

  await assignTopicOnly({ article });

  const candidateResult = runContext
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

  const corroboratedArticleCount = candidateArticles.length + 1;
  const corroboratedSourceCount = new Set([
    article.feedId,
    ...candidateArticles.map(candidate => candidate.feedId)
  ]).size;

  if (EVENT_DEBUG) {
    debugEventLog(`article=${article.id} candidate-eval`, {
      topicId: null,
      totalCandidatePool: candidateResult.evaluatedSignals.length,
      acceptedCandidates: candidateArticles.length,
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
          semantic: Number(signal.semantic.toFixed(4)),
          temporal: Number(signal.temporal.toFixed(4)),
          headline: Number(signal.headline.toFixed(4)),
          overlap: signal.overlap,
          accepted: signal.accepted,
          meetsSemantic: signal.meetsSemantic,
          meetsTemporal: signal.meetsTemporal,
          meetsAuxiliary: signal.meetsAuxiliary
        }))
    });
  }

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
      published: article.published,
      createdAt: article.createdAt,
      topicId: null,
      topicAssignments: [],
      eventId: null,
      eventVector: articleEventVector
    });

    return null;
  }

  const newEventId = await createAndAssignEvent({
    candidateArticles,
    article,
    cache,
    topicsCache,
    assignmentContext,
    skipTopicAssignment
  });

  if (newEventId) {
    incrementRunStat(runContext, 'newEventsCreatedCount');
  }

  const eventTopicAssignments = (newEventId && !skipTopicAssignment)
    ? await loadEventTopicAssignments(newEventId)
    : [];

  for (const candidate of candidateArticles) {
    upsertRunContextRecord(runContext, {
      id: candidate.id,
      eventId: newEventId,
      topicId: primaryTopicId(eventTopicAssignments)
    });
  }

  upsertRunContextRecord(runContext, {
    id: article.id,
    feedId: article.feedId,
    title: article.title,
    description: article.description,
    published: article.published,
    createdAt: article.createdAt,
    topicId: primaryTopicId(eventTopicAssignments),
    topicAssignments: eventTopicAssignments,
    eventId: newEventId,
    eventVector: articleEventVector
  });

  return newEventId;
}

export default assignArticleToEvent;
