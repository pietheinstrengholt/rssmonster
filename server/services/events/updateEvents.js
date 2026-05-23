// services/events/updateEvents.js
import db from '../../models/index.js';
import { EVENT_LIFECYCLE, EVENT_VECTOR_ALPHA } from '../config/semanticConfig.js';

const { Article, Event } = db;

function toTimestamp(value) {
  if (!value) return null;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : null;
}

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

function blendEventVector(existingVector, incomingVector) {
  if (!Array.isArray(existingVector) || !Array.isArray(incomingVector)) return incomingVector;
  if (existingVector.length !== incomingVector.length) return incomingVector;

  return existingVector.map(
    (value, index) => value * (1 - EVENT_VECTOR_ALPHA) + incomingVector[index] * EVENT_VECTOR_ALPHA
  );
}

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

export async function assignArticleToExistingEvent({
  article,
  articleEventVector,
  bestEvent,
  cache,
  bestScore,
  matchSignal,
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
