// services/events/reclusterForUser.js
import db from '../../models/index.js';
import { Op } from 'sequelize';

import { assignArticleToEvent, EventCache } from './assignArticleToEvent.js';
import embedArticle from '../vector/embedArticle.js';

const { Article, Event, Topic } = db;

const RECENCY_WINDOW_DAYS = parseInt(process.env.RECENCY_WINDOW_DAYS) || 7;

function computeEventStrength({
  articleCount,
  topicEventCount
}) {
  const redundancyScore = Math.min(articleCount / 3, 1);

  const topicScore = Math.min(
    Math.log2((topicEventCount ?? 1) + 1) / 3,
    1
  );

  const cohesionScore = 0.85;

  return Number((
    redundancyScore * 0.45 +
    cohesionScore   * 0.35 +
    topicScore      * 0.20
  ).toFixed(3));
}

async function assignAndReconcile(userId, articles, label) {
  const touchedEventIds = new Set();

  const cache = await EventCache.forUser(userId);

  for (const article of articles) {
    const vectors = await embedArticle({
      title: article.title,
      contentStripped: article.contentStripped || article.description || ''
    });

    if (!vectors?.eventVector) {
      continue;
    }

    await assignArticleToEvent(article.id, cache, vectors);

    const updated = await Article.findByPk(article.id, {
      attributes: ['eventId']
    });

    if (updated?.eventId) {
      touchedEventIds.add(updated.eventId);
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

  const events = await Event.findAll({
    where: { id: { [Op.in]: touchedIds } }
  });

  for (const event of events) {
    const eventArticles = await Article.findAll({
      where: { eventId: event.id }
    });

    if (!eventArticles.length) {
      await event.destroy();
      continue;
    }

    const embedded = eventArticles.filter(
      a => Array.isArray(a.eventVector)
    );

    let eventVector = null;

    if (embedded.length) {
      eventVector = embedded[0].eventVector;

      if (embedded.length > 1) {
        eventVector = eventVector.map((_, i) =>
          embedded.reduce(
            (sum, a) => sum + a.eventVector[i],
            0
          ) / embedded.length
        );
      }
    }

    const timestamps = eventArticles
      .map(a => a.published)
      .filter(Boolean)
      .map(d => new Date(d).getTime())
      .sort((a, b) => a - b);

    const firstSeen = timestamps.length ? new Date(timestamps[0]) : null;
    const lastSeen = timestamps.length ? new Date(timestamps[timestamps.length - 1]) : null;

    await event.update({
      articleCount: eventArticles.length,
      eventVector,
      firstSeen,
      lastSeen,
      status: 'active'
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

  const finalEvents = await Event.findAll({
    where: { id: { [Op.in]: touchedIds } }
  });

  for (const event of finalEvents) {
    const articleCount = await Article.count({
      where: { eventId: event.id }
    });

    if (articleCount === 0) {
      await event.destroy();
      continue;
    }

    const topicEventCount = topicSizeMap[event.topicId] ?? 1;

    const strength = computeEventStrength({
      articleCount,
      topicEventCount
    });

    await event.update({
      articleCount,
      eventStrength: strength
    });
  }

  if (touchedTopicIds.length) {
    for (const topicId of touchedTopicIds) {
      const [articleCount, eventCount, lastEvent] = await Promise.all([
        Article.count({ where: { userId, topicId } }),
        Event.count({ where: { userId, topicId } }),
        Event.findOne({
          where: { userId, topicId },
          order: [['lastSeen', 'DESC']],
          attributes: ['lastSeen']
        })
      ]);

      await Topic.update(
        {
          articleCount,
          eventCount,
          lastActivityAt: lastEvent?.lastSeen || null
        },
        { where: { id: topicId } }
      );
    }
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

  console.log(
    `[EVENT] Finished window replay for user ${userId}` +
    ` (window=${RECENCY_WINDOW_DAYS}d, articles=${windowArticles.length},` +
    ` pruned=${deletedCount})`
  );
}

export default reclusterForUser;
