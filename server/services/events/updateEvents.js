// services/events/updateEvents.js
// This service updates an existing event when a new article joins it.
// It blends event vectors, refreshes lifecycle/source stats, and keeps event topic links in sync.
import db from '../../models/index.js';
import { EVENT_LIFECYCLE, EVENT_VECTOR_ALPHA } from '../config/semanticConfig.js';
import { blendVector } from '../vectors/index.js';

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

// This function blends a new article vector into the existing event vector.
function blendEventVector(existingVector, incomingVector) {
  return blendVector(existingVector, incomingVector, EVENT_VECTOR_ALPHA);
}

// This function recalculates source diversity after an article joins an event.
async function updateSourceDiversity(eventId, userId) {
  const sourceCount = await Article.count({
    where: { eventId, userId },
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

// This function attaches an article to an existing event and refreshes event/topic denormalization.
export async function assignArticleToExistingEvent({
  article,
  articleEventVector,
  bestEvent,
  cache,
  bestScore: _bestScore,
  matchSignal: _matchSignal,
  skipTopicAssignment = false,
  assignTopicsForEvent = null
}) {
  const newCount = bestEvent.articleCount + 1;
  const updatedEventVector = blendEventVector(bestEvent.eventVector, articleEventVector);

  const seenAt = article.published || new Date();
  const status = resolveEventStatus(newCount, seenAt);

  await article.update({ eventId: bestEvent.id });

  const [, diversity] = await Promise.all([
    bestEvent.update({
      eventVector: updatedEventVector,
      articleCount: newCount,
      lastSeen: seenAt,
      status
    }),
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
      status,
      ...diversity
    });
  }

}

export default assignArticleToExistingEvent;
