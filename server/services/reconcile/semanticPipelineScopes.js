// services/reconcile/semanticPipelineScopes.js
// This service exposes explicit semantic pipeline scopes for events and event-topic assignment.
// It treats Article.topicId as event-owned denormalization, so behavioral topic evidence stays in ArticleTopic.
import db from '../../models/index.js';
import { Op } from 'sequelize';
import { randomUUID } from 'node:crypto';

import ArticleEventCandidateCache from '../events/ArticleEventCandidateCache.js';
import { assignArticleToEvent, EventCache } from '../events/assignArticleToEvent.js';
import embedArticle from '../articles/embedArticle.js';
import {
  EVENT_MAX_GAP_HOURS,
  RECENCY_WINDOW_DAYS
} from '../config/semanticConfig.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { logEventProcessingSummary } from '../events/eventPipelineDebug.js';
import {
  computeEventStrength,
  reconcileTouchedEvents
} from '../events/eventReconciliation.js';
import {
  assignTopicsForEvents,
  EVENT_TOPIC_TYPES
} from '../topics/event/eventTopicAssignment.js';
import { recomputeTopicStatsForUser } from '../topics/shared/topicStats.service.js';
import { HOUR_MS } from '../events/articleEventTime.js';
import { recordProcessingFailure } from '../observability/processingFailures.js';
import { tryEnqueueGeneratedSemanticLabelJobsForUser } from '../semanticLabels/semanticLabelJobs.js';
import { debugSemanticLog } from '../observability/semanticLogging.js';

// Provides the shared dependencies used by this service.
const { Article, Event, Feed, Topic, ArticleTopic, EventTopic } = db;
// Defines the cache buffer hours enforced by this service.
const CACHE_BUFFER_HOURS = Number.parseInt(process.env.EVENT_CACHE_BUFFER_HOURS || '2', 10);

// This function returns the rolling event cache horizon used for incremental post-crawl event assignment.
function rollingEventWindowHours() {
  return EVENT_MAX_GAP_HOURS + CACHE_BUFFER_HOURS;
}

// This function returns the latest event-time timestamp from articles in one event assignment batch.
function latestArticleEventDate(articles = []) {
  // Selects the timestamps based on whether value is available.
  const timestamps = articles
    .flatMap(article => [article.publishedAt, article.createdAt])
    .map(value => value ? new Date(value).getTime() : null)
    .filter(Number.isFinite);

  // Returns early when timestamps is empty.
  if (!timestamps.length) return new Date();

  return new Date(Math.max(...timestamps));
}

// This function builds a cacheable article candidate record from a Sequelize article and vector result.
function cacheRecordForArticle(article, vectors) {
  // Selects the plain article based on whether article is function.
  const plainArticle = typeof article.get === 'function'
    ? article.get({ plain: true })
    : article;

  return {
    ...plainArticle,
    eventId: article.eventId ?? plainArticle.eventId ?? null,
    eventVector: vectors?.eventVector || plainArticle.articleVector || null
  };
}

// This function builds the structured assignment summary returned to post-crawl callers.
function buildAssignmentResult({
  userId,
  mode,
  articles,
  touchedEventIds,
  touchedTopicIds = [],
  runContext,
  topicAssignment = null,
  durations = null
}) {
  // Filters source values to the entries eligible while building assignment result.
  const assignedArticleCount = articles.filter(article => article.eventId != null).length;
  // Derives the unassigned count through max while building assignment result.
  const unassignedCount = Math.max(articles.length - assignedArticleCount, 0);

  return {
    userId,
    mode,
    articleCount: articles.length,
    touchedEventIds: [...new Set([...touchedEventIds].map(Number).filter(Boolean))],
    touchedTopicIds: [...new Set(touchedTopicIds.map(Number).filter(Boolean))],
    createdEventIds: [...new Set([...(runContext.newEventIds || [])]
      .map(Number)
      .filter(Boolean))],
    createdTopicIds: [...new Set((topicAssignment?.createdTopicIds || [])
      .map(Number)
      .filter(Boolean))],
    newEventsCreatedCount: Number(runContext.stats.newEventsCreatedCount || 0),
    linkedToExistingEventCount: Number(runContext.stats.linkedToExistingEventCount || 0),
    unassignedCount,
    durations: durations || { eventsMs: 0, topicsMs: 0 },
    topicAssignment: topicAssignment || {
      skipped: true,
      eventCount: 0,
      touchedTopicIds: [],
      createdTopicIds: [],
      stats: {
        eventsSkipped: 0,
        eventsMatched: 0,
        eventsUnmatched: 0,
        newTopicsCreated: 0
      }
    }
  };
}

