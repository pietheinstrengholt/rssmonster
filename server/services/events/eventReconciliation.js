import db from '../../models/index.js';
import { Op } from 'sequelize';

import {
  EVENT_LIFECYCLE,
  EVENT_STRENGTH_CONFIG
} from '../config/semanticConfig.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { selectDevelopingArticleId } from './developingArticlePointer.js';
import { buildCanonicalEventProjection } from './eventProjection.js';

const { Article, Event } = db;

// This function maps event age and size into the lifecycle status used by event queries.
export function resolveEventStatus(articleCount, lastSeenAt) {
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

// This function estimates event strength from article redundancy, cohesion, and topic history.
export function computeEventStrength({
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
    cohesionScore * EVENT_STRENGTH_CONFIG.weights.cohesion +
    topicScore * EVENT_STRENGTH_CONFIG.weights.topic
  ).toFixed(3));
}

// This function recomputes event metadata while preserving the stable representative and valid developing pointer.
export async function reconcileTouchedEvents(userId, touchedEventIds, transaction = null) {
  if (!transaction) {
    return db.sequelize.transaction(managedTransaction => reconcileTouchedEvents(
      userId,
      touchedEventIds,
      managedTransaction
    ));
  }

  const touchedIds = [...new Set([...touchedEventIds].map(Number).filter(Number.isInteger))]
    .sort((left, right) => left - right);

  const events = await Event.findAll({
    where: {
      id: { [Op.in]: touchedIds },
      userId
    },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  const allEventArticles = await Article.findAll({
    where: {
      eventId: { [Op.in]: touchedIds },
      userId,
      ...canonicalArticleWhere()
    },
    attributes: [
      'id',
      'eventId',
      'feedId',
      'status',
      'readAt',
      'publishedAt',
      'createdAt',
      'articleVector'
    ],
    order: [
      ['eventId', 'ASC'],
      ['publishedAt', 'DESC'],
      ['createdAt', 'DESC'],
      ['id', 'DESC']
    ],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

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
      await event.destroy({ transaction });
      continue;
    }

    const projection = buildCanonicalEventProjection(eventArticles, event.eventVector);
    const status = resolveEventStatus(projection.articleCount, projection.eventWindowEndAt);
    const strength = computeEventStrength({
      articleCount: projection.articleCount,
      topicEventCount: 1
    });
    const developingArticleId = selectDevelopingArticleId(event, eventArticles);

    await event.update({
      developingArticleId,
      ...projection,
      status,
      eventStrength: strength
    }, { transaction });

    console.log(
      `[EVENT] Reconciled event ${event.id}` +
      ` articles=${projection.articleCount}` +
      ` sources=${projection.sourceCount}` +
      ` strength=${strength}`
    );
  }

  return {
    touchedIds,
    articlesByEventId
  };
}
