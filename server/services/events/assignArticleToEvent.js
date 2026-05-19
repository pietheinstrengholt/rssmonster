// services/events/assignArticleToEvent.js
import db from '../../models/index.js';
import { Op } from 'sequelize';
import assignEventToTopic from './assignEventToTopic.js';
import {
  EVENT_SIM_THRESHOLD,
  MAX_CANDIDATES,
  EVENT_MAX_GAP_HOURS,
  EVENT_RECENCY_HALF_LIFE_HOURS,
  EVENT_MIN_HEADLINE_SIM,
  EVENT_MIN_SHARED_ENTITY_OVERLAP,
  EVENT_LIFECYCLE,
  EVENT_VECTOR_ALPHA,
  PRIMARY_TOPIC_THRESHOLD,
  SECONDARY_TOPIC_THRESHOLD,
  MAX_TOPICS_PER_ARTICLE
} from './semanticConfig.js';

const { Article, Event, Topic, ArticleTopic, EventTopic } = db;
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

function resolveEventStatus(articleCount, lastSeenAt) {
  const now = Date.now();
  const lastSeenTs = toTimestamp(lastSeenAt);
  if (!Number.isFinite(lastSeenTs)) return 'archived';

  const ageHours = Math.max(0, (now - lastSeenTs) / (1000 * 60 * 60));

  if (ageHours >= EVENT_LIFECYCLE.coolingHours) {
    return 'archived';
  }

  if (ageHours > EVENT_LIFECYCLE.activeFreshHours) {
    return 'cooling';
  }

  if (articleCount <= EVENT_LIFECYCLE.emergingArticleMax) {
    return 'emerging';
  }

  return 'active';
}

