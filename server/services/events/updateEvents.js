// services/events/updateEvents.js
// This service updates an existing event when a new article joins it.
// It blends event vectors, refreshes lifecycle/source stats, and keeps event topic links in sync.
import db from '../../models/index.js';
import { EVENT_LIFECYCLE, EVENT_VECTOR_ALPHA } from '../config/semanticConfig.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { blendVector } from '../vectors/index.js';
import { eventDateFromArticle, eventTimestamp } from './articleEventTime.js';

const { Article, Event } = db;
const INHERITABLE_ARTICLE_STATUS = 'unread';
const READ_ARTICLE_STATUS = 'read';
const EVENT_DEBUG = ['1', 'true', 'yes'].includes(
  String(process.env.EVENT_DEBUG || process.env.EVENT_RECLUSTER_DEBUG || '').toLowerCase()
) || process.env.NODE_ENV === 'development';

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

// This function blends a new article vector into the existing event vector.
function blendEventVector(existingVector, incomingVector) {
  return blendVector(existingVector, incomingVector, EVENT_VECTOR_ALPHA);
}

// This function recalculates source diversity after an article joins an event.
async function updateSourceDiversity(eventId, userId) {
  const sourceCount = await Article.count({
    where: { eventId, userId, ...canonicalArticleWhere() },
    distinct: true,
    col: 'feedId'
  });

  const sourceDiversityScore = Math.log(sourceCount + 1);

  await Event.update(
    { sourceCount, sourceDiversityScore },
    { where: { id: eventId } }
  );

  return { sourceCount, sourceDiversityScore };
}

// This function writes read-inheritance decisions when event debug logging is enabled.
function logReadInheritanceDecision({ article, event, representativeArticleId, decision, reason = null }) {
  if (!EVENT_DEBUG) return;

  const reasonPart = reason ? ` reason=${reason}` : '';
  console.log(
    `[EVENT] inherited read status article=${article.id} event=${event.id} ` +
    `representative=${representativeArticleId ?? 'none'} decision=${decision}${reasonPart}`
  );
}

// This function marks a newly attached unread article read when the event representative was already read.
export async function inheritReadStatusFromEventRepresentative({ article, event, transaction = null }) {
  const representativeArticleId = event?.representativeArticleId ?? null;

  if (!article || !event || !representativeArticleId) {
    logReadInheritanceDecision({
      article: article || { id: 'unknown' },
      event: event || { id: 'unknown' },
      representativeArticleId,
      decision: 'kept-unread',
      reason: 'missing-context'
    });
    return false;
  }

  if (article.status !== INHERITABLE_ARTICLE_STATUS) {
    logReadInheritanceDecision({
      article,
      event,
      representativeArticleId,
      decision: 'kept-unread',
      reason: 'article-not-unread'
    });
    return false;
  }

  const representativeArticle = await Article.findOne({
    where: {
      id: representativeArticleId,
      userId: event.userId
    },
    attributes: ['id', 'status'],
    transaction
  });

  if (!representativeArticle) {
    logReadInheritanceDecision({
      article,
      event,
      representativeArticleId,
      decision: 'kept-unread',
      reason: 'representative-missing'
    });
    return false;
  }

  if (representativeArticle.status !== READ_ARTICLE_STATUS) {
    logReadInheritanceDecision({
      article,
      event,
      representativeArticleId,
      decision: 'kept-unread',
      reason: 'representative-unread'
    });
    return false;
  }

  await article.update({ status: READ_ARTICLE_STATUS }, { transaction });
  article.status = READ_ARTICLE_STATUS;

  logReadInheritanceDecision({
    article,
    event,
    representativeArticleId,
    decision: 'marked-read'
  });

  return true;
}

// This function attaches an article to an existing event and refreshes event/topic denormalization.
export async function assignArticleToExistingEvent({
  article,
  articleEventVector,
  bestEvent,
  cache,
  bestScore: _bestScore,
  matchSignal: _matchSignal,
  skipTopicAssignment = false,
  assignTopicsForEvent = null,
  transaction = null
}) {
  const newCount = bestEvent.articleCount + 1;
  const updatedEventVector = blendEventVector(bestEvent.eventVector, articleEventVector);

  const seenAt = eventDateFromArticle(article);
  const currentWindowStartTs = eventTimestamp(bestEvent.eventWindowStartAt);
  const seenAtTs = eventTimestamp(seenAt);
  const eventWindowStartAt = Number.isFinite(currentWindowStartTs) && currentWindowStartTs <= seenAtTs
    ? bestEvent.eventWindowStartAt
    : seenAt;
  const eventWindowEndAt = Number.isFinite(eventTimestamp(bestEvent.eventWindowEndAt)) && eventTimestamp(bestEvent.eventWindowEndAt) >= seenAtTs
    ? bestEvent.eventWindowEndAt
    : seenAt;
  const status = resolveEventStatus(newCount, eventWindowEndAt);

  await article.update({ eventId: bestEvent.id }, { transaction });
  await inheritReadStatusFromEventRepresentative({
    article,
    event: bestEvent,
    transaction
  });

  const [, diversity] = await Promise.all([
    bestEvent.update({
      eventVector: updatedEventVector,
      articleCount: newCount,
      eventWindowStartAt,
      eventWindowEndAt,
      status
    }, { transaction }),
    updateSourceDiversity(bestEvent.id, article.userId)
  ]);

  let eventPrimaryTopicId = bestEvent.topicId;

  if (!skipTopicAssignment && typeof assignTopicsForEvent === 'function') {
    eventPrimaryTopicId = await assignTopicsForEvent({
      event: bestEvent,
      eventTopicVector: updatedEventVector
    });

    article.topicId = eventPrimaryTopicId;
    bestEvent.topicId = eventPrimaryTopicId;
  }

  if (cache) {
    cache.updateInMemory(bestEvent.id, {
      topicId: eventPrimaryTopicId,
      eventVector: updatedEventVector,
      articleCount: newCount,
      eventWindowStartAt,
      eventWindowEndAt,
      status,
      ...diversity
    });
  }

}

export default assignArticleToExistingEvent;
