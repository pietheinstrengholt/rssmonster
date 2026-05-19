// services/events/reclusterForUser.js
import db from '../../models/index.js';
import { Op } from 'sequelize';

import { assignArticleToEvent, EventCache } from './assignArticleToEvent.js';
import embedArticle from './embedArticle.js';
import {
  RECENCY_WINDOW_DAYS,
  EVENT_STRENGTH_CONFIG,
  MAX_CANDIDATES,
  EVENT_LIFECYCLE
} from './semanticConfig.js';

const { Article, Event, Topic } = db;

function resolveEventStatus(articleCount, lastSeenAt) {
  const now = Date.now();
  const lastSeenTs = lastSeenAt ? new Date(lastSeenAt).getTime() : null;

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

function buildRecencyWeightedVector(eventArticles) {
  const embedded = eventArticles.filter(a => Array.isArray(a.eventVector));
  if (!embedded.length) return null;

  const sorted = embedded
    .slice()
    .sort((a, b) => new Date(b.published || 0).getTime() - new Date(a.published || 0).getTime())
    .slice(0, 24);

  const newestTs = new Date(sorted[0].published || 0).getTime();
  const dim = sorted[0].eventVector.length;

  const weighted = Array(dim).fill(0);
  let totalWeight = 0;

  for (const article of sorted) {
    const ts = new Date(article.published || 0).getTime();
    const ageHours = Math.max(0, (newestTs - ts) / (1000 * 60 * 60));
    const weight = Math.pow(0.5, ageHours / 12);

    totalWeight += weight;
    for (let i = 0; i < dim; i++) {
      weighted[i] += article.eventVector[i] * weight;
    }
  }

  if (!totalWeight) return sorted[0].eventVector;

  return weighted.map(value => value / totalWeight);
}

function computeEventStrength({
  articleCount,
  topicEventCount
}) {
  const redundancyScore = Math.min(
    articleCount / EVENT_STRENGTH_CONFIG.maxArticleRedundancyCount,
    1
  );

  const topicScore = Math.min(
    Math.log2((topicEventCount ?? 1) + 1) / EVENT_STRENGTH_CONFIG.maxTopicEventLogBase,
    1
  );

  const cohesionScore = EVENT_STRENGTH_CONFIG.cohesionBaseline;

  return Number((
    redundancyScore * EVENT_STRENGTH_CONFIG.weights.redundancy +
    cohesionScore   * EVENT_STRENGTH_CONFIG.weights.cohesion +
    topicScore      * EVENT_STRENGTH_CONFIG.weights.topic
  ).toFixed(3));
}

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

async function assignAndReconcile(userId, articles, label) {
  const touchedEventIds = new Set();
  const runContext = {
    records: [],
    indexById: new Map()
  };

  const cache = await EventCache.forUser(userId);
  
  // Pre-fetch topics cache once to avoid N queries during topic assignment
  const topicsCache = await db.Topic.findAll({
    where: { userId },
    order: [['updatedAt', 'DESC']],
    limit: MAX_CANDIDATES
  });

  // Batch embed all articles in parallel for speed
  const embedResults = await Promise.all(
    articles.map(article =>
      embedArticle({
        title: article.title,
        contentStripped: article.contentStripped || article.description || ''
      })
    )
  );

  // Assign articles to events (sequential to prevent cache race conditions)
  for (let i = 0; i < articles.length; i++) {
    const vectors = embedResults[i];
    if (!vectors?.eventVector) continue;

    // Pass article object and topicsCache to avoid redundant fetch; eventId returned
    const eventId = await assignArticleToEvent(articles[i], cache, vectors, topicsCache, runContext);

    if (eventId) {
      touchedEventIds.add(eventId);
    }
  }

  if (!touchedEventIds.size) {
    console.log(`[EVENT] ${label}: no events created or updated`);
    return;
  }

  const touchedIds = [...touchedEventIds];

  console.log(
    `[EVENT] ${label}: ${touchedIds.length} events touched ` +
    `(${articles.length} articles assigned)`
  );

  // Sync article topicIds to their events' topicIds in parallel
  const eventsWithTopics = await Event.findAll({
    where: { id: { [Op.in]: touchedIds } },
    attributes: ['id', 'topicId']
  });

  // Group events by topicId and sync in single batch operations
  const topicIdUpdates = {};
  for (const event of eventsWithTopics) {
    if (event.topicId != null) {
      if (!topicIdUpdates[event.topicId]) {
        topicIdUpdates[event.topicId] = [];
      }
      topicIdUpdates[event.topicId].push(event.id);
    }
  }

  // Update all articles for each topicId in parallel
  await Promise.all(
    Object.entries(topicIdUpdates).map(([topicId, eventIds]) =>
      Article.update(
        { topicId: Number(topicId) },
        { where: { eventId: { [Op.in]: eventIds } } }
      )
    )
  );

  const events = await Event.findAll({
    where: { id: { [Op.in]: touchedIds } }
  });

  // Batch fetch all articles for all touched events in a single query
  const allEventArticles = await Article.findAll({
    where: { eventId: { [Op.in]: touchedIds } },
    attributes: [
      'id',
      'eventId',
      'published',
      'eventVector'
    ]
  });

  // Group articles by eventId for efficient access
  const articlesByEventId = {};
  for (const article of allEventArticles) {
    if (!articlesByEventId[article.eventId]) {
      articlesByEventId[article.eventId] = [];
    }
    articlesByEventId[article.eventId].push(article);
  }

  for (const event of events) {
    const eventArticles = articlesByEventId[event.id] || [];

    if (!eventArticles.length) {
      await event.destroy();
      continue;
    }

    const eventVector = buildRecencyWeightedVector(eventArticles);

    const timestamps = eventArticles
      .map(a => a.published)
      .filter(Boolean)
      .map(d => new Date(d).getTime())
      .sort((a, b) => a - b);

    const firstSeen = timestamps.length ? new Date(timestamps[0]) : null;
    const lastSeen = timestamps.length ? new Date(timestamps[timestamps.length - 1]) : null;
    const status = resolveEventStatus(eventArticles.length, lastSeen);

    await event.update({
      articleCount: eventArticles.length,
      eventVector,
      firstSeen,
      lastSeen,
      status
    });

    console.log(
      `[EVENT] Reconciled event ${event.id}` +
      ` articles=${eventArticles.length}`
    );
  }

  const touchedTopicIds = [
    ...new Set(
      events.filter(e => e.topicId != null).map(e => e.topicId)
    )
  ];

  let topicSizeMap = {};

  if (touchedTopicIds.length) {
    const topicRows = await Event.findAll({
      where: {
        userId,
        topicId: { [Op.in]: touchedTopicIds }
      },
      attributes: [
        'topicId',
        [db.sequelize.fn('COUNT', '*'), 'eventCount']
      ],
      group: ['topicId'],
      raw: true
    });

    topicSizeMap = Object.fromEntries(
      topicRows.map(r => [Number(r.topicId), Number(r.eventCount)])
    );
  }

  const finalEvents = events; // Reuse events already fetched

  // Use already-fetched articles to compute counts and updates in parallel
  await Promise.all(
    finalEvents.map(async event => {
      const eventArticlesList = articlesByEventId[event.id] || [];
      const articleCount = eventArticlesList.length;

      if (articleCount === 0) {
        return event.destroy();
      }

      const topicEventCount = topicSizeMap[event.topicId] ?? 1;

      const strength = computeEventStrength({
        articleCount,
        topicEventCount
      });

      // Update event and sync article topicIds in parallel
      return Promise.all([
        event.update({
          articleCount,
          eventStrength: strength
        }),
        event.topicId != null
          ? Article.update(
              { topicId: event.topicId },
              { where: { eventId: event.id, userId } }
            )
          : Promise.resolve()
      ]);
    })
  );

  if (touchedTopicIds.length) {
    // Batch topic updates in parallel
    await Promise.all(
      touchedTopicIds.map(async topicId => {
        const [articleCount, eventCount, lastEvent] = await Promise.all([
          Article.count({ where: { userId, topicId } }),
          Event.count({ where: { userId, topicId } }),
          Event.findOne({
            where: { userId, topicId },
            order: [['lastSeen', 'DESC']],
            attributes: ['lastSeen']
          })
        ]);

        return Topic.update(
          {
            articleCount,
            eventCount,
            lastActivityAt: lastEvent?.lastSeen || null
          },
          { where: { id: topicId } }
        );
      })
    );
  }
}

export async function incrementalClusterForUser(userId) {
  console.log(`[EVENT] Incremental clustering for user ${userId}`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RECENCY_WINDOW_DAYS);

  const articles = await Article.findAll({
    where: {
      status: 'unread',
      userId,
      eventId: null,
      published: { [Op.gte]: cutoffDate }
    },
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

  await assignAndReconcile(userId, articles, 'incremental');

  console.log(`[EVENT] Finished incremental pass for user ${userId}`);
}

export async function reclusterForUser(userId) {
  console.log(`[EVENT] Window replay clustering for user ${userId}`);

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
      .map(a => a.eventId)
  );

  const windowArticleIds = windowArticles.map(a => a.id);

  console.log(
    `[EVENT] ${windowArticles.length} articles in ` +
    `${RECENCY_WINDOW_DAYS}-day window ` +
    `(${previousEventIds.size} events affected)`
  );

  await Article.update(
    { eventId: null, topicId: null },
    { where: { id: { [Op.in]: windowArticleIds } } }
  );

  let deletedCount = 0;

  if (previousEventIds.size) {
    for (const eventId of previousEventIds) {
      const remaining = await Article.count({
        where: { eventId }
      });

      if (remaining === 0) {
        await Event.destroy({ where: { id: eventId } });
        deletedCount++;
      }
    }
  }

  if (deletedCount) {
    console.log(`[EVENT] Removed ${deletedCount} empty events`);
  }

  await assignAndReconcile(userId, windowArticles, 'replay');

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

export default reclusterForUser;
