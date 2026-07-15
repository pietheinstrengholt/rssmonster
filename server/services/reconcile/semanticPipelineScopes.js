// services/reconcile/semanticPipelineScopes.js
// This service exposes explicit semantic pipeline scopes for events and event-topic assignment.
// It treats Article.topicId as event-owned denormalization, so behavioral topic evidence stays in ArticleTopic.
import db from '../../models/index.js';
import { Op } from 'sequelize';

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

const { Article, Event, Feed, Topic, ArticleTopic, EventTopic } = db;
const CACHE_BUFFER_HOURS = Number.parseInt(process.env.EVENT_CACHE_BUFFER_HOURS || '2', 10);

// This function returns the rolling event cache horizon used for incremental post-crawl event assignment.
function rollingEventWindowHours() {
  return EVENT_MAX_GAP_HOURS + CACHE_BUFFER_HOURS;
}

// This function returns the latest event-time timestamp from articles in one event assignment batch.
function latestArticleEventDate(articles = []) {
  const timestamps = articles
    .flatMap(article => [article.published, article.createdAt])
    .map(value => value ? new Date(value).getTime() : null)
    .filter(Number.isFinite);

  if (!timestamps.length) return new Date();

  return new Date(Math.max(...timestamps));
}

// This function builds a cacheable article candidate record from a Sequelize article and vector result.
function cacheRecordForArticle(article, vectors) {
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
  topicAssignment = null
}) {
  const assignedArticleCount = articles.filter(article => article.eventId != null).length;
  const unassignedCount = Math.max(articles.length - assignedArticleCount, 0);

  return {
    userId,
    mode,
    articleCount: articles.length,
    touchedEventIds: [...new Set([...touchedEventIds].map(Number).filter(Boolean))],
    touchedTopicIds: [...new Set(touchedTopicIds.map(Number).filter(Boolean))],
    newEventsCreatedCount: Number(runContext.stats.newEventsCreatedCount || 0),
    linkedToExistingEventCount: Number(runContext.stats.linkedToExistingEventCount || 0),
    unassignedCount,
    topicAssignment: topicAssignment || {
      skipped: true,
      eventCount: 0,
      touchedTopicIds: [],
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

  if (affectedCount) {
    console.log(`[EVENT] Cleared ${affectedCount} foreign event references for user ${userId}`);
  }
}

// This function counts how many scoped articles ended up assigned to events.
async function summarizeArticleAssignments(userId, articleIds) {
  if (!articleIds.length) {
    return {
      totalArticles: 0,
      assignedArticles: 0,
      eventCount: 0,
      assignedPct: 0
    };
  }

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
  const eventCount = new Set(assignedRows.map(row => row.eventId)).size;
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
  return scope === 'incremental' ? 'incremental' : scope;
}

// This function embeds missing article vectors for one event assignment pass.
async function embedArticlesForEventAssignment(articles, scope) {
  let reusedEmbeddingCount = 0;
  let generatedEmbeddingCount = 0;

  const vectorsByIndex = await Promise.all(
    articles.map(async article => {
      if (hasStoredArticleVector(article)) {
        reusedEmbeddingCount++;

        return {
          eventVector: article.articleVector,
          embedding_model: article.embedding_model || null
        };
      }

      if (!canGenerateEmbeddingForArticle(article)) {
        return null;
      }

      const vectors = await embedArticle(article, { persist: true });

      if (!vectors?.eventVector) {
        return vectors;
      }

      generatedEmbeddingCount++;

      return vectors;
    })
  );

  if (reusedEmbeddingCount || generatedEmbeddingCount) {
    console.log(
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
  const touchedEventIds = new Set();

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const vectors = vectorsByIndex[i];
    if (!vectors?.eventVector) {
      runContext.stats.eventVectorSkippedCount++;
      continue;
    }

    const eventCache = useTemporalEventCandidates
      ? await EventCache.forArticle(article)
      : cache;

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
  const reconciledEvents = await Event.findAll({
    where: { id: { [Op.in]: touchedIds } },
    order: [
      ['eventWindowEndAt', 'ASC'],
      ['id', 'ASC']
    ]
  });
  const topicAssignmentResult = await assignTopicsForEvents(userId, reconciledEvents, {
    assignmentContext: topicAssignmentContextForScope(scope)
  });

  const primaryEventTopics = await EventTopic.findAll({
    where: {
      eventId: { [Op.in]: touchedIds },
      primaryInd: true
    },
    attributes: ['eventId', 'topicId'],
    raw: true
  });
  const topicIdByEventId = Object.fromEntries(
    primaryEventTopics.map(row => [Number(row.eventId), Number(row.topicId)])
  );
  const primaryTopicIds = [
    ...new Set(primaryEventTopics.map(row => Number(row.topicId)).filter(Boolean))
  ];
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
  const topicSizeMap = Object.fromEntries(
    topicRows.map(row => [Number(row.topicId), Number(row.eventCount)])
  );

  await Promise.all(
    reconciledEvents.map(event => {
      const articleCount = articlesByEventId[event.id]?.length || Number(event.articleCount || 0);
      const eventPrimaryTopicId = topicIdByEventId[event.id] ?? null;
      const topicEventCount = eventPrimaryTopicId ? (topicSizeMap[eventPrimaryTopicId] ?? 1) : 1;
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

  const touchedEventTopicRows = await EventTopic.findAll({
    where: { eventId: { [Op.in]: touchedIds } },
    attributes: ['topicId'],
    raw: true
  });

  const touchedArticleIds = articles.map(article => article.id);
  const touchedArticleTopicRows = touchedArticleIds.length
    ? await ArticleTopic.findAll({
      where: { articleId: { [Op.in]: touchedArticleIds } },
      attributes: ['topicId'],
      raw: true
    })
    : [];

  const touchedTopicIds = new Set();
  for (const row of touchedEventTopicRows) {
    if (row.topicId != null) touchedTopicIds.add(Number(row.topicId));
  }
  for (const row of touchedArticleTopicRows) {
    if (row.topicId != null) touchedTopicIds.add(Number(row.topicId));
  }

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
  const {
    skipTopicAssignment = false,
    useTemporalEventCandidates = false,
    eventCacheWindowHours = null,
    articleCandidateCache = null
  } = options;
  const runContext = createEventAssignmentContext();

  const cache = useTemporalEventCandidates
    ? null
    : await EventCache.forUser(userId, { windowHours: eventCacheWindowHours });

  const topicsCache = await db.Topic.findAll({
    where: {
      userId,
      topicType: { [Op.in]: EVENT_TOPIC_TYPES }
    },
    order: [['updatedAt', 'DESC']]
  });

  const vectorsByIndex = await embedArticlesForEventAssignment(articles, scope);
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

  const assignmentSummary = formatEventAssignmentSummary(runContext);

  console.log(`[EVENT] ${scope}: assignment summary ${assignmentSummary}`);

  if (!touchedEventIds.size) {
    await logEventProcessingSummary(userId, articles, runContext);
    console.log(`[EVENT] ${scope}: no events created or updated`);
    return buildAssignmentResult({
      userId,
      mode: scope,
      articles,
      touchedEventIds,
      runContext
    });
  }

  const touchedIds = [...touchedEventIds];

  console.log(
    `[EVENT] ${scope}: ${touchedIds.length} events touched ` +
    `(${articles.length} articles assigned)`
  );

  const { articlesByEventId } = await reconcileTouchedEvents(userId, touchedIds);

  await logEventProcessingSummary(userId, articles, runContext);

  if (skipTopicAssignment) {
    return buildAssignmentResult({
      userId,
      mode: scope,
      articles,
      touchedEventIds,
      runContext
    });
  }

  const topicAssignment = await assignTopicsForTouchedEvents({
    userId,
    articles,
    touchedIds,
    articlesByEventId,
    scope
  });

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
    }
  });
}

// This function runs the incremental event scope for recent unread articles that do not yet belong to an event.
export async function runIncrementalEventsForUser(userId, options = {}) {
  const { createdAfter = null, skipTopicAssignment = false } = options;
  console.log(`[EVENT] Incremental event assignment for user ${userId}`);

  const cacheWindowHours = rollingEventWindowHours();
  const cutoffDate = new Date(Date.now() - cacheWindowHours * HOUR_MS);

  const articleWhere = {
    status: 'unread',
    userId,
    ...canonicalArticleWhere(),
    filteredInd: false,
    eventId: null
  };

  if (createdAfter) {
    articleWhere.createdAt = { [Op.gte]: createdAfter };
  } else {
    articleWhere.published = { [Op.gte]: cutoffDate };
  }

  const articles = await Article.findAll({
    where: articleWhere,
    include: [{
      model: Feed,
      attributes: ['generateEmbeddings'],
      required: false
    }],
    order: [
      ['published', 'ASC'],
      ['id', 'ASC']
    ]
  });

  if (!articles.length) {
    console.log('[EVENT] No unclustered articles - nothing to do');
    return {
      userId,
      mode: 'incremental',
      articleCount: 0,
      touchedEventIds: [],
      touchedTopicIds: [],
      newEventsCreatedCount: 0,
      linkedToExistingEventCount: 0,
      unassignedCount: 0,
      topicAssignment: {
        skipped: skipTopicAssignment,
        eventCount: 0,
        touchedTopicIds: [],
        stats: {
          eventsSkipped: 0,
          eventsMatched: 0,
          eventsUnmatched: 0,
          newTopicsCreated: 0
        }
      }
    };
  }

  console.log(`[EVENT] ${articles.length} unclustered articles to assign`);
  const cacheReferenceDate = latestArticleEventDate(articles);

  const articleCandidateCache = await ArticleEventCandidateCache.forUser(userId, {
    excludeArticleIds: articles.map(article => article.id),
    referenceDate: cacheReferenceDate
  });

  const result = await runEventAssignmentPass(userId, articles, 'incremental', {
    skipTopicAssignment,
    eventCacheWindowHours: cacheWindowHours,
    articleCandidateCache
  });

  articleCandidateCache.removeExpired(cacheReferenceDate);

  console.log(`[EVENT] Finished incremental pass for user ${userId}`);

  return result;
}

// This function runs the recent-repair event scope over the configured recency window.
export async function repairRecentEventsForUser(userId, options = {}) {
  const { skipTopicAssignment = false } = options;
  console.log(`[EVENT] Recent-repair event assignment for user ${userId}`);

  await clearForeignEventReferencesForUser(userId);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RECENCY_WINDOW_DAYS);

  const windowArticles = await Article.findAll({
    where: {
      userId,
      ...canonicalArticleWhere(),
      published: { [Op.gte]: cutoffDate }
    },
    include: [{
      model: Feed,
      attributes: ['generateEmbeddings'],
      required: false
    }],
    order: [
      ['published', 'ASC'],
      ['id', 'ASC']
    ]
  });

  if (!windowArticles.length) {
    console.log('[EVENT] No vectorized articles in recency window - nothing to do');
    return {
      userId,
      mode: 'recent-repair',
      articleCount: 0,
      touchedEventIds: [],
      touchedTopicIds: [],
      newEventsCreatedCount: 0,
      linkedToExistingEventCount: 0,
      unassignedCount: 0,
      topicAssignment: {
        skipped: skipTopicAssignment,
        eventCount: 0,
        touchedTopicIds: [],
        stats: {
          eventsSkipped: 0,
          eventsMatched: 0,
          eventsUnmatched: 0,
          newTopicsCreated: 0
        }
      }
    };
  }

  const previousEventIds = new Set(
    windowArticles
      .filter(a => a.eventId != null)
      .map(a => Number(a.eventId))
      .filter(Number.isFinite)
  );

  const windowArticleIds = windowArticles.map(a => a.id);
  const previousEventIdList = [...previousEventIds];
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
  const ownedPreviousEventIds = new Set(
    ownedPreviousEventRows.map(event => Number(event.id)).filter(Number.isFinite)
  );
  const ownedPreviousEventIdList = [...ownedPreviousEventIds];

  console.log(
    `[EVENT] ${windowArticles.length} articles in ` +
    `${RECENCY_WINDOW_DAYS}-day window ` +
    `(${ownedPreviousEventIds.size}/${previousEventIds.size} events affected)`
  );

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

  const previousEventTopicRows = ownedPreviousEventIds.size
    ? await EventTopic.findAll({
      where: { eventId: { [Op.in]: ownedPreviousEventIdList } },
      attributes: ['topicId'],
      raw: true
    })
    : [];

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

  if (ownedPreviousEventIds.size) {
    await EventTopic.destroy({
      where: { eventId: { [Op.in]: ownedPreviousEventIdList } }
    });
  }

  let deletedCount = 0;

  if (ownedPreviousEventIds.size) {
    for (const eventId of ownedPreviousEventIds) {
      const remaining = await Article.count({
        where: { eventId, userId, ...canonicalArticleWhere() }
      });

      if (remaining === 0) {
        await Event.destroy({ where: { id: eventId, userId } });
        deletedCount++;
      }
    }
  }

  if (deletedCount) {
    console.log(`[EVENT] Removed ${deletedCount} empty events`);
  }

  const repairResult = await runEventAssignmentPass(userId, windowArticles, 'recent-repair', {
    skipTopicAssignment
  });

  if (!skipTopicAssignment) {
    await recomputeTopicStatsForUser(userId, [...new Set([...staleTopicIds, ...repairResult.touchedTopicIds])]);
  }

  const summary = await summarizeArticleAssignments(userId, windowArticleIds);

  console.log(
    `[EVENT] User ${userId} recent-repair summary: ` +
    `articles=${summary.totalArticles} ` +
    `articlesWithEvents=${summary.assignedArticles} ` +
    `events=${summary.eventCount} ` +
    `eventCoverage=${summary.assignedPct}%`
  );

  console.log(
    `[EVENT] Finished recent-repair event pass for user ${userId}` +
    ` (window=${RECENCY_WINDOW_DAYS}d, articles=${windowArticles.length},` +
    ` pruned=${deletedCount})`
  );

  return repairResult;
}

// This function runs the full-rebuild event scope over all vectorized articles for a user.
export async function rebuildAllEventsForUser(userId, options = {}) {
  const {
    skipTopicAssignment = false,
    batchSize = 250
  } = options;

  console.log(`[EVENT] Full-rebuild event assignment for user ${userId}`);

  await clearForeignEventReferencesForUser(userId);

  let lastId = 0;
  let totalProcessed = 0;
  let touchedTopicIds = [];
  let touchedEventIds = [];
  let newEventsCreatedCount = 0;
  let linkedToExistingEventCount = 0;
  let unassignedCount = 0;

  while (true) {
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

    if (!articles.length) {
      break;
    }

    const batchResult = await runEventAssignmentPass(
      userId,
      articles,
      'full-rebuild',
      {
        skipTopicAssignment,
        useTemporalEventCandidates: true
      }
    );

    touchedTopicIds = [...new Set([...touchedTopicIds, ...batchResult.touchedTopicIds])];
    touchedEventIds = [...new Set([...touchedEventIds, ...batchResult.touchedEventIds])];
    newEventsCreatedCount += batchResult.newEventsCreatedCount;
    linkedToExistingEventCount += batchResult.linkedToExistingEventCount;
    unassignedCount += batchResult.unassignedCount;
    totalProcessed += articles.length;
    lastId = articles[articles.length - 1].id;

    console.log(`[EVENT] Full-rebuild processed=${totalProcessed}, lastId=${lastId}`);
  }

  if (!skipTopicAssignment && touchedTopicIds.length) {
    await recomputeTopicStatsForUser(userId, touchedTopicIds);
  }

  console.log(
    `[EVENT] Finished full-rebuild event assignment for user ${userId}, ` +
    `articles=${totalProcessed}`
  );

  return {
    userId,
    mode: 'full-rebuild',
    articleCount: totalProcessed,
    touchedEventIds,
    touchedTopicIds,
    newEventsCreatedCount,
    linkedToExistingEventCount,
    unassignedCount,
    topicAssignment: {
      skipped: skipTopicAssignment,
      eventCount: touchedEventIds.length,
      touchedTopicIds,
      stats: {
        eventsSkipped: 0,
        eventsMatched: 0,
        eventsUnmatched: 0,
        newTopicsCreated: 0
      }
    }
  };
}

// This function runs the full-rebuild topic scope for event and hybrid topic assignments for a user.
// Behavioral topics are left intact because they are maintained by calibrateBehavioralTopics.js.
export async function rebuildAllTopicsForUser(userId, options = {}) {
  const { assignmentContext = 'full-rebuild' } = options;

  console.log(`[TOPIC] Full-rebuild topics for user ${userId}`);

  const userTopics = await Topic.findAll({
    where: {
      userId,
      topicType: { [Op.in]: EVENT_TOPIC_TYPES }
    },
    attributes: ['id'],
    raw: true
  });
  const existingTopicIds = userTopics.map(topic => Number(topic.id)).filter(Boolean);

  const events = await Event.findAll({
    where: { userId },
    order: [
      ['eventWindowEndAt', 'ASC'],
      ['id', 'ASC']
    ]
  });

  await EventTopic.destroy({
    where: {
      eventId: {
        [Op.in]: events.map(event => event.id)
      }
    }
  });

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

  const { eventCount, touchedTopicIds, stats } = await assignTopicsForEvents(userId, events, {
    assignmentContext
  });

  await recomputeTopicStatsForUser(
    userId,
    [...new Set([...existingTopicIds, ...touchedTopicIds])]
  );

  const allUserTopics = await Topic.findAll({
    where: {
      userId,
      topicType: { [Op.in]: EVENT_TOPIC_TYPES }
    },
    attributes: ['id', 'eventCount'],
    raw: true
  });

  const topicCount = allUserTopics.length;
  const totalEventLinks = allUserTopics.reduce((sum, t) => sum + (t.eventCount || 0), 0);
  const largestTopicSize = allUserTopics.reduce((max, t) => Math.max(max, t.eventCount || 0), 0);
  const avgEventsPerTopic = topicCount ? (totalEventLinks / topicCount).toFixed(1) : '0';
  const assignableEvents = eventCount - stats.eventsSkipped;
  const reuseRatio = assignableEvents > 0
    ? ((stats.eventsMatched / assignableEvents) * 100).toFixed(1)
    : '0';
  const creationRatio = assignableEvents > 0
    ? ((stats.newTopicsCreated / assignableEvents) * 100).toFixed(1)
    : '0';

  console.log(`[TOPIC] === Topic Rebuild Summary for user ${userId} ===`);
  console.log(`[TOPIC] Active topics          ${topicCount}`);
  console.log(`[TOPIC] Events processed       ${eventCount}`);
  console.log(`[TOPIC] Events matched         ${stats.eventsMatched}`);
  console.log(`[TOPIC] Events unmatched       ${stats.eventsUnmatched}`);
  console.log(`[TOPIC] Events skipped         ${stats.eventsSkipped} (no vector)`);
  console.log(`[TOPIC] New topics created     ${stats.newTopicsCreated}`);
  console.log(`[TOPIC] Average events/topic   ${avgEventsPerTopic}`);
  console.log(`[TOPIC] Largest topic size     ${largestTopicSize} events`);
  console.log(`[TOPIC] Topic reuse ratio      ${reuseRatio}%`);
  console.log(`[TOPIC] Topic creation ratio   ${creationRatio}%`);

  return {
    userId,
    eventCount,
    touchedTopicIds,
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