// This function clears article event references that point outside the owning user's events.
async function clearForeignEventReferencesForUser(userId) {
  // Derives the values through update while performing clear foreign event references for user.
  const [affectedCount] = await Article.update(
    { eventId: null },
    {
      where: {
        userId,
        eventId: {
          [Op.ne]: null,
          [Op.notIn]: db.Sequelize.literal(
            `(SELECT id FROM events WHERE userId = ${db.sequelize.escape(userId)})`
          )
        }
      }
    }
  );

  // Handles the case where affected count is available.
  if (affectedCount) {
    debugSemanticLog('event', `[EVENT] Cleared ${affectedCount} foreign event references for user ${userId}`);
  }
}

// This function counts how many scoped articles ended up assigned to events.
async function summarizeArticleAssignments(userId, articleIds) {
  // Returns early when article id is empty.
  if (!articleIds.length) {
    return {
      totalArticles: 0,
      assignedArticles: 0,
      eventCount: 0,
      assignedPct: 0
    };
  }

  // Loads the assigned rows needed while performing summarize article assignments.
  const assignedRows = await Article.findAll({
    where: {
      id: { [Op.in]: articleIds },
      userId,
      ...canonicalArticleWhere(),
      eventId: { [Op.ne]: null }
    },
    attributes: ['eventId'],
    raw: true
  });

  const assignedArticles = assignedRows.length;
  // Maps source values into the result produced while performing summarize article assignments.
  const eventCount = new Set(assignedRows.map(row => row.eventId)).size;
  // Coerces the assigned pct into the representation required while performing summarize article assignments.
  const assignedPct = Number(((assignedArticles / articleIds.length) * 100).toFixed(1));

  return {
    totalArticles: articleIds.length,
    assignedArticles,
    eventCount,
    assignedPct
  };
}

// This function checks whether an article already has a usable stored embedding vector.
function hasStoredArticleVector(article) {
  return Array.isArray(article?.articleVector) && article.articleVector.length > 0;
}

// This function checks whether an article's feed allows new embeddings.
function canGenerateEmbeddingForArticle(article) {
  return article?.Feed?.generateEmbeddings !== false;
}

// This function creates a fresh event assignment run context.
function createEventAssignmentContext() {
  return {
    records: [],
    indexById: new Map(),
    stats: {
      newEventsCreatedCount: 0,
      linkedToExistingEventCount: 0,
      topicOnlyNoVectorCount: 0,
      topicOnlyInsufficientCandidatesCount: 0,
      eventVectorSkippedCount: 0
    }
  };
}

// This function resolves the topic assignment context for one pipeline scope.
function topicAssignmentContextForScope(scope) {
  // Selects the result based on whether scope is incremental.
  return scope === 'incremental' ? 'incremental' : scope;
}

// This function embeds missing article vectors for one event assignment pass.
async function embedArticlesForEventAssignment(articles, scope, processingContext = null) {
  let reusedEmbeddingCount = 0;
  let generatedEmbeddingCount = 0;

  // Derives the vectors by index through all while performing embed articles for event assignment.
  const vectorsByIndex = await Promise.all(
    articles.map(async article => {
      // Handles the case where has stored article vector succeeds.
      if (hasStoredArticleVector(article)) {
        reusedEmbeddingCount++;

        return {
          eventVector: article.articleVector,
          embedding_model: article.embedding_model || null
        };
      }

      // Returns no result when can generate embedding for article is unavailable.
      if (!canGenerateEmbeddingForArticle(article)) {
        return null;
      }

      // Derives the vectors through embed article while performing embed articles for event assignment.
      const vectors = await embedArticle(article, {
        persist: true,
        ...(processingContext ? { processingContext } : {})
      });

      // Returns early when event vector is unavailable.
      if (!vectors?.eventVector) {
        return vectors;
      }

      generatedEmbeddingCount++;

      return vectors;
    })
  );

  // Handles the case where reused embedding count is available or generated embedding count is available.
  if (reusedEmbeddingCount || generatedEmbeddingCount) {
    debugSemanticLog('event',
      `[EVENT] ${scope}: embeddings reused=${reusedEmbeddingCount} generated=${generatedEmbeddingCount}`
    );
  }

  return vectorsByIndex;
}

// This function assigns articles to events and tracks the event ids touched by the pass.
async function assignArticlesToEvents({
  articles,
  vectorsByIndex,
  topicsCache,
  runContext,
  scope,
  cache,
  useTemporalEventCandidates,
  articleCandidateCache
}) {
  // Tracks distinct touched event id while assigning articles to events.
  const touchedEventIds = new Set();

  // Repeats this processing step while eligible work remains.
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const vectors = vectorsByIndex[i];
    // Handles the case where event vector is unavailable.
    if (!vectors?.eventVector) {
      runContext.stats.eventVectorSkippedCount++;
      continue;
    }

    // Selects the event cache based on whether use temporal event candidates is available.
    const eventCache = useTemporalEventCandidates
      ? await EventCache.forArticle(article)
      : cache;

    // Derives the event id through assign article to event while assigning articles to events.
    const eventId = await assignArticleToEvent(
      article,
      eventCache,
      vectors,
      topicsCache,
      runContext,
      {
        assignmentContext: topicAssignmentContextForScope(scope),
        // Topic assignment runs once after touched events are reconciled.
        skipTopicAssignment: true,
        articleCandidateCache
      }
    );

    // Handles the case where event id is available.
    if (eventId) {
      touchedEventIds.add(eventId);
    }

    article.eventId = eventId ?? null;
    articleCandidateCache?.update(cacheRecordForArticle(article, vectors));
  }

  return touchedEventIds;
}

