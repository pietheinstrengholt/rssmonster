// services/events/reclusterForUser.js
// This service rebuilds semantic event clusters for a user and keeps event-topic links in sync.
// It treats Article.topicId as event-owned denormalization, so behavioral topic evidence stays in ArticleTopic.
import db from '../../models/index.js';
import { Op } from 'sequelize';

import { assignArticleToEvent, EventCache } from '../articles/assignArticleToEvent.js';
import embedArticle from '../articles/embedArticle.js';
import {
  RECENCY_WINDOW_DAYS
} from '../config/semanticConfig.js';
import { logEventProcessingSummary } from './eventPipelineDebug.js';
import {
  computeEventStrength,
  reconcileTouchedEvents
} from './eventReconciliation.js';
import {
  assignTopicsForEvents,
  EVENT_TOPIC_TYPES
} from './eventTopicAssignment.js';
import { recomputeTopicStatsForUser } from '../topics/topicStats.service.js';

const { Article, Event, Topic, ArticleTopic, EventTopic } = db;

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

// This function counts how many replayed articles ended up assigned to events.
async function summarizeArticleAssignments(articleIds) {
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

// This function embeds, assigns, reconciles, and summarizes article-to-event clustering for one pass.
async function assignAndReconcile(userId, articles, label, options = {}) {
  const { skipTopicAssignment = false } = options;
  const touchedEventIds = new Set();
  const touchedTopicIds = new Set();
  const runContext = {
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

  const cache = await EventCache.forUser(userId);

  const topicsCache = await db.Topic.findAll({
    where: {
      userId,
      topicType: { [Op.in]: EVENT_TOPIC_TYPES }
    },
    order: [['updatedAt', 'DESC']]
  });

  let reusedEmbeddingCount = 0;
  let generatedEmbeddingCount = 0;

  const embedResults = await Promise.all(
    articles.map(async article => {
      if (hasStoredArticleVector(article)) {
        reusedEmbeddingCount++;

        return {
          eventVector: article.articleVector,
          embedding_model: article.embedding_model || null
        };
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
      `[EVENT] ${label}: embeddings reused=${reusedEmbeddingCount} generated=${generatedEmbeddingCount}`
    );
  }

  for (let i = 0; i < articles.length; i++) {
    const vectors = embedResults[i];
    if (!vectors?.eventVector) {
      runContext.stats.eventVectorSkippedCount++;
      continue;
    }

    const eventId = await assignArticleToEvent(
      articles[i],
      cache,
      vectors,
      topicsCache,
      runContext,
      {
        assignmentContext: label === 'replay' ? 'replay' : 'incremental',
        skipTopicAssignment: true
      }
    );

    if (eventId) {
      touchedEventIds.add(eventId);
    }
  }

  const assignmentSummary = [
    `newEvents=${runContext.stats.newEventsCreatedCount}`,
    `linkedToExisting=${runContext.stats.linkedToExistingEventCount}`,
    `topicOnlyNoVector=${runContext.stats.topicOnlyNoVectorCount}`,
    `topicOnlyInsufficient=${runContext.stats.topicOnlyInsufficientCandidatesCount}`,
    `eventVectorSkipped=${runContext.stats.eventVectorSkippedCount}`
  ].join(' ');

  console.log(`[EVENT] ${label}: assignment summary ${assignmentSummary}`);

  if (!touchedEventIds.size) {
    await logEventProcessingSummary(userId, articles, runContext);
    console.log(`[EVENT] ${label}: no events created or updated`);
    return [];
  }

  const touchedIds = [...touchedEventIds];

  console.log(
    `[EVENT] ${label}: ${touchedIds.length} events touched ` +
    `(${articles.length} articles assigned)`
  );

  const { articlesByEventId } = await reconcileTouchedEvents(userId, touchedIds);

  await logEventProcessingSummary(userId, articles, runContext);

  if (skipTopicAssignment) {
    return [];
  }

  const reconciledEvents = await Event.findAll({
    where: { id: { [Op.in]: touchedIds } },
    order: [
      ['eventWindowEndAt', 'ASC'],
      ['id', 'ASC']
    ]
  });
  const topicAssignmentResult = await assignTopicsForEvents(userId, reconciledEvents, {
    assignmentContext: label === 'replay' ? 'replay' : 'incremental'
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

  for (const row of touchedEventTopicRows) {
    if (row.topicId != null) touchedTopicIds.add(Number(row.topicId));
  }
  for (const row of touchedArticleTopicRows) {
    if (row.topicId != null) touchedTopicIds.add(Number(row.topicId));
  }

  const touchedTopicList = [...touchedTopicIds];
  await recomputeTopicStatsForUser(
    userId,
    [...new Set([...touchedTopicList, ...topicAssignmentResult.touchedTopicIds])]
  );

  return [...new Set([...touchedTopicList, ...topicAssignmentResult.touchedTopicIds])];
}

// This function assigns recent unread articles that do not yet belong to an event.
export async function incrementalClusterForUser(userId, options = {}) {
  const { skipTopicAssignment = false } = options;
  console.log(`[EVENT] Incremental clustering for user ${userId}`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RECENCY_WINDOW_DAYS);

  const latestEvent = await Event.findOne({
    where: { userId },
    attributes: ['updatedAt'],
    order: [['updatedAt', 'DESC']]
  });
  const eventHighWaterAt = latestEvent?.updatedAt ?? null;

  const articleWhere = {
    status: 'unread',
    userId,
    eventId: null,
    published: { [Op.gte]: cutoffDate }
  };

  if (eventHighWaterAt) {
    articleWhere.createdAt = { [Op.gt]: eventHighWaterAt };
  }

  const articles = await Article.findAll({
    where: articleWhere,
    order: [
      ['published', 'ASC'],
      ['id', 'ASC']
    ]
  });

  if (!articles.length) {
    console.log('[EVENT] No unclustered articles - nothing to do');
    return;
  }

  console.log(`[EVENT] ${articles.length} unclustered articles to assign`);

  await assignAndReconcile(userId, articles, 'incremental', {
    skipTopicAssignment
  });

  console.log(`[EVENT] Finished incremental pass for user ${userId}`);
}

// This function replays the recent article window and rebuilds affected events and event topics.
export async function reclusterForUser(userId, options = {}) {
  const { skipTopicAssignment = false } = options;
  console.log(`[EVENT] Window replay clustering for user ${userId}`);

  await clearForeignEventReferencesForUser(userId);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RECENCY_WINDOW_DAYS);

  const windowArticles = await Article.findAll({
    where: {
      userId,
      published: { [Op.gte]: cutoffDate }
    },
    order: [
      ['published', 'ASC'],
      ['id', 'ASC']
    ]
  });

  if (!windowArticles.length) {
    console.log('[EVENT] No vectorized articles in recency window - nothing to do');
    return;
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
    { where: { id: { [Op.in]: windowArticleIds } } }
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
        where: { eventId, userId }
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

  const newTouchedTopicIds = await assignAndReconcile(userId, windowArticles, 'replay', {
    skipTopicAssignment
  });

  if (!skipTopicAssignment) {
    await recomputeTopicStatsForUser(userId, [...new Set([...staleTopicIds, ...newTouchedTopicIds])]);
  }

  const summary = await summarizeArticleAssignments(windowArticleIds);

  console.log(
    `[EVENT] User ${userId} replay summary: ` +
    `articles=${summary.totalArticles} ` +
    `articlesWithEvents=${summary.assignedArticles} ` +
    `events=${summary.eventCount} ` +
    `eventCoverage=${summary.assignedPct}%`
  );

  console.log(
    `[EVENT] Finished window replay for user ${userId}` +
    ` (window=${RECENCY_WINDOW_DAYS}d, articles=${windowArticles.length},` +
    ` pruned=${deletedCount})`
  );
}

// This function rebuilds only event and hybrid topic assignments for a user.
// Behavioral topics are left intact because they are maintained by buildBehavioralTopics.js.
export async function rebuildTopicsForUser(userId, options = {}) {
  const { assignmentContext = 'replay' } = options;

  console.log(`[TOPIC] Rebuilding topics for user ${userId}`);

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

  console.log(`[TOPIC] === Topic Build Summary for user ${userId} ===`);
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
}

export default reclusterForUser;
