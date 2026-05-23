// services/events/createEvents.js
import db from '../../models/index.js';
import { Op } from 'sequelize';
import { EVENT_LIFECYCLE } from '../config/semanticConfig.js';

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

function generateEventName(article) {
  if (!article?.title) return null;

  let name = article.title
    .replace(/\s*[-\u2013\u2014|:]\s*[^-\u2013\u2014|:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (name.length > 120) {
    name = name.slice(0, 120).replace(/\s+\S*$/, '') + '...';
  }

  return name || null;
}

function resolveArticleVector(record) {
  if (Array.isArray(record?.eventVector)) return record.eventVector;
  if (Array.isArray(record?.articleVector)) return record.articleVector;
  return null;
}

export async function createAndAssignEvent({
  candidateArticles,
  article,
  cache,
  skipTopicAssignment = false,
  assignTopicsForEvent = null
}) {
  const eventArticles = [...candidateArticles, article];
  const vectors = eventArticles
    .map(item => resolveArticleVector(item))
    .filter(vector => Array.isArray(vector));

  if (!vectors.length) {
    return null;
  }

  const centroid = vectors[0].map((_, index) => (
    vectors.reduce((sum, vector) => sum + vector[index], 0) / vectors.length
  ));

  const timestamps = eventArticles
    .map(item => item.published)
    .filter(Boolean)
    .map(value => new Date(value).getTime())
    .sort((a, b) => a - b);

  const firstSeen = timestamps.length ? new Date(timestamps[0]) : article.published || new Date();
  const lastSeen = timestamps.length ? new Date(timestamps[timestamps.length - 1]) : article.published || new Date();
  const sourceCount = new Set(eventArticles.map(item => item.feedId)).size;
  const sourceDiversityScore = Math.log(sourceCount + 1);
  const name = generateEventName(article);

  const eventArticleIds = eventArticles.map(item => item.id);

  const newEvent = await Event.create({
    userId: article.userId,
    topicId: null,
    representativeArticleId: article.id,
    name,
    articleCount: eventArticles.length,
    eventStrength: 0.2,
    eventVector: centroid,
    firstSeen,
    lastSeen,
    status: resolveEventStatus(eventArticles.length, lastSeen),
    sourceCount,
    sourceDiversityScore
  });

  if (!newEvent?.id) {
    console.warn(
      `[EVENT] Failed to create event for article ${article.id}`
    );
    return null;
  }

  await Article.update(
    { eventId: newEvent.id },
    {
      where: {
        id: { [Op.in]: eventArticleIds }
      }
    }
  );

  let primaryEventTopicId = null;

  if (!skipTopicAssignment && typeof assignTopicsForEvent === 'function') {
    primaryEventTopicId = await assignTopicsForEvent({
      event: newEvent,
      eventTopicVector: centroid
    });

    if (primaryEventTopicId) {
      newEvent.topicId = primaryEventTopicId;
    }
  }

  if (cache) {
    cache.add(newEvent);
  }

  return newEvent.id;
}

export default createAndAssignEvent;
