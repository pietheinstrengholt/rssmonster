// services/articles/assignArticleToEvent.js
import db from '../../models/index.js';
import { Op } from 'sequelize';
import { assignSemanticUnitToTopic } from '../topics/assignEventToTopic.js';
import { createAndAssignEvent as createEventFromCandidates } from '../events/createEvents.js';
import { assignArticleToExistingEvent as updateExistingEvent } from '../events/updateEvents.js';
import {
  EVENT_SIM_THRESHOLD,
  MAX_CANDIDATES,
  EVENT_MAX_GAP_HOURS,
  EVENT_RECENCY_HALF_LIFE_HOURS,
  EVENT_MIN_HEADLINE_SIM,
  EVENT_MIN_SHARED_ENTITY_OVERLAP,
  PRIMARY_TOPIC_THRESHOLD,
  SECONDARY_TOPIC_THRESHOLD,
  MAX_TOPICS_PER_ARTICLE
} from '../config/semanticConfig.js';

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

function normalizeHeadline(title = '') {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text = '') {
  return new Set(
    normalizeHeadline(text)
      .split(' ')
      .map(token => token.trim())
      .filter(token => token.length > 2 && !STOPWORDS.has(token))
  );
}

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

function extractEntitySet(article = {}) {
  const text = `${article.title || ''} ${article.description || ''}`;
  const matches = text.match(/\b([A-Z][a-z]{2,}|[A-Z]{2,})\b/g) || [];
  return new Set(matches.map(value => value.toLowerCase()));
}

function entityOverlapCount(a = new Set(), b = new Set()) {
  if (!a.size || !b.size) return 0;
  let overlap = 0;
  for (const value of a) {
    if (b.has(value)) overlap++;
  }
  return overlap;
}

function toTimestamp(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

function hoursBetween(tsA, tsB) {
  if (!Number.isFinite(tsA) || !Number.isFinite(tsB)) return Number.POSITIVE_INFINITY;
  return Math.abs(tsA - tsB) / (1000 * 60 * 60);
}

function temporalProximityScore(articlePublishedAt, eventLastSeenAt) {
  const articleTs = toTimestamp(articlePublishedAt);
  const eventTs = toTimestamp(eventLastSeenAt);
  const diffHours = hoursBetween(articleTs, eventTs);

  if (!Number.isFinite(diffHours)) return 0;
  if (diffHours > EVENT_MAX_GAP_HOURS) return 0;

  return 1 - diffHours / EVENT_MAX_GAP_HOURS;
}

function recencyDecayMultiplier(lastSeenAt) {
  const now = Date.now();
  const lastSeenTs = toTimestamp(lastSeenAt);
  if (!Number.isFinite(lastSeenTs)) return 0.2;

  const ageHours = Math.max(0, (now - lastSeenTs) / (1000 * 60 * 60));
  const halfLife = Math.max(EVENT_RECENCY_HALF_LIFE_HOURS, 1);
  return Math.pow(0.5, ageHours / halfLife);
}

function buildMatchSignal({ article, event, articleEventVector }) {
  const semantic = cosineSimilarity(articleEventVector, event.eventVector);
  const headline = headlineSimilarity(article.title, event.name || '');
  const temporal = temporalProximityScore(article.published, event.lastSeen || event.updatedAt);

  const overlap = entityOverlapCount(
    extractEntitySet(article),
    extractEntitySet({ title: event.name || '' })
  );

  const nearDuplicate =
    Boolean(article.contentHash) &&
    Boolean(event.representativeArticleId) &&
    headline >= DUPLICATE_HEADLINE_SIM;

  const recencyDecay = recencyDecayMultiplier(event.lastSeen || event.updatedAt);
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

function debugEventLog(message, payload = null) {
  if (!EVENT_DEBUG) return;

  if (payload == null) {
    console.log(`[EVENT DEBUG] ${message}`);
    return;
  }

  console.log(`[EVENT DEBUG] ${message}`, payload);
}

function normalizeTopicAssignments(assignments = []) {
  const byTopic = new Map();

  for (const assignment of assignments) {
    const topicId = Number(assignment?.topicId);
    const confidence = Number(assignment?.confidence ?? 0);

    if (!Number.isFinite(topicId) || topicId <= 0) continue;
    if (!Number.isFinite(confidence) || confidence <= 0) continue;

    const existing = byTopic.get(topicId);
    if (!existing || confidence > existing.confidence) {
      byTopic.set(topicId, {
        topicId,
        confidence,
        primaryInd: Boolean(assignment?.primaryInd)
      });
    }
  }

  const ranked = [...byTopic.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_TOPICS_PER_ARTICLE);

  const withThreshold = ranked.filter(topic => topic.confidence >= SECONDARY_TOPIC_THRESHOLD);
  const finalList = withThreshold.length ? withThreshold : ranked.slice(0, 1);

  const explicitPrimary = finalList.find(topic => topic.primaryInd) ?? null;
  const thresholdPrimary = finalList.find(topic => topic.confidence >= PRIMARY_TOPIC_THRESHOLD) ?? null;
  const primaryTopic = explicitPrimary && explicitPrimary.confidence >= PRIMARY_TOPIC_THRESHOLD
    ? explicitPrimary
    : thresholdPrimary;

  return finalList.map((topic, index) => ({
    topicId: topic.topicId,
    confidence: Number(topic.confidence.toFixed(4)),
    rank: index + 1,
    primaryInd: Boolean(primaryTopic && primaryTopic.topicId === topic.topicId)
  }));
}

function primaryTopicId(topicAssignments = []) {
  return topicAssignments.find(topic => topic.primaryInd)?.topicId ?? null;
}

async function loadEventTopicAssignments(eventId) {
  const rows = await EventTopic.findAll({
    where: { eventId },
    order: [['rank', 'ASC'], ['confidence', 'DESC']],
    raw: true
  });

  return normalizeTopicAssignments(rows);
}

async function syncEventTopicsToArticles(eventId, eventTopicAssignments) {
  const normalizedAssignments = normalizeTopicAssignments(eventTopicAssignments);
  const primaryId = primaryTopicId(normalizedAssignments);

  const eventArticles = await Article.findAll({
    where: { eventId },
    attributes: ['id'],
    raw: true
  });

  const articleIds = eventArticles.map(article => Number(article.id)).filter(Boolean);
  if (!articleIds.length) return 0;

  await ArticleTopic.destroy({
    where: {
      articleId: { [Op.in]: articleIds }
    }
  });

  if (normalizedAssignments.length) {
    const rows = [];
    for (const articleId of articleIds) {
      for (const assignment of normalizedAssignments) {
        rows.push({
          articleId,
          topicId: assignment.topicId,
          confidence: assignment.confidence,
          rank: assignment.rank,
          primaryInd: assignment.primaryInd
        });
      }
    }

    await ArticleTopic.bulkCreate(rows);
  }

  await Article.update(
    { topicId: primaryId },
    {
      where: {
        id: { [Op.in]: articleIds }
      }
    }
  );

  return articleIds.length;
}

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
      published: event.lastSeen || event.updatedAt || new Date()
    },
    semanticVector: eventTopicVector,
    topicsCache,
    assignmentContext
  });
}

