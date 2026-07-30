// services/events/updateEvents.js
// This service updates an existing event when a new article joins it.
// It preserves the stable representative while refreshing event metadata and topic links.
import db from '../../models/index.js';
import { EVENT_LIFECYCLE } from '../config/semanticConfig.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { resolveDevelopingArticleIdForAssignment } from './developingArticlePointer.js';
import { buildCanonicalEventProjection } from './eventProjection.js';

// Provides the shared dependencies used by this service.
const { Article, Event } = db;

// This function converts date-like values into timestamps for lifecycle calculations.
function toTimestamp(value) {
  // Returns no result when value is unavailable.
  if (!value) return null;
  // Derives the ts through get time while performing to timestamp.
  const ts = new Date(value).getTime();
  // Selects the result based on whether ts is finite.
  return Number.isFinite(ts) ? ts : null;
}

// This function chooses the event lifecycle status from event size and freshness.
function resolveEventStatus(articleCount, lastSeenAt) {
  // Derives the now through now while resolving event status.
  const now = Date.now();
  // Derives the last seen ts through to timestamp while resolving event status.
  const lastSeenTs = toTimestamp(lastSeenAt);
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
  // Returns early when transaction is unavailable.
  if (!transaction) {
    // Runs the callback required while assigning article to existing event.
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

  // Loads the locked event needed while assigning article to existing event.
  const lockedEvent = await Event.findOne({
    where: {
      id: bestEvent.id,
      userId: article.userId
    },
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  // Returns no result when locked event is unavailable.
  if (!lockedEvent) {
    return null;
  }

  // Loads the locked article needed while assigning article to existing event.
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

  // Returns no result when locked article is unavailable.
  if (!lockedArticle) {
    return null;
  }

  // Handles the case where locked article event id is not value.
  if (lockedArticle.eventId != null) {
    article.eventId = lockedArticle.eventId;
    article.status = lockedArticle.status;
    article.filteredInd = lockedArticle.filteredInd;
    article.duplicateOfArticleId = lockedArticle.duplicateOfArticleId;

    // Selects the result based on whether number is number.
    return Number(lockedArticle.eventId) === Number(lockedEvent.id)
      ? lockedEvent.id
      : null;
  }

  await lockedArticle.update({
    eventId: lockedEvent.id
  }, {
    transaction
  });
  // Loads the event articles needed while assigning article to existing event.
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
  // Builds the canonical event projection while assigning article to existing event.
  const projection = buildCanonicalEventProjection(eventArticles, lockedEvent.eventVector);
  // Resolves the event status while assigning article to existing event.
  const status = resolveEventStatus(projection.articleCount, projection.eventWindowEndAt);
  // Resolves the developing article id for assignment while assigning article to existing event.
  const developingArticleId = await resolveDevelopingArticleIdForAssignment({
    event: lockedEvent,
    incomingArticle: lockedArticle,
    transaction
  });

  let eventPrimaryTopicId = lockedEvent.topicId;

  // Handles the case where skip topic assignment is unavailable and assign topics for event is function.
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

  // Builds the event updates assembled while assigning article to existing event.
  const eventUpdates = {
    topicId: eventPrimaryTopicId,
    developingArticleId,
    ...projection,
    status
  };

  await lockedEvent.update(eventUpdates, { transaction });

  // Handles the case where cache is available.
  if (cache) {
    // Runs the callback required while assigning article to existing event.
    transaction.afterCommit(() => {
      cache.updateInMemory(lockedEvent.id, eventUpdates);
    });
  }

  return lockedEvent.id;
}

export default assignArticleToExistingEvent;