// This function formats event assignment counters for logs.
function formatEventAssignmentSummary(runContext) {
  return [
    `newEvents=${runContext.stats.newEventsCreatedCount}`,
    `linkedToExisting=${runContext.stats.linkedToExistingEventCount}`,
    `topicOnlyNoVector=${runContext.stats.topicOnlyNoVectorCount}`,
    `topicOnlyInsufficient=${runContext.stats.topicOnlyInsufficientCandidatesCount}`,
    `eventVectorSkipped=${runContext.stats.eventVectorSkippedCount}`
  ].join(' ');
}

// This function assigns topics to reconciled events and refreshes derived topic metadata.
async function assignTopicsForTouchedEvents({ userId, articles, touchedIds, articlesByEventId, scope }) {
  // Loads the reconciled events needed while assigning topics for touched events.
  const reconciledEvents = await Event.findAll({
    where: { id: { [Op.in]: touchedIds } },
    order: [
      ['eventWindowEndAt', 'ASC'],
      ['id', 'ASC']
    ]
  });
  // Derives the topic assignment result through assign topics for events while assigning topics for touched events.
  const topicAssignmentResult = await assignTopicsForEvents(userId, reconciledEvents, {
    assignmentContext: topicAssignmentContextForScope(scope)
  });

  // Loads the primary event topics needed while assigning topics for touched events.
  const primaryEventTopics = await EventTopic.findAll({
    where: {
      eventId: { [Op.in]: touchedIds },
      primaryInd: true
    },
    attributes: ['eventId', 'topicId'],
    raw: true
  });
  // Derives the topic id by event id through from entries while assigning topics for touched events.
  const topicIdByEventId = Object.fromEntries(
    primaryEventTopics.map(row => [Number(row.eventId), Number(row.topicId)])
  );
  // Collects the primary topic id while assigning topics for touched events.
  const primaryTopicIds = [
    ...new Set(primaryEventTopics.map(row => Number(row.topicId)).filter(Boolean))
  ];
  // Selects the topic rows based on whether primary topic id is non-empty.
  const topicRows = primaryTopicIds.length
    ? await EventTopic.findAll({
      where: {
        topicId: { [Op.in]: primaryTopicIds },
        primaryInd: true
      },
      attributes: [
        'topicId',
        [db.sequelize.fn('COUNT', '*'), 'eventCount']
      ],
      group: ['topicId'],
      raw: true
    })
    : [];
  // Derives the topic size map through from entries while assigning topics for touched events.
  const topicSizeMap = Object.fromEntries(
    topicRows.map(row => [Number(row.topicId), Number(row.eventCount)])
  );

  // Maps source values into the result produced while assigning topics for touched events.
  await Promise.all(
    reconciledEvents.map(event => {
      // Tracks article count for the processing summary.
      const articleCount = articlesByEventId[event.id]?.length || Number(event.articleCount || 0);
      // Derives the event primary topic id required while assigning topics for touched events.
      const eventPrimaryTopicId = topicIdByEventId[event.id] ?? null;
      // Selects the topic event count based on whether event primary topic id is available.
      const topicEventCount = eventPrimaryTopicId ? (topicSizeMap[eventPrimaryTopicId] ?? 1) : 1;
      // Computes the event strength while assigning topics for touched events.
      const strength = computeEventStrength({
        articleCount,
        topicEventCount
      });

      return event.update({
        topicId: eventPrimaryTopicId,
        eventStrength: strength
      });
    })
  );

  // Loads the touched event topic rows needed while assigning topics for touched events.
  const touchedEventTopicRows = await EventTopic.findAll({
    where: { eventId: { [Op.in]: touchedIds } },
    attributes: ['topicId'],
    raw: true
  });

  // Transforms source values into the touched article id required while assigning topics for touched events.
  const touchedArticleIds = articles.map(article => article.id);
  // Selects the touched article topic rows based on whether touched article id is non-empty.
  const touchedArticleTopicRows = touchedArticleIds.length
    ? await ArticleTopic.findAll({
      where: { articleId: { [Op.in]: touchedArticleIds } },
      attributes: ['topicId'],
      raw: true
    })
    : [];

  // Tracks distinct touched topic id while assigning topics for touched events.
  const touchedTopicIds = new Set();
  // Processes each touched event topic rows entry in turn.
  for (const row of touchedEventTopicRows) {
    // Handles the case where row topic id is not value.
    if (row.topicId != null) touchedTopicIds.add(Number(row.topicId));
  }
  // Processes each touched article topic rows entry in turn.
  for (const row of touchedArticleTopicRows) {
    // Handles the case where row topic id is not value.
    if (row.topicId != null) touchedTopicIds.add(Number(row.topicId));
  }

  // Collects the all touched topic id while assigning topics for touched events.
  const allTouchedTopicIds = [
    ...new Set([...touchedTopicIds, ...topicAssignmentResult.touchedTopicIds])
  ];

  await recomputeTopicStatsForUser(userId, allTouchedTopicIds);

  return {
    ...topicAssignmentResult,
    touchedTopicIds: allTouchedTopicIds
  };
}