export class EventCache {
  constructor(events = []) {
    this._events = events;
  }

  static async forUser(userId) {
    const events = await Event.findAll({
      where: { userId },
      order: [['updatedAt', 'DESC']],
      limit: MAX_CANDIDATES
    });

    return new EventCache(events);
  }

  get events() {
    return this._events;
  }

  add(event) {
    this._events.unshift(event);

    if (this._events.length > MAX_CANDIDATES) {
      this._events.pop();
    }
  }

  updateInMemory(eventId, updates) {
    const event = this._events.find(e => e.id === eventId);
    if (event) {
      Object.assign(event.dataValues, updates);
    }
  }
}

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

async function assignTopicOnly({ article }) {
  await ArticleTopic.destroy({ where: { articleId: article.id } });

  await article.update({
    eventId: null,
    topicId: null
  });

  article.eventId = null;
  article.topicId = null;
}

function resolveArticleVector(record) {
  if (Array.isArray(record?.eventVector)) return record.eventVector;
  if (Array.isArray(record?.articleVector)) return record.articleVector;
  return null;
}

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

  const temporal = temporalProximityScore(article.published, candidate.published || candidate.updatedAt);
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

async function findCandidateArticles({ article, articleEventVector }) {
  const cutoff = new Date((article.published || new Date()).getTime() - EVENT_MAX_GAP_HOURS * 60 * 60 * 1000);

  const candidates = await Article.findAll({
    where: {
      userId: article.userId,
      eventId: null,
      id: { [Op.ne]: article.id },
      published: { [Op.gte]: cutoff }
    },
    attributes: ['id', 'feedId', 'title', 'description', 'published', 'articleVector'],
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

function incrementRunStat(runContext, key, amount = 1) {
  if (!runContext) return;

  runContext.stats ??= {};
  runContext.stats[key] = Number(runContext.stats[key] || 0) + amount;
}

function findCandidateArticlesFromContext({ article, articleEventVector, runContext }) {
  const cutoff = new Date((article.published || new Date()).getTime() - EVENT_MAX_GAP_HOURS * 60 * 60 * 1000);
  const cutoffTs = cutoff.getTime();

  const candidatePool = (runContext?.records || []).filter(candidate => {
    if (candidate.id === article.id) return false;
    if (candidate.eventId != null) return false;
    if (!Array.isArray(resolveArticleVector(candidate))) return false;

    const publishedTs = toTimestamp(candidate.published);
    if (!Number.isFinite(publishedTs)) return false;

    return publishedTs >= cutoffTs;
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
    topicId: primaryTopicId(eventTopicAssignments),
    topicAssignments: eventTopicAssignments,
    eventId: newEventId,
    eventVector: articleEventVector
  });

  return newEventId;
}

export default assignArticleToEvent;
