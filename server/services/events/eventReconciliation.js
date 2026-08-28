import db from '../../models/index.js';
import { debugSemanticLog } from '../observability/semanticLogging.js';
import { Op } from 'sequelize';

import {
  EVENT_LIFECYCLE,
  EVENT_STRENGTH_CONFIG
} from '../config/semanticConfig.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { selectDevelopingArticleId } from './developingArticlePointer.js';
import { buildCanonicalEventProjection } from './eventProjection.js';

// Provides the shared dependencies used by this service.
const { Article, Event } = db;

// This function maps event age and size into the lifecycle status used by event queries.
export function resolveEventStatus(articleCount, lastSeenAt) {
  // Derives the now through now while resolving event status.
  const now = Date.now();
  // Selects the last seen ts based on whether last seen at is available.
  const lastSeenTs = lastSeenAt ? new Date(lastSeenAt).getTime() : null;

  // Returns early when last seen ts is not finite.
  if (!Number.isFinite(lastSeenTs)) return 'archived';

  // Derives the age hours through max while resolving event status.
  const ageHours = Math.max(0, (now - lastSeenTs) / (1000 * 60 * 60));

  // Returns early when age hours reaches event lifecycle cooling hours.
  if (ageHours >= EVENT_LIFECYCLE.coolingHours) {
    return 'archived';
  }

  // Returns early when age hours exceeds event lifecycle active fresh hours.
  if (ageHours > EVENT_LIFECYCLE.activeFreshHours) {
    return 'cooling';
  }

  // Returns early when article count is at most event lifecycle emerging article max.
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
  // Derives the redundancy score through min while computing event strength.
  const redundancyScore = Math.min(
    articleCount / EVENT_STRENGTH_CONFIG.maxArticleRedundancyCount,
    1
  );

  // Derives the topic score through min while computing event strength.
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
  // Returns early when transaction is unavailable.
  if (!transaction) {
    // Runs the callback required while performing reconcile touched events.
    return db.sequelize.transaction(managedTransaction => reconcileTouchedEvents(
      userId,
      touchedEventIds,
      managedTransaction
    ));
  }

  // Derives the touched id through sort while performing reconcile touched events.
  const touchedIds = [...new Set([...touchedEventIds].map(Number).filter(Number.isInteger))]
    .sort((left, right) => left - right);

  // Loads the events needed while performing reconcile touched events.
  const events = await Event.findAll({
    where: {
      id: { [Op.in]: touchedIds },
      userId
    },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  // Loads the all event articles needed while performing reconcile touched events.
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

  // Builds the articles by event id assembled while performing reconcile touched events.
  const articlesByEventId = {};
  // Processes each all event articles entry in turn.
  for (const article of allEventArticles) {
    // Handles the case where articles by event id event id is unavailable.
    if (!articlesByEventId[article.eventId]) {
      articlesByEventId[article.eventId] = [];
    }
    articlesByEventId[article.eventId].push(article);
  }

  // Processes each events entry in turn.
  for (const event of events) {
    // Derives the event articles required while performing reconcile touched events.
    const eventArticles = articlesByEventId[event.id] || [];

    // Handles the case where event articles is empty.
    if (!eventArticles.length) {
      await event.destroy({ transaction });
      continue;
    }

    // Builds the canonical event projection while performing reconcile touched events.
    const projection = buildCanonicalEventProjection(eventArticles, event.eventVector);
    // Resolves the event status while performing reconcile touched events.
    const status = resolveEventStatus(projection.articleCount, projection.eventWindowEndAt);
    // Computes the event strength while performing reconcile touched events.
    const strength = computeEventStrength({
      articleCount: projection.articleCount,
      topicEventCount: 1
    });
    // Selects the developing article id while performing reconcile touched events.
    const developingArticleId = selectDevelopingArticleId(event, eventArticles);

    await event.update({
      developingArticleId,
      ...projection,
      status,
      eventStrength: strength
    }, { transaction });

    debugSemanticLog('event',
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
