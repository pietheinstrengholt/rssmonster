// services/reconcile/semanticPipelineScopes.js
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
import { reconcileTouchedEvents } from '../events/eventReconciliation.js';
import { HOUR_MS } from '../events/articleEventTime.js';
import { recordProcessingFailure } from '../observability/processingFailures.js';
import { tryEnqueueGeneratedSemanticLabelJobsForUser } from '../semanticLabels/semanticLabelJobs.js';
import { debugSemanticLog } from '../observability/semanticLogging.js';

// Provides the shared dependencies used by this service.
const { Article, Event, Feed } = db;
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
    embedding_model: vectors?.eventVector ? vectors.embedding_model ?? null : plainArticle.embedding_model ?? null,
    eventVector: vectors?.eventVector || plainArticle.articleVector || null
  };
}

// This function builds the structured assignment summary returned to post-crawl callers.
function buildAssignmentResult({
  userId,
  mode,
  articles,
  touchedEventIds,
  runContext,
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
    createdEventIds: [...new Set([...(runContext.newEventIds || [])]
      .map(Number)
      .filter(Boolean))],
    newEventsCreatedCount: Number(runContext.stats.newEventsCreatedCount || 0),
    linkedToExistingEventCount: Number(runContext.stats.linkedToExistingEventCount || 0),
    unassignedCount,
    durations: durations || { eventsMs: 0 },
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
      eventlessNoVectorCount: 0,
      eventlessInsufficientCandidatesCount: 0,
      eventVectorSkippedCount: 0
    }
  };
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
  runContext,
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
      runContext,
      {
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
    `eventlessNoVector=${runContext.stats.eventlessNoVectorCount}`,
    `eventlessInsufficient=${runContext.stats.eventlessInsufficientCandidatesCount}`,
    `eventVectorSkipped=${runContext.stats.eventVectorSkippedCount}`
  ].join(' ');
}

// This function orchestrates one scoped event assignment pass.
async function runEventAssignmentPass(userId, articles, scope, options = {}) {
  const passStartedAt = Date.now();
  const {
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
      durations: { eventsMs: Date.now() - passStartedAt }
    });
  }

  // Collects the touched id while performing run event assignment pass.
  const touchedIds = [...touchedEventIds];

  debugSemanticLog('event',
    `[EVENT] ${scope}: ${touchedIds.length} events touched ` +
    `(${articles.length} articles assigned)`
  );

  // Derives the values through reconcile touched events while performing run event assignment pass.
  await reconcileTouchedEvents(userId, touchedIds);
  const eventsDurationMs = Date.now() - passStartedAt;

  await logEventProcessingSummary(userId, articles, runContext);

  return buildAssignmentResult({
    userId, mode: scope, articles, touchedEventIds, runContext,
    durations: { eventsMs: eventsDurationMs }
  });
}

// This function runs the incremental event scope for recent articles that do not yet belong to an event.
async function runIncrementalEventsForUserInternal(userId, options = {}) {
  const {
    createdAtFrom = null,
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
      createdEventIds: [],
      newEventsCreatedCount: 0,
      linkedToExistingEventCount: 0,
      unassignedCount: 0,
      durations: { eventsMs: 0 },
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
    if (result.createdEventIds.length) {
      await tryEnqueueGeneratedSemanticLabelJobsForUser(userId, {
        eventIds: result.createdEventIds,
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
export async function repairRecentEventsForUser(userId, _options = {}) {
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
      createdEventIds: [],
      newEventsCreatedCount: 0,
      linkedToExistingEventCount: 0,
      unassignedCount: 0,
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

  await Article.update(
    { eventId: null },
    { where: { id: { [Op.in]: windowArticleIds }, ...canonicalArticleWhere() } }
  );

  let deletedCount = 0;

  if (ownedPreviousEventIds.size) {
    const retainedEventRows = await Article.findAll({
      where: {
        eventId: { [Op.in]: ownedPreviousEventIdList },
        userId,
        ...canonicalArticleWhere()
      },
      attributes: ['eventId'],
      group: ['eventId'],
      raw: true
    });
    const retainedEventIds = new Set(
      retainedEventRows.map(row => Number(row.eventId)).filter(Number.isFinite)
    );
    const emptyEventIds = ownedPreviousEventIdList.filter(id => !retainedEventIds.has(id));

    if (emptyEventIds.length) {
      deletedCount = await Event.destroy({
        where: { id: { [Op.in]: emptyEventIds }, userId }
      });
    }
  }

  // Handles the case where deleted count is available.
  if (deletedCount) {
    debugSemanticLog('event', `[EVENT] Removed ${deletedCount} empty events`);
  }

  // Derives the repair result through run event assignment pass while performing repair recent events for user.
  const repairResult = await runEventAssignmentPass(userId, windowArticles, 'recent-repair', {
  });

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

  if (repairResult.createdEventIds.length) {
    await tryEnqueueGeneratedSemanticLabelJobsForUser(userId, {
      eventIds: repairResult.createdEventIds,
    });
  }

  return repairResult;
}

// This function backfills missing historical events from all vectorized articles for a user.
export async function backfillHistoricalEventsForUser(userId, options = {}) {
  const {
    batchSize = 250
  } = options;

  debugSemanticLog('event', `[EVENT] Historical event backfill for user ${userId}`);

  await clearForeignEventReferencesForUser(userId);

  let lastId = 0;
  let totalProcessed = 0;
  // Collects the touched event id while performing backfill historical events for user.
  let touchedEventIds = [];
  let createdEventIds = [];
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
        useTemporalEventCandidates: true
      }
    );

    touchedEventIds = [...new Set([...touchedEventIds, ...batchResult.touchedEventIds])];
    createdEventIds = [...new Set([...createdEventIds, ...batchResult.createdEventIds])];
    newEventsCreatedCount += batchResult.newEventsCreatedCount;
    linkedToExistingEventCount += batchResult.linkedToExistingEventCount;
    unassignedCount += batchResult.unassignedCount;
    totalProcessed += articles.length;
    lastId = articles[articles.length - 1].id;

    debugSemanticLog('event', `[EVENT] Historical backfill processed=${totalProcessed}, lastId=${lastId}`);
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
    createdEventIds,
    newEventsCreatedCount,
    linkedToExistingEventCount,
    unassignedCount,
  };

  if (result.createdEventIds.length) {
    await tryEnqueueGeneratedSemanticLabelJobsForUser(userId, {
      eventIds: result.createdEventIds,
    });
  }

  return result;
}
