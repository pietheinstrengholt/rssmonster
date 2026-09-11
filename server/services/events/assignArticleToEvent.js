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
  MAX_CANDIDATES,
  MIN_EVENT_ARTICLES, MIN_EVENT_SOURCES, REQUIRE_MULTI_SOURCE_FOR_EVENT,
  EVENT_MAX_GAP_HOURS
} from '../config/semanticConfig.js';
import {
  HOUR_MS,
  articleEventTimestamp
} from './articleEventTime.js';

import {
  tokenSet, extractEntitySet, normalizeVector, evaluateCandidateSignal,
  evaluateArticleAgainstEvent, selectEventDecision
} from './eventOccurrencePolicy.js';

// Provides the shared dependencies used by this service.
const { Article, Event, ArticleTopic, EventTopic } = db;
// Defines the event debug enforced by this service.
const EVENT_DEBUG = ['1', 'true', 'yes'].includes(
  String(process.env.EVENT_DEBUG || process.env.EVENT_RECLUSTER_DEBUG || '').toLowerCase()
) || process.env.NODE_ENV === 'development';

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
    if (candidate.userId != null && Number(candidate.userId) !== Number(article.userId)) return false;
    // Rejects the value when candidate id is article id.
    if (candidate.id === article.id) return false;
    // Rejects the value when resolve article vector is not an array.
    if (!Array.isArray(resolveArticleVector(candidate))) return false;

    // Derives the candidate ts through article event timestamp while finding candidate articles from context.
    const candidateTs = articleEventTimestamp(candidate);
    // Rejects the value when candidate ts is not finite.
    if (!Number.isFinite(candidateTs)) return false;

    return Math.abs(articleTs - candidateTs) <= maxGapMs;
  }).sort((left, right) =>
    Math.abs(articleTs - articleEventTimestamp(left)) - Math.abs(articleTs - articleEventTimestamp(right)) ||
    Number(right.id) - Number(left.id)
  ).slice(0, MAX_CANDIDATES);

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
  // Existing ownership and canonical filtering apply before candidate discovery.
  if (article.status === DUPLICATE_ARTICLE_STATUS || article.duplicateOfArticleId != null || article.filteredInd) return null;

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

  // Discover both paths before deciding; an early centroid winner could hide ambiguity.
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
  // Discovery stays semantic/time based. Apply occurrence identity only when
  // selecting a proposed new Event's members, using the shared decision policy.
  const unassignedCandidates = candidateArticles.filter(candidate => candidate.eventId == null &&
    evaluateCandidateSignal({
      article, candidate, articleEventVector, normalizedArticleEventVector, enforceOccurrence: true
    }).accepted);

  const events = cache
    ? [...cache.events]
    : await Event.findAll({
      where: { userId: article.userId },
      order: [['updatedAt', 'DESC']],
      limit: MAX_CANDIDATES
    });
  const eventsById = new Map(events.map(event => [Number(event.id), event]));
  const candidateEventIds = [...new Set(assignedCandidates.map(candidate => Number(candidate.eventId)))];
  const missingIds = candidateEventIds.filter(id => !eventsById.has(id));
  // Load member-discovered Events in one bounded query, not one query per candidate.
  if (missingIds.length) {
    const missingEvents = await Event.findAll({
      where: { userId: article.userId, id: { [Op.in]: missingIds } },
      limit: MAX_CANDIDATES
    });
    for (const event of missingEvents) {
      eventsById.set(Number(event.id), event);
      cache?.add(event);
    }
  }
  const memberSignalsByEvent = new Map();
  for (const signal of candidateResult.evaluatedSignals) {
    if (signal.eventId == null) continue;
    const id = Number(signal.eventId);
    const signals = memberSignalsByEvent.get(id) || [];
    signals.push(signal);
    memberSignalsByEvent.set(id, signals);
  }
  const now = Date.now();
  const decisions = [...eventsById.values()].map(event => {
    const memberSignals = memberSignalsByEvent.get(Number(event.id)) || [];
    return {
      event,
      ...evaluateArticleAgainstEvent(article, event, {
        articleEventVector, normalizedArticleEventVector, memberSignals, now,
        candidateSources: [
          ...(events.includes(event) ? [cache ? 'event_cache' : 'event_database'] : []),
          ...(memberSignals.length ? ['member_articles'] : [])
        ]
      })
    };
  });
  const selection = selectEventDecision(decisions);
  const bestEvent = selection.candidate?.event || null;
  const bestSignal = selection.candidate?.evidence || null;
  const bestScore = selection.candidate?.score || 0;
  const diagnostics = {
    decision: selection.decision,
    reasons: selection.reasons,
    margin: selection.margin ?? null,
    topMatches: decisions
      .sort((a, b) => b.score - a.score || Number(a.event.id) - Number(b.event.id))
      .slice(0, 5)
      .map(result => ({
        eventId: result.event.id, score: result.score, evidenceScore: result.evidenceScore,
        accepted: result.eligible, decision: result.decision, reasons: result.reasons,
        spanHours: result.evidence.spanHours, candidateSources: result.evidence.candidateSources
      }))
  };
  if (runContext) runContext.lastDecision = diagnostics;
  debugEventLog(`article=${article.id} existing-event-eval`, diagnostics);
  debugEventLog(`article=${article.id} candidate-eval`, {
    assignedCandidateCount: assignedCandidates.length,
    unassignedCandidateCount: unassignedCandidates.length,
    selectedCandidateEventId: bestEvent?.id ?? null,
    decision: selection.decision, reasons: selection.reasons
  });
  if (bestEvent && memberSignalsByEvent.has(Number(bestEvent.id))) {
    debugEventLog(`article=${article.id} candidate-event-selected`, {
      selectedCandidateEventId: bestEvent.id, decision: selection.decision, reasons: selection.reasons
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

    // A concurrent membership change can invalidate a previously eligible candidate.
    if (!updatedEventId) {
      if (runContext) runContext.lastDecision = {
        ...diagnostics, decision: 'reject', reasons: ['membership_changed']
      };
      return null;
    }

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
  if (selection.decision === 'ambiguous') {
    incrementRunStat(runContext, 'ambiguousArticleCount');
    upsertRunContextRecord(runContext, {
      id: article.id, feedId: article.feedId, title: article.title,
      description: article.description, publishedAt: article.publishedAt, createdAt: article.createdAt,
      eventId: null, topicId: article.topicId, topicAssignments: [], eventVector: articleEventVector
    });
    articleCandidateCache?.updateEventId?.([article.id], null);
    return null;
  }

  const corroboratedArticleCount = unassignedCandidates.length + 1;
  const corroboratedSourceCount = new Set([
    article.feedId, ...unassignedCandidates.map(candidate => candidate.feedId)
  ].filter(feedId => feedId != null)).size;

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

  if (runContext) {
    runContext.lastDecision = {
      ...diagnostics,
      decision: newEventId ? 'new_event' : 'reject',
      reasons: [newEventId ? 'compatible_seed_group' : 'seed_group_not_assigned']
    };
  }
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

  // Only committed creation may change neighboring candidate-cache membership.
  const createdMembers = newEventId ? unassignedCandidates : [];
  for (const candidate of createdMembers) {
    upsertRunContextRecord(runContext, {
      id: candidate.id,
      eventId: newEventId,
      topicId: primaryTopicId(eventTopicAssignments)
    });
  }
  // Maps source values into the result produced while assigning article to event.
  articleCandidateCache?.updateEventId?.(
    [article.id, ...createdMembers.map(candidate => candidate.id)],
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