// This function orchestrates one scoped event assignment pass.
async function runEventAssignmentPass(userId, articles, scope, options = {}) {
  const passStartedAt = Date.now();
  const {
    skipTopicAssignment = false,
    useTemporalEventCandidates = false,
    eventCacheWindowHours = null,
    articleCandidateCache = null,
    processingContext = null
  } = options;
  // Creates the event assignment context while performing run event assignment pass.
  const runContext = createEventAssignmentContext();

  // Selects the cache based on whether use temporal event candidates is available.
  const cache = useTemporalEventCandidates
    ? null
    : await EventCache.forUser(userId, { windowHours: eventCacheWindowHours });

  // Loads the topics cache needed while performing run event assignment pass.
  const topicsCache = await db.Topic.findAll({
    where: {
      userId,
      topicType: { [Op.in]: EVENT_TOPIC_TYPES }
    },
    order: [['updatedAt', 'DESC']]
  });

  // Derives the vectors by index through embed articles for event assignment while performing run event assignment pass.
  const vectorsByIndex = await embedArticlesForEventAssignment(
    articles,
    scope,
    processingContext
  );
  // Derives the touched event id through assign articles to events while performing run event assignment pass.
  const touchedEventIds = await assignArticlesToEvents({
    articles,
    vectorsByIndex,
    topicsCache,
    runContext,
    scope,
    cache,
    useTemporalEventCandidates,
    articleCandidateCache
  });

  // Derives the assignment summary through format event assignment summary while performing run event assignment pass.
  const assignmentSummary = formatEventAssignmentSummary(runContext);

  debugSemanticLog('event', `[EVENT] ${scope}: assignment summary ${assignmentSummary}`);

  // Handles the case where touched event id size is unavailable.
  if (!touchedEventIds.size) {
    await logEventProcessingSummary(userId, articles, runContext);
    debugSemanticLog('event', `[EVENT] ${scope}: no events created or updated`);
    return buildAssignmentResult({
      userId,
      mode: scope,
      articles,
      touchedEventIds,
      runContext,
      durations: { eventsMs: Date.now() - passStartedAt, topicsMs: 0 }
    });
  }

  // Collects the touched id while performing run event assignment pass.
  const touchedIds = [...touchedEventIds];

  debugSemanticLog('event',
    `[EVENT] ${scope}: ${touchedIds.length} events touched ` +
    `(${articles.length} articles assigned)`
  );

  // Derives the values through reconcile touched events while performing run event assignment pass.
  const { articlesByEventId } = await reconcileTouchedEvents(userId, touchedIds);
  const eventsDurationMs = Date.now() - passStartedAt;

  await logEventProcessingSummary(userId, articles, runContext);

  // Returns early when skip topic assignment is available.
  if (skipTopicAssignment) {
    return buildAssignmentResult({
      userId,
      mode: scope,
      articles,
      touchedEventIds,
      runContext,
      durations: { eventsMs: eventsDurationMs, topicsMs: 0 }
    });
  }

  // Derives the topic assignment through assign topics for touched events while performing run event assignment pass.
  let topicAssignment;
  const topicsStartedAt = Date.now();
  try {
    topicAssignment = await assignTopicsForTouchedEvents({
      userId,
      articles,
      touchedIds,
      articlesByEventId,
      scope
    });
  } catch (error) {
    await recordProcessingFailure({
      ...processingContext,
      userId,
      stage: 'topic_assignment',
      error,
      severity: 'FATAL',
      subjectType: 'user',
      subjectId: userId,
      context: { scope }
    });
    throw error;
  }

  return buildAssignmentResult({
    userId,
    mode: scope,
    articles,
    touchedEventIds,
    touchedTopicIds: topicAssignment.touchedTopicIds,
    runContext,
    topicAssignment: {
      skipped: false,
      ...topicAssignment
    },
    durations: {
      eventsMs: eventsDurationMs,
      topicsMs: Date.now() - topicsStartedAt
    }
  });
}