function blendEventVector(existingVector, incomingVector) {
  if (!Array.isArray(existingVector) || !Array.isArray(incomingVector)) return incomingVector;
  if (existingVector.length !== incomingVector.length) return incomingVector;

  return existingVector.map(
    (value, index) => value * (1 - EVENT_VECTOR_ALPHA) + incomingVector[index] * EVENT_VECTOR_ALPHA
  );
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

async function updateSourceDiversity(eventId, userId) {
  const sourceCount = await Article.count({
    where: { eventId, userId },
    distinct: true,
    col: 'feedId'
  });

  const sourceDiversityScore = Math.log(sourceCount + 1);

  await Event.update(
    { sourceCount, sourceDiversityScore },
    { where: { id: eventId } }
  );

  return { sourceCount, sourceDiversityScore };
}

function generateEventName(article) {
  if (!article?.title) return null;

  let name = article.title
    .replace(/\s*[-\u2013\u2014|:]\s*[^-\u2013\u2014|:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (name.length > 120) {
    name = name.slice(0, 120).replace(/\s+\S*$/, '') + '...';
  }

  return name || null;
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

async function persistArticleTopicAssignments(article, topicAssignments) {
  const normalizedAssignments = normalizeTopicAssignments(topicAssignments);
  const primaryId = primaryTopicId(normalizedAssignments);

  await ArticleTopic.destroy({ where: { articleId: article.id } });

  if (normalizedAssignments.length) {
    await ArticleTopic.bulkCreate(
      normalizedAssignments.map(assignment => ({
        articleId: article.id,
        topicId: assignment.topicId,
        confidence: assignment.confidence,
        rank: assignment.rank,
        primaryInd: assignment.primaryInd
      }))
    );
  }

  await article.update({ topicId: primaryId });
  article.topicId = primaryId;

  return normalizedAssignments;
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

function mergeTopicAssignments({ existingAssignments, incomingAssignments, existingArticleCount, newArticleCount }) {
  const merged = new Map();

  for (const assignment of existingAssignments) {
    merged.set(assignment.topicId, {
      topicId: assignment.topicId,
      confidence: assignment.confidence * (existingArticleCount / newArticleCount),
      primaryInd: assignment.primaryInd
    });
  }

  for (const assignment of incomingAssignments) {
    const current = merged.get(assignment.topicId);
    const weightedIncoming = assignment.confidence * (1 / newArticleCount);

    if (!current) {
      merged.set(assignment.topicId, {
        topicId: assignment.topicId,
        confidence: weightedIncoming,
        primaryInd: assignment.primaryInd
      });
      continue;
    }

    merged.set(assignment.topicId, {
      topicId: assignment.topicId,
      confidence: current.confidence + weightedIncoming,
      primaryInd: current.primaryInd || assignment.primaryInd
    });
  }

  return normalizeTopicAssignments([...merged.values()]);
}

async function buildEventTopicAssignmentsFromArticles(articleIds, fallbackAssignments = []) {
  if (!articleIds.length) {
    return normalizeTopicAssignments(fallbackAssignments);
  }

  const topicRows = await ArticleTopic.findAll({
    where: { articleId: { [Op.in]: articleIds } },
    raw: true
  });

  if (!topicRows.length) {
    return normalizeTopicAssignments(fallbackAssignments);
  }

  const scoreByTopic = new Map();

  for (const row of topicRows) {
    const existing = scoreByTopic.get(row.topicId) || { topicId: row.topicId, score: 0, count: 0, hasPrimary: false };
    existing.score += Number(row.confidence) * (row.primaryInd ? 1.15 : 1);
    existing.count += 1;
    existing.hasPrimary = existing.hasPrimary || Boolean(row.primaryInd);
    scoreByTopic.set(row.topicId, existing);
  }

  return normalizeTopicAssignments(
    [...scoreByTopic.values()].map(value => ({
      topicId: value.topicId,
      confidence: value.count ? value.score / value.count : 0,
      primaryInd: value.hasPrimary
    }))
  );
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

async function assignArticleToExistingEvent({
  article,
  articleEventVector,
  articleTopicAssignments,
  bestEvent,
  cache,
  bestScore,
  matchSignal
}) {
  const newCount = bestEvent.articleCount + 1;
  const updatedEventVector = blendEventVector(bestEvent.eventVector, articleEventVector);

  const seenAt = article.published || new Date();
  const status = resolveEventStatus(newCount, seenAt);

  const existingEventTopics = await loadEventTopicAssignments(bestEvent.id);
  const eventTopicAssignments = mergeTopicAssignments({
    existingAssignments: existingEventTopics,
    incomingAssignments: articleTopicAssignments,
    existingArticleCount: Math.max(bestEvent.articleCount, 1),
    newArticleCount: Math.max(newCount, 1)
  });

  const persistedEventTopics = await persistEventTopicAssignments(
    bestEvent,
    eventTopicAssignments.length ? eventTopicAssignments : articleTopicAssignments
  );

  const finalArticleTopics = await persistArticleTopicAssignments(
    article,
    articleTopicAssignments.length ? articleTopicAssignments : persistedEventTopics
  );

  const eventPrimaryTopicId = primaryTopicId(persistedEventTopics);
  const articlePrimaryTopicId = primaryTopicId(finalArticleTopics) ?? eventPrimaryTopicId ?? null;

  const [, diversity] = await Promise.all([
    article.update({
      eventId: bestEvent.id,
      topicId: articlePrimaryTopicId
    }),
    updateSourceDiversity(bestEvent.id, article.userId)
  ]);

  await bestEvent.update({
    topicId: eventPrimaryTopicId,
    eventVector: updatedEventVector,
    articleCount: newCount,
    lastSeen: seenAt,
    status
  });

  if (cache) {
    cache.updateInMemory(bestEvent.id, {
      topicId: eventPrimaryTopicId,
      eventVector: updatedEventVector,
      articleCount: newCount,
      status,
      ...diversity
    });
  }

  console.log(
    `[EVENT] Article ${article.id} -> EVENT ${bestEvent.id} (sim=${bestScore.toFixed(3)} headline=${matchSignal.headline.toFixed(2)} time=${matchSignal.temporal.toFixed(2)} entities=${matchSignal.overlap})`
  );
}

async function createAndAssignEvent({
  candidateArticles,
  article,
  articleTopicAssignments,
  cache
}) {
  const eventArticles = [...candidateArticles, article];
  const vectors = eventArticles
    .map(item => item.eventVector)
    .filter(vector => Array.isArray(vector));

  if (!vectors.length) {
    return null;
  }

  const centroid = vectors[0].map((_, index) => (
    vectors.reduce((sum, vector) => sum + vector[index], 0) / vectors.length
  ));

  const timestamps = eventArticles
    .map(item => item.published)
    .filter(Boolean)
    .map(value => new Date(value).getTime())
    .sort((a, b) => a - b);

  const firstSeen = timestamps.length ? new Date(timestamps[0]) : article.published || new Date();
  const lastSeen = timestamps.length ? new Date(timestamps[timestamps.length - 1]) : article.published || new Date();
  const sourceCount = new Set(eventArticles.map(item => item.feedId)).size;
  const sourceDiversityScore = Math.log(sourceCount + 1);
  const name = generateEventName(article);

  const eventArticleIds = eventArticles.map(item => item.id);
  const aggregatedTopicAssignments = await buildEventTopicAssignmentsFromArticles(
    eventArticleIds,
    articleTopicAssignments
  );
  const primaryEventTopicId = primaryTopicId(aggregatedTopicAssignments);

  const newEvent = await Event.create({
    userId: article.userId,
    topicId: primaryEventTopicId,
    representativeArticleId: article.id,
    name,
    articleCount: eventArticles.length,
    eventStrength: 0.2,
    eventVector: centroid,
    firstSeen,
    lastSeen,
    status: resolveEventStatus(eventArticles.length, lastSeen),
    sourceCount,
    sourceDiversityScore
  });

  if (!newEvent?.id) {
    console.warn(
      `[EVENT] Failed to create event for article ${article.id}`
    );
    return null;
  }

  await Article.update(
    { eventId: newEvent.id },
    {
      where: {
        id: { [Op.in]: eventArticleIds }
      }
    }
  );

  await persistEventTopicAssignments(newEvent, aggregatedTopicAssignments);

  if (cache) {
    cache.add(newEvent);
  }

  console.log(
    `[EVENT] Promoted candidate -> EVENT ${newEvent.id} (articles=${eventArticles.length}, sources=${sourceCount})` +
      (primaryEventTopicId ? ` (primaryTopic=${primaryEventTopicId})` : '')
  );

  return newEvent.id;
}

async function assignTopicOnly({ article, topicAssignments }) {
  const persistedArticleTopics = await persistArticleTopicAssignments(article, topicAssignments);

  await article.update({
    eventId: null,
    topicId: primaryTopicId(persistedArticleTopics)
  });

  article.eventId = null;
  article.topicId = primaryTopicId(persistedArticleTopics);

  const topicIds = persistedArticleTopics.map(assignment => assignment.topicId);
  if (topicIds.length) {
    await Topic.update(
      { lastActivityAt: article.published || new Date() },
      { where: { id: { [Op.in]: topicIds } } }
    );
  }
}

function evaluateCandidateSignal({ article, candidate, articleEventVector }) {
  if (!Array.isArray(candidate.eventVector)) {
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

  const semantic = cosineSimilarity(articleEventVector, candidate.eventVector);
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
    attributes: ['id', 'feedId', 'title', 'description', 'published', 'eventVector'],
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

function findCandidateArticlesFromContext({ article, articleEventVector, runContext }) {
  const cutoff = new Date((article.published || new Date()).getTime() - EVENT_MAX_GAP_HOURS * 60 * 60 * 1000);
  const cutoffTs = cutoff.getTime();

  const candidatePool = (runContext?.records || []).filter(candidate => {
    if (candidate.id === article.id) return false;
    if (candidate.eventId != null) return false;
    if (!Array.isArray(candidate.eventVector)) return false;

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

  const article = typeof articleIdOrObj === 'object'
    ? articleIdOrObj
    : await Article.findByPk(articleIdOrObj);

  const articleEventVector = vectors?.eventVector ?? null;
  const articleTopicVector = vectors?.topicVector ?? null;

  if (!article) return null;

  if (!articleEventVector) {
    const topicAssignments = articleTopicVector
      ? await assignEventToTopic({
        article,
        articleTopicVector,
        topicsCache,
        assignmentContext
      })
      : [];

    await assignTopicOnly({ article, topicAssignments });

    console.log(
      `[EVENT] Article ${article.id} kept topic-only (no event vector)`
    );

    upsertRunContextRecord(runContext, {
      id: article.id,
      feedId: article.feedId,
      title: article.title,
      description: article.description,
      published: article.published,
      topicId: primaryTopicId(topicAssignments),
      topicAssignments,
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

  const articleTopicAssignments = articleTopicVector
    ? await assignEventToTopic({
      article,
      articleTopicVector,
      topicsCache,
      assignmentContext
    })
    : [];

  if (bestEvent && bestSignal) {
    await assignArticleToExistingEvent({
      article,
      articleEventVector,
      articleTopicAssignments,
      bestEvent,
      cache,
      bestScore,
      matchSignal: bestSignal
    });

    const eventTopicAssignments = await loadEventTopicAssignments(bestEvent.id);

    upsertRunContextRecord(runContext, {
      id: article.id,
      feedId: article.feedId,
      title: article.title,
      description: article.description,
      published: article.published,
      topicId: article.topicId ?? primaryTopicId(eventTopicAssignments),
      topicAssignments: articleTopicAssignments,
      eventId: bestEvent.id,
      eventVector: articleEventVector
    });

    return bestEvent.id;
  }

  await persistArticleTopicAssignments(article, articleTopicAssignments);

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
      topicId: primaryTopicId(articleTopicAssignments),
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
    await assignTopicOnly({ article, topicAssignments: articleTopicAssignments });

    console.log(
      `[EVENT] Article ${article.id} kept topic-only (candidate articles=${corroboratedArticleCount}, sources=${corroboratedSourceCount}, requireMultiSource=${REQUIRE_MULTI_SOURCE_FOR_EVENT})`
    );

    upsertRunContextRecord(runContext, {
      id: article.id,
      feedId: article.feedId,
      title: article.title,
      description: article.description,
      published: article.published,
      topicId: primaryTopicId(articleTopicAssignments),
      topicAssignments: articleTopicAssignments,
      eventId: null,
      eventVector: articleEventVector
    });

    return null;
  }

  const newEventId = await createAndAssignEvent({
    candidateArticles,
    article,
    articleTopicAssignments,
    cache
  });

  const eventTopicAssignments = newEventId ? await loadEventTopicAssignments(newEventId) : [];

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
    topicId: primaryTopicId(articleTopicAssignments),
    topicAssignments: articleTopicAssignments,
    eventId: newEventId,
    eventVector: articleEventVector
  });

  return newEventId;
}

export default assignArticleToEvent;
