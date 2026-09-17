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

// This function estimates event strength from article redundancy and cohesion.
export function computeEventStrength({
  articleCount,
}) {
  // Derives the redundancy score through min while computing event strength.
  const redundancyScore = Math.min(
    articleCount / EVENT_STRENGTH_CONFIG.maxArticleRedundancyCount,
    1
  );

  const cohesionScore = EVENT_STRENGTH_CONFIG.cohesionBaseline;

  return Number((
    redundancyScore * EVENT_STRENGTH_CONFIG.weights.redundancy +
    cohesionScore * EVENT_STRENGTH_CONFIG.weights.cohesion +
    EVENT_STRENGTH_CONFIG.baseline
  ).toFixed(3));
}

// Restore membership, projections and pointers, preserving representatives that remain valid.
export async function reconcileTouchedEvents(userId, touchedEventIds, transaction = null, { excludedArticleIds = [] } = {}) {
  // Returns early when transaction is unavailable.
  if (!transaction) {
    // Runs the callback required while performing reconcile touched events.
    return db.sequelize.transaction(managedTransaction => reconcileTouchedEvents(
      userId,
      touchedEventIds,
      managedTransaction,
      { excludedArticleIds }
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
  const ownedEventIds = events.map(event => event.id);

  // Loads the all event articles needed while performing reconcile touched events.
  const allEventArticles = await Article.findAll({
    where: {
      eventId: { [Op.in]: ownedEventIds },
      userId,
      ...canonicalArticleWhere(),
      ...(excludedArticleIds.length ? { id: { [Op.notIn]: excludedArticleIds } } : {})
    },
    attributes: [
      'id',
      'eventId',
      'feedId',
      'status',
      'readAt',
      'publishedAt',
      'createdAt',
      'articleVector',
      'embedding_model'
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

    // Detach ineligible/pending-removal members, or every assignment when dissolving.
    await Article.update({ eventId: null }, {
      where: { userId, eventId: event.id,
        ...(eventArticles.length >= 2 ? { id: { [Op.notIn]: eventArticles.map(article => article.id) } } : {}) },
      transaction
    });
    if (eventArticles.length < 2) {
      await event.destroy({ transaction });
      articlesByEventId[event.id] = [];
      continue;
    }

    // Builds the canonical event projection while performing reconcile touched events.
    const projection = buildCanonicalEventProjection(eventArticles, event.eventVector, event.embedding_model);
    // Resolves the event status while performing reconcile touched events.
    const status = resolveEventStatus(projection.articleCount, projection.eventWindowEndAt);
    // Computes the event strength while performing reconcile touched events.
    const strength = computeEventStrength({
      articleCount: projection.articleCount,
    });
    // Selects the developing article id while performing reconcile touched events.
    const representativeArticleId = eventArticles.some(article => Number(article.id) === Number(event.representativeArticleId))
      ? event.representativeArticleId : eventArticles.reduce((id, article) => Math.min(id, Number(article.id)), Infinity);
    const developingArticleId = selectDevelopingArticleId({
      representativeArticleId, developingArticleId: event.developingArticleId
    }, eventArticles);

    await event.update({
      representativeArticleId,
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

// Run before an eligibility loss or deletion in its transaction. Excluding pending
// removals repairs representative FKs before their ON DELETE CASCADE can erase an Event.
export async function prepareArticleEventRemoval(userId, articleWhere, transaction) {
  if (!transaction) throw new Error('Event membership removal requires a transaction');
  const articles = await Article.findAll({ where: { ...articleWhere, userId },
    attributes: ['id', 'eventId'], transaction });
  if (!articles.length) return { articleIds: [], articlesByEventId: {} };
  const articleIds = articles.map(article => article.id);
  const events = await Event.findAll({ where: { userId, [Op.or]: [
    { id: { [Op.in]: articles.map(article => article.eventId).filter(id => id != null) } },
    { representativeArticleId: { [Op.in]: articleIds } },
    { developingArticleId: { [Op.in]: articleIds } }
  ] }, attributes: ['id'], order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
  // Lock targets even when discovery found no Event. Re-read membership after a
  // concurrent assignment, and prevent new assignments until the mutation commits.
  const lockedArticles = await Article.findAll({ where: { ...articleWhere, userId, id: { [Op.in]: articleIds } },
    attributes: ['id', 'eventId'], order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
  const removalIds = lockedArticles.map(article => article.id);
  if (!removalIds.length) return { articleIds: [], articlesByEventId: {} };
  const eventIds = [...new Set([...events.map(event => event.id), ...lockedArticles.map(article => article.eventId).filter(id => id != null)])];
  const result = eventIds.length
    ? await reconcileTouchedEvents(userId, eventIds, transaction, { excludedArticleIds: removalIds }) : { articlesByEventId: {} };
  return { ...result, articleIds: removalIds };
}
