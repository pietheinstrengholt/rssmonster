// services/events/createEvents.js
// This service creates a new event from a set of corroborating articles.
// It assigns the stable representative and initializes event metadata and optional topic assignment.
import db from '../../models/index.js';
import { Op } from 'sequelize';
import { EVENT_LIFECYCLE, EVENT_STRENGTH_CONFIG } from '../config/semanticConfig.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { eventDateFromArticle } from './articleEventTime.js';
import { buildCanonicalEventProjection } from './eventProjection.js';
import { wasReadBeforeArticleArrived } from './developingArticlePointer.js';

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

// This function initializes event pointers while preserving already-seen standalone coverage.
function selectInitialArticlePointers(lockedArticles, lockedSeedArticle) {
  const previouslyReadArticle = lockedArticles.find(candidate =>
    Number(candidate.id) !== Number(lockedSeedArticle.id) &&
    wasReadBeforeArticleArrived(candidate, lockedSeedArticle)
  );

  if (lockedSeedArticle.status === 'unread' && previouslyReadArticle) {
    return {
      representativeArticle: previouslyReadArticle,
      developingArticleId: lockedSeedArticle.id
    };
  }

  return {
    representativeArticle: lockedSeedArticle,
    developingArticleId: lockedSeedArticle.id
  };
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

  const lockedArticlesById = new Map(lockedArticles.map(item => [Number(item.id), item]));
  const lockedSeedArticle = lockedArticlesById.get(Number(article.id));

  if (!lockedSeedArticle) {
    return null;
  }

  const projection = buildCanonicalEventProjection(lockedArticles);
  if (!projection.eventVector) {
    return null;
  }

  const eventWindowStartAt = projection.eventWindowStartAt ?? eventDateFromArticle(lockedSeedArticle);
  const eventWindowEndAt = projection.eventWindowEndAt ?? eventDateFromArticle(lockedSeedArticle);
  const { representativeArticle, developingArticleId } = selectInitialArticlePointers(
    lockedArticles,
    lockedSeedArticle
  );
  const name = generateEventName(representativeArticle);
  const eventStrength = computeInitialEventStrength(projection.articleCount);

  // Previously consumed coverage remains the stable anchor when an unread seed develops the story.
  const newEvent = await Event.create({
    userId: lockedSeedArticle.userId,
    topicId: null,
    representativeArticleId: representativeArticle.id,
    developingArticleId,
    name,
    articleCount: projection.articleCount,
    eventStrength,
    eventVector: projection.eventVector,
    eventWindowStartAt,
    eventWindowEndAt,
    status: resolveEventStatus(projection.articleCount, eventWindowEndAt),
    sourceCount: projection.sourceCount,
    sourceDiversityScore: projection.sourceDiversityScore
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
      eventTopicVector: projection.eventVector,
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
