// services/events/updateEvents.js
// This service updates an existing event when a new article joins it.
// It preserves the stable representative while refreshing event metadata and topic links.
import db from '../../models/index.js';
import { EVENT_LIFECYCLE } from '../config/semanticConfig.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { resolveDevelopingArticleIdForAssignment } from './developingArticlePointer.js';
import { buildCanonicalEventProjection } from './eventProjection.js';

const { Article, Event } = db;

// This function converts date-like values into timestamps for lifecycle calculations.
function toTimestamp(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

// This function chooses the event lifecycle status from event size and freshness.
function resolveEventStatus(articleCount, lastSeenAt) {
  const now = Date.now();
  const lastSeenTs = toTimestamp(lastSeenAt);
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

// This function attaches an article to an existing event and refreshes event/topic denormalization.
export async function assignArticleToExistingEvent({
  article,
  articleEventVector: _articleEventVector,
  bestEvent,
  cache,
  bestScore: _bestScore,
  matchSignal: _matchSignal,
  skipTopicAssignment = false,
  assignTopicsForEvent = null,
  transaction = null
}) {
  if (!transaction) {
    return db.sequelize.transaction(managedTransaction => assignArticleToExistingEvent({
      article,
      articleEventVector: _articleEventVector,
      bestEvent,
      cache,
      bestScore: _bestScore,
      matchSignal: _matchSignal,
      skipTopicAssignment,
      assignTopicsForEvent,
      transaction: managedTransaction
    }));
  }

  const lockedEvent = await Event.findOne({
    where: {
      id: bestEvent.id,
      userId: article.userId
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!lockedEvent) {
    return null;
  }

  const lockedArticle = await Article.findOne({
    where: {
      id: article.id,
      userId: article.userId,
      ...canonicalArticleWhere()
    },
    attributes: [
      'id',
      'eventId',
      'feedId',
      'status',
      'filteredInd',
      'duplicateOfArticleId',
      'publishedAt',
      'createdAt'
    ],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (!lockedArticle) {
    return null;
  }

  if (lockedArticle.eventId != null) {
    article.eventId = lockedArticle.eventId;
    article.status = lockedArticle.status;
    article.filteredInd = lockedArticle.filteredInd;
    article.duplicateOfArticleId = lockedArticle.duplicateOfArticleId;

    return Number(lockedArticle.eventId) === Number(lockedEvent.id)
      ? lockedEvent.id
      : null;
  }

  await lockedArticle.update({
    eventId: lockedEvent.id
  }, {
    transaction
  });
  const eventArticles = await Article.findAll({
    where: {
      eventId: lockedEvent.id,
      userId: article.userId,
      ...canonicalArticleWhere()
    },
    attributes: ['id', 'feedId', 'publishedAt', 'createdAt', 'articleVector'],
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const projection = buildCanonicalEventProjection(eventArticles, lockedEvent.eventVector);
  const status = resolveEventStatus(projection.articleCount, projection.eventWindowEndAt);
  const developingArticleId = await resolveDevelopingArticleIdForAssignment({
    event: lockedEvent,
    incomingArticle: lockedArticle,
    transaction
  });

  let eventPrimaryTopicId = lockedEvent.topicId;

  if (!skipTopicAssignment && typeof assignTopicsForEvent === 'function') {
    lockedEvent.set({
      developingArticleId,
      ...projection,
      status
    });
    eventPrimaryTopicId = await assignTopicsForEvent({
      event: lockedEvent,
      eventTopicVector: projection.eventVector,
      transaction
    });

    article.topicId = eventPrimaryTopicId;
  }

  const eventUpdates = {
    topicId: eventPrimaryTopicId,
    developingArticleId,
    ...projection,
    status
  };

  await lockedEvent.update(eventUpdates, { transaction });

  if (cache) {
    transaction.afterCommit(() => {
      cache.updateInMemory(lockedEvent.id, eventUpdates);
    });
  }

  return lockedEvent.id;
}

export default assignArticleToExistingEvent;
