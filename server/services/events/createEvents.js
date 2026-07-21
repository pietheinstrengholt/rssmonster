// services/events/createEvents.js
// This service creates a new event from a set of corroborating articles.
// It assigns the stable representative and initializes event metadata and optional topic assignment.
import db from '../../models/index.js';
import { Op } from 'sequelize';
import { EVENT_LIFECYCLE, EVENT_STRENGTH_CONFIG } from '../config/semanticConfig.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
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

// This function derives a readable event name from the stable representative title.
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
  if (Array.isArray(record?.getDataValue?.('eventVector'))) {
    return record.getDataValue('eventVector');
  }
  if (Array.isArray(record?.articleVector)) return record.articleVector;
  return null;
}

// This function creates an event, assigns all member articles, and optionally links event topics.
export async function createAndAssignEvent({
  candidateArticles,
  article,
  cache,
  skipTopicAssignment = false,
  assignTopicsForEvent = null,
  transaction = null
}) {
  if (!transaction) {
    return db.sequelize.transaction(managedTransaction => createAndAssignEvent({
      candidateArticles,
      article,
      cache,
      skipTopicAssignment,
      assignTopicsForEvent,
      transaction: managedTransaction
    }));
  }

  const proposedArticles = [...candidateArticles, article];
  const proposedArticlesById = new Map(
    proposedArticles.map(item => [Number(item.id), item])
  );
  const eventArticleIds = [...proposedArticlesById.keys()]
    .filter(Number.isInteger)
    .sort((left, right) => left - right);

  if (eventArticleIds.length !== proposedArticlesById.size) {
    return null;
  }

  const lockedArticles = await Article.findAll({
    where: {
      id: { [Op.in]: eventArticleIds },
      userId: article.userId,
      eventId: null,
      ...canonicalArticleWhere()
    },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  if (lockedArticles.length !== eventArticleIds.length) {
    return null;
  }

  const lockedArticlesById = new Map(
    lockedArticles.map(item => [Number(item.id), item])
  );
  const lockedSeedArticle = lockedArticlesById.get(Number(article.id));

  if (!lockedSeedArticle) {
    return null;
  }

  for (const lockedArticle of lockedArticles) {
    const proposedVector = resolveArticleVector(proposedArticlesById.get(Number(lockedArticle.id)));
    if (proposedVector) {
      lockedArticle.setDataValue('eventVector', proposedVector);
    }
  }

  const eventArticles = [
    ...lockedArticles.filter(item => Number(item.id) !== Number(lockedSeedArticle.id)),
    lockedSeedArticle
  ];
  const vectors = eventArticles
    .map(item => resolveArticleVector(item))
    .filter(vector => Array.isArray(vector));

  if (!vectors.length) {
    return null;
  }

  const centroid = averageVector(vectors);

  const eventWindow = eventWindowFromArticles(eventArticles);
  const eventWindowStartAt = eventWindow.eventWindowStartAt ?? eventDateFromArticle(lockedSeedArticle);
  const eventWindowEndAt = eventWindow.eventWindowEndAt ?? eventDateFromArticle(lockedSeedArticle);
  const sourceCount = new Set(
    eventArticles
      .map(item => item.feedId)
      .filter(feedId => feedId != null)
  ).size;
  const sourceDiversityScore = Math.log(sourceCount + 1);
  const name = generateEventName(lockedSeedArticle);
  const eventStrength = computeInitialEventStrength(eventArticles.length);

  // A new event starts with the seed article as both its stable anchor and developing article.
  const newEvent = await Event.create({
    userId: lockedSeedArticle.userId,
    topicId: null,
    representativeArticleId: lockedSeedArticle.id,
    developingArticleId: lockedSeedArticle.id,
    name,
    articleCount: eventArticles.length,
    eventStrength,
    eventVector: centroid,
    eventWindowStartAt,
    eventWindowEndAt,
    status: resolveEventStatus(eventArticles.length, eventWindowEndAt),
    sourceCount,
    sourceDiversityScore
  }, { transaction });

  if (!newEvent?.id) {
    console.warn(
      `[EVENT] Failed to create event for article ${article.id}`
    );
    return null;
  }

  const [assignedArticleCount] = await Article.update(
    { eventId: newEvent.id },
    {
      where: {
        id: { [Op.in]: eventArticleIds },
        userId: lockedSeedArticle.userId,
        eventId: null,
        ...canonicalArticleWhere()
      },
      transaction
    }
  );

  if (assignedArticleCount !== eventArticleIds.length) {
    throw new Error(`Failed to assign all articles to new event ${newEvent.id}`);
  }

  let primaryEventTopicId = null;

  if (!skipTopicAssignment && typeof assignTopicsForEvent === 'function') {
    primaryEventTopicId = await assignTopicsForEvent({
      event: newEvent,
      eventTopicVector: centroid,
      transaction
    });

    if (primaryEventTopicId) {
      newEvent.topicId = primaryEventTopicId;
    }
  }

  if (cache) {
    transaction.afterCommit(() => {
      cache.add(newEvent);
    });
  }

  return newEvent.id;
}

export default createAndAssignEvent;