// This function runs the incremental event scope for recent articles that do not yet belong to an event.
async function runIncrementalEventsForUserInternal(userId, options = {}) {
  const {
    createdAtFrom = null,
    skipTopicAssignment = false,
    processingContext = null
  } = options;
  debugSemanticLog('event', `[EVENT] Incremental event assignment for user ${userId}`);

  // Derives the cache window hours through rolling event window hours while performing run incremental events for user.
  const cacheWindowHours = rollingEventWindowHours();
  // Normalizes the cutoff date used while performing run incremental events for user.
  const cutoffDate = new Date(Date.now() - cacheWindowHours * HOUR_MS);

  // Builds the article where assembled while performing run incremental events for user.
  const articleWhere = {
    userId,
    ...canonicalArticleWhere(),
    filteredInd: false,
    eventId: null
  };

  // Handles the case where created at from is available.
  if (createdAtFrom) {
    articleWhere.createdAt = { [Op.gte]: createdAtFrom };
  } else {
    articleWhere.publishedAt = { [Op.gte]: cutoffDate };
  }

  // Loads the articles needed while performing run incremental events for user.
  const articles = await Article.findAll({
    where: articleWhere,
    include: [{
      model: Feed,
      attributes: ['generateEmbeddings'],
      required: false
    }],
    order: [
      ['publishedAt', 'ASC'],
      ['id', 'ASC']
    ]
  });

  // Handles the case where articles is empty.
  if (!articles.length) {
    debugSemanticLog('event', '[EVENT] No unclustered articles - nothing to do');
    return {
      userId,
      mode: 'incremental',
      articleCount: 0,
      touchedEventIds: [],
      touchedTopicIds: [],
      createdEventIds: [],
      createdTopicIds: [],
      newEventsCreatedCount: 0,
      linkedToExistingEventCount: 0,
      unassignedCount: 0,
      durations: { eventsMs: 0, topicsMs: 0 },
      topicAssignment: {
        skipped: skipTopicAssignment,
        eventCount: 0,
        touchedTopicIds: [],
        createdTopicIds: [],
        stats: {
          eventsSkipped: 0,
          eventsMatched: 0,
          eventsUnmatched: 0,
          newTopicsCreated: 0
        }
      }
    };
  }

  debugSemanticLog('event', `[EVENT] ${articles.length} unclustered articles to assign`);
  // Derives the cache reference date through latest article event date while performing run incremental events for user.
  const cacheReferenceDate = latestArticleEventDate(articles);

  // Derives the article candidate cache through for user while performing run incremental events for user.
  const articleCandidateCache = await ArticleEventCandidateCache.forUser(userId, {
    excludeArticleIds: articles.map(article => article.id),
    referenceDate: cacheReferenceDate
  });

  // Derives the result through run event assignment pass while performing run incremental events for user.
  const result = await runEventAssignmentPass(userId, articles, 'incremental', {
    skipTopicAssignment,
    eventCacheWindowHours: cacheWindowHours,
    articleCandidateCache,
    processingContext
  });

  articleCandidateCache.removeExpired(cacheReferenceDate);

  debugSemanticLog('event', `[EVENT] Finished incremental pass for user ${userId}`);

  return result;
}

// Runs incremental event processing while retaining standalone invocation failures.
export async function runIncrementalEventsForUser(userId, options = {}) {
  try {
    const result = await runIncrementalEventsForUserInternal(userId, options);
    if (result.createdEventIds.length || result.createdTopicIds.length) {
      await tryEnqueueGeneratedSemanticLabelJobsForUser(userId, {
        eventIds: result.createdEventIds,
        topicIds: result.createdTopicIds
      });
    }
    return result;
  } catch (error) {
    await recordProcessingFailure({
      crawlRunId: options.processingContext?.crawlRunId || null,
      executionId: options.processingContext?.executionId || randomUUID(),
      userId,
      stage: 'event_assignment',
      severity: 'FATAL',
      error,
      subjectType: 'user',
      subjectId: userId,
      context: { scope: 'incremental' }
    });
    throw error;
  }
}

