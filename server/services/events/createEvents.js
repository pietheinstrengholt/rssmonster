// services/events/createEvents.js
// This service creates a new event from a set of corroborating articles.
// It initializes event vectors, source diversity, lifecycle status, and optional topic assignment.
import db from '../../models/index.js';
import { Op } from 'sequelize';
import { EVENT_LIFECYCLE, EVENT_STRENGTH_CONFIG } from '../config/semanticConfig.js';
import { averageVector } from '../vectors/index.js';
import { eventDateFromArticle, eventWindowFromArticles } from './articleEventTime.js';

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

// This function estimates the starting strength for a newly-created event.
function computeInitialEventStrength(articleCount) {
  const redundancyScore = Math.min(
    articleCount / EVENT_STRENGTH_CONFIG.maxArticleRedundancyCount,
    1
  );
  const topicScore = Math.min(
    Math.log2(2) / EVENT_STRENGTH_CONFIG.maxTopicEventLogBase,
    1
  );
  const cohesionScore = EVENT_STRENGTH_CONFIG.cohesionBaseline;

  return Number((
    redundancyScore * EVENT_STRENGTH_CONFIG.weights.redundancy +
    cohesionScore * EVENT_STRENGTH_CONFIG.weights.cohesion +
    topicScore * EVENT_STRENGTH_CONFIG.weights.topic
  ).toFixed(3));
}

// This function derives a readable event name from the representative article title.
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

// This function resolves the vector field used when building a new event centroid.
function resolveArticleVector(record) {
  if (Array.isArray(record?.eventVector)) return record.eventVector;
  if (Array.isArray(record?.articleVector)) return record.articleVector;
  return null;
}

// This function creates an event, assigns all member articles, and optionally links event topics.
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

  const centroid = averageVector(vectors);

  const eventWindow = eventWindowFromArticles(eventArticles);
  const eventWindowStartAt = eventWindow.eventWindowStartAt ?? eventDateFromArticle(article);
  const eventWindowEndAt = eventWindow.eventWindowEndAt ?? eventDateFromArticle(article);
  const sourceCount = new Set(eventArticles.map(item => item.feedId)).size;
  const sourceDiversityScore = Math.log(sourceCount + 1);
  const name = generateEventName(article);
  const eventStrength = computeInitialEventStrength(eventArticles.length);

  const eventArticleIds = eventArticles.map(item => item.id);

  const newEvent = await Event.create({
    userId: article.userId,
    topicId: null,
    representativeArticleId: article.id,
    name,
    articleCount: eventArticles.length,
    eventStrength,
    eventVector: centroid,
    eventWindowStartAt,
    eventWindowEndAt,
    status: resolveEventStatus(eventArticles.length, eventWindowEndAt),
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