// This function runs the recent-repair event scope over the configured recency window.
export async function repairRecentEventsForUser(userId, options = {}) {
  const { skipTopicAssignment = false } = options;
  debugSemanticLog('event', `[EVENT] Recent-repair event assignment for user ${userId}`);

  await clearForeignEventReferencesForUser(userId);

  // Normalizes the cutoff date used while performing repair recent events for user.
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RECENCY_WINDOW_DAYS);

  // Loads the window articles needed while performing repair recent events for user.
  const windowArticles = await Article.findAll({
    where: {
      userId,
      ...canonicalArticleWhere(),
      publishedAt: { [Op.gte]: cutoffDate }
    },
    include: [{
      model: Feed,
      attributes: ['generateEmbeddings'],
      required: false
    }],
    order: [
      ['publishedAt', 'ASC'],
      ['id', 'ASC']
    ]
  });

  // Handles the case where window articles is empty.
  if (!windowArticles.length) {
    debugSemanticLog('event', '[EVENT] No vectorized articles in recency window - nothing to do');
    return {
      userId,
      mode: 'recent-repair',
      articleCount: 0,
      touchedEventIds: [],
      touchedTopicIds: [],
      createdEventIds: [],
      createdTopicIds: [],
      newEventsCreatedCount: 0,
      linkedToExistingEventCount: 0,
      unassignedCount: 0,
      topicAssignment: {
        skipped: skipTopicAssignment,
        eventCount: 0,
        touchedTopicIds: [],
        createdTopicIds: [],
        stats: {
          eventsSkipped: 0,
          eventsMatched: 0,
          eventsUnmatched: 0,
          newTopicsCreated: 0
        }
      }
    };
  }

  // Tracks distinct previous event id while performing repair recent events for user.
  const previousEventIds = new Set(
    windowArticles
      .filter(a => a.eventId != null)
      .map(a => Number(a.eventId))
      .filter(Number.isFinite)
  );

  // Transforms source values into the window article id required while performing repair recent events for user.
  const windowArticleIds = windowArticles.map(a => a.id);
  // Collects the previous event id list while performing repair recent events for user.
  const previousEventIdList = [...previousEventIds];
  // Selects the owned previous event rows based on whether previous event id list is non-empty.
  const ownedPreviousEventRows = previousEventIdList.length
    ? await Event.findAll({
      where: {
        id: { [Op.in]: previousEventIdList },
        userId
      },
      attributes: ['id'],
      raw: true
    })
    : [];
  // Tracks distinct owned previous event id while performing repair recent events for user.
  const ownedPreviousEventIds = new Set(
    ownedPreviousEventRows.map(event => Number(event.id)).filter(Number.isFinite)
  );
  // Collects the owned previous event id list while performing repair recent events for user.
  const ownedPreviousEventIdList = [...ownedPreviousEventIds];

  debugSemanticLog('event',
    `[EVENT] ${windowArticles.length} articles in ` +
    `${RECENCY_WINDOW_DAYS}-day window ` +
    `(${ownedPreviousEventIds.size}/${previousEventIds.size} events affected)`
  );

  // Loads the previous article topic rows needed while performing repair recent events for user.
  const previousArticleTopicRows = await ArticleTopic.findAll({
    where: {
      articleId: { [Op.in]: windowArticleIds },
      topicId: {
        [Op.in]: db.Sequelize.literal(
          `(SELECT id FROM topics WHERE topicType IN ('event', 'hybrid'))`
        )
      }
    },
    attributes: ['topicId'],
    raw: true
  });

  // Selects the previous event topic rows based on whether owned previous event id size is available.
  const previousEventTopicRows = ownedPreviousEventIds.size
    ? await EventTopic.findAll({
      where: { eventId: { [Op.in]: ownedPreviousEventIdList } },
      attributes: ['topicId'],
      raw: true
    })
    : [];

  // Collects the stale topic id while performing repair recent events for user.
  const staleTopicIds = [
    ...new Set([
      ...previousArticleTopicRows.map(row => Number(row.topicId)).filter(Boolean),
      ...previousEventTopicRows.map(row => Number(row.topicId)).filter(Boolean)
    ])
  ];

  await Article.update(
    { eventId: null },
    { where: { id: { [Op.in]: windowArticleIds }, ...canonicalArticleWhere() } }
  );

  await Article.update(
    { topicId: null },
    {
      where: {
        id: { [Op.in]: windowArticleIds },
        topicId: {
          [Op.in]: db.Sequelize.literal(
            `(SELECT id FROM topics WHERE topicType IN ('event', 'hybrid'))`
          )
        }
      }
    }
  );

  await ArticleTopic.destroy({
    where: {
      articleId: { [Op.in]: windowArticleIds },
      topicId: {
        [Op.in]: db.Sequelize.literal(
          `(SELECT id FROM topics WHERE topicType IN ('event', 'hybrid'))`
        )
      }
    }
  });

  // Handles the case where owned previous event id size is available.
  if (ownedPreviousEventIds.size) {
    await EventTopic.destroy({
      where: { eventId: { [Op.in]: ownedPreviousEventIdList } }
    });
  }

  let deletedCount = 0;

  // Handles the case where owned previous event id size is available.
  if (ownedPreviousEventIds.size) {
    // Processes each owned previous event id entry in turn.
    for (const eventId of ownedPreviousEventIds) {
      // Derives the remaining through count while performing repair recent events for user.
      const remaining = await Article.count({
        where: { eventId, userId, ...canonicalArticleWhere() }
      });

      // Handles the case where remaining is value.
      if (remaining === 0) {
        await Event.destroy({ where: { id: eventId, userId } });
        deletedCount++;
      }
    }
  }

  // Handles the case where deleted count is available.
  if (deletedCount) {
    debugSemanticLog('event', `[EVENT] Removed ${deletedCount} empty events`);
  }

  // Derives the repair result through run event assignment pass while performing repair recent events for user.
  const repairResult = await runEventAssignmentPass(userId, windowArticles, 'recent-repair', {
    skipTopicAssignment
  });

  // Handles the case where skip topic assignment is unavailable.
  if (!skipTopicAssignment) {
    await recomputeTopicStatsForUser(userId, [...new Set([...staleTopicIds, ...repairResult.touchedTopicIds])]);
  }

  // Derives the summary through summarize article assignments while performing repair recent events for user.
  const summary = await summarizeArticleAssignments(userId, windowArticleIds);

  debugSemanticLog('event',
    `[EVENT] User ${userId} recent-repair summary: ` +
    `articles=${summary.totalArticles} ` +
    `articlesWithEvents=${summary.assignedArticles} ` +
    `events=${summary.eventCount} ` +
    `eventCoverage=${summary.assignedPct}%`
  );

  debugSemanticLog('event',
    `[EVENT] Finished recent-repair event pass for user ${userId}` +
    ` (window=${RECENCY_WINDOW_DAYS}d, articles=${windowArticles.length},` +
    ` pruned=${deletedCount})`
  );

  if (repairResult.createdEventIds.length || repairResult.createdTopicIds.length) {
    await tryEnqueueGeneratedSemanticLabelJobsForUser(userId, {
      eventIds: repairResult.createdEventIds,
      topicIds: repairResult.createdTopicIds
    });
  }

  return repairResult;
}

// This function backfills missing historical events from all vectorized articles for a user.
export async function backfillHistoricalEventsForUser(userId, options = {}) {
  const {
    skipTopicAssignment = false,
    batchSize = 250
  } = options;

  debugSemanticLog('event', `[EVENT] Historical event backfill for user ${userId}`);

  await clearForeignEventReferencesForUser(userId);

  let lastId = 0;
  let totalProcessed = 0;
  // Collects the touched topic id while performing backfill historical events for user.
  let touchedTopicIds = [];
  // Collects the touched event id while performing backfill historical events for user.
  let touchedEventIds = [];
  let createdEventIds = [];
  let createdTopicIds = [];
  let newEventsCreatedCount = 0;
  let linkedToExistingEventCount = 0;
  let unassignedCount = 0;

  // Repeats this processing step while eligible work remains.
  while (true) {
    // Loads the articles needed while performing backfill historical events for user.
    const articles = await Article.findAll({
      where: {
        userId,
        ...canonicalArticleWhere(),
        id: { [Op.gt]: lastId },
        articleVector: { [Op.ne]: null }
      },
      order: [['id', 'ASC']],
      limit: batchSize
    });

    // Stops collecting values when articles is empty.
    if (!articles.length) {
      break;
    }

    // Derives the batch result through run event assignment pass while performing backfill historical events for user.
    const batchResult = await runEventAssignmentPass(
      userId,
      articles,
      'historical-backfill',
      {
        skipTopicAssignment,
        useTemporalEventCandidates: true
      }
    );

    touchedTopicIds = [...new Set([...touchedTopicIds, ...batchResult.touchedTopicIds])];
    touchedEventIds = [...new Set([...touchedEventIds, ...batchResult.touchedEventIds])];
    createdEventIds = [...new Set([...createdEventIds, ...batchResult.createdEventIds])];
    createdTopicIds = [...new Set([...createdTopicIds, ...batchResult.createdTopicIds])];
    newEventsCreatedCount += batchResult.newEventsCreatedCount;
    linkedToExistingEventCount += batchResult.linkedToExistingEventCount;
    unassignedCount += batchResult.unassignedCount;
    totalProcessed += articles.length;
    lastId = articles[articles.length - 1].id;

    debugSemanticLog('event', `[EVENT] Historical backfill processed=${totalProcessed}, lastId=${lastId}`);
  }

  // Handles the case where skip topic assignment is unavailable and touched topic id is non-empty.
  if (!skipTopicAssignment && touchedTopicIds.length) {
    await recomputeTopicStatsForUser(userId, touchedTopicIds);
  }

  debugSemanticLog('event',
    `[EVENT] Finished historical event backfill for user ${userId}, ` +
    `articles=${totalProcessed}`
  );

  const result = {
    userId,
    mode: 'historical-backfill',
    articleCount: totalProcessed,
    touchedEventIds,
    touchedTopicIds,
    createdEventIds,
    createdTopicIds,
    newEventsCreatedCount,
    linkedToExistingEventCount,
    unassignedCount,
    topicAssignment: {
      skipped: skipTopicAssignment,
      eventCount: touchedEventIds.length,
      touchedTopicIds,
      createdTopicIds,
      stats: {
        eventsSkipped: 0,
        eventsMatched: 0,
        eventsUnmatched: 0,
        newTopicsCreated: 0
      }
    }
  };

  if (result.createdEventIds.length || result.createdTopicIds.length) {
    await tryEnqueueGeneratedSemanticLabelJobsForUser(userId, {
      eventIds: result.createdEventIds,
      topicIds: result.createdTopicIds
    });
  }

  return result;
}

// This function runs the full-rebuild topic scope for event and hybrid topic assignments for a user.
// Behavioral topics are left intact because they are maintained by calibrateBehavioralTopics.js.
export async function rebuildAllTopicsForUser(userId, options = {}) {
  const { assignmentContext = 'full-rebuild' } = options;

  debugSemanticLog('event', `[TOPIC] Full-rebuild topics for user ${userId}`);

  // Loads the user topics needed while performing rebuild all topics for user.
  const userTopics = await Topic.findAll({
    where: {
      userId,
      topicType: { [Op.in]: EVENT_TOPIC_TYPES }
    },
    attributes: ['id'],
    raw: true
  });
  // Keeps the existing topic id entries eligible while performing rebuild all topics for user.
  const existingTopicIds = userTopics.map(topic => Number(topic.id)).filter(Boolean);

  // Loads the events needed while performing rebuild all topics for user.
  const events = await Event.findAll({
    where: { userId },
    order: [
      ['eventWindowEndAt', 'ASC'],
      ['id', 'ASC']
    ]
  });

  // Maps source values into the result produced while performing rebuild all topics for user.
  await EventTopic.destroy({
    where: {
      eventId: {
        [Op.in]: events.map(event => event.id)
      }
    }
  });

  // Handles the case where existing topic id is non-empty.
  if (existingTopicIds.length) {
    await Article.update(
      { topicId: null },
      {
        where: {
          userId,
          topicId: { [Op.in]: existingTopicIds }
        }
      }
    );

    await ArticleTopic.destroy({
      where: {
        topicId: { [Op.in]: existingTopicIds }
      }
    });
  }

  await Event.update(
    { topicId: null },
    { where: { userId } }
  );

  // Derives the values through assign topics for events while performing rebuild all topics for user.
  const {
    eventCount,
    touchedTopicIds,
    createdTopicIds = [],
    stats
  } = await assignTopicsForEvents(userId, events, {
    assignmentContext
  });

  await recomputeTopicStatsForUser(
    userId,
    [...new Set([...existingTopicIds, ...touchedTopicIds])]
  );

  // Loads the all user topics needed while performing rebuild all topics for user.
  const allUserTopics = await Topic.findAll({
    where: {
      userId,
      topicType: { [Op.in]: EVENT_TOPIC_TYPES }
    },
    attributes: ['id', 'eventCount'],
    raw: true
  });

  if (createdTopicIds.length) {
    await tryEnqueueGeneratedSemanticLabelJobsForUser(userId, { topicIds: createdTopicIds });
  }

  const topicCount = allUserTopics.length;
  // Aggregates source values into the total event links used while performing rebuild all topics for user.
  const totalEventLinks = allUserTopics.reduce((sum, t) => sum + (t.eventCount || 0), 0);
  // Aggregates source values into the largest topic size used while performing rebuild all topics for user.
  const largestTopicSize = allUserTopics.reduce((max, t) => Math.max(max, t.eventCount || 0), 0);
  // Selects the avg events per topic based on whether topic count is available.
  const avgEventsPerTopic = topicCount ? (totalEventLinks / topicCount).toFixed(1) : '0';
  // Derives the assignable events required while performing rebuild all topics for user.
  const assignableEvents = eventCount - stats.eventsSkipped;
  // Selects the reuse ratio based on whether assignable events exceeds value.
  const reuseRatio = assignableEvents > 0
    ? ((stats.eventsMatched / assignableEvents) * 100).toFixed(1)
    : '0';
  // Selects the creation ratio based on whether assignable events exceeds value.
  const creationRatio = assignableEvents > 0
    ? ((stats.newTopicsCreated / assignableEvents) * 100).toFixed(1)
    : '0';

  debugSemanticLog('event', `[TOPIC] === Topic Rebuild Summary for user ${userId} ===`);
  debugSemanticLog('event', `[TOPIC] Active topics          ${topicCount}`);
  debugSemanticLog('event', `[TOPIC] Events processed       ${eventCount}`);
  debugSemanticLog('event', `[TOPIC] Events matched         ${stats.eventsMatched}`);
  debugSemanticLog('event', `[TOPIC] Events unmatched       ${stats.eventsUnmatched}`);
  debugSemanticLog('event', `[TOPIC] Events skipped         ${stats.eventsSkipped} (no vector)`);
  debugSemanticLog('event', `[TOPIC] New topics created     ${stats.newTopicsCreated}`);
  debugSemanticLog('event', `[TOPIC] Average events/topic   ${avgEventsPerTopic}`);
  debugSemanticLog('event', `[TOPIC] Largest topic size     ${largestTopicSize} events`);
  debugSemanticLog('event', `[TOPIC] Topic reuse ratio      ${reuseRatio}%`);
  debugSemanticLog('event', `[TOPIC] Topic creation ratio   ${creationRatio}%`);

  return {
    userId,
    eventCount,
    touchedTopicIds,
    createdTopicIds,
    stats,
    topicCount,
    totalEventLinks,
    largestTopicSize,
    avgEventsPerTopic,
    reuseRatio,
    creationRatio
  };
}

export default repairRecentEventsForUser;
