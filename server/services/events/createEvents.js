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

// This function estimates the starting strength for a newly-created event.
function computeInitialEventStrength(articleCount) {
  // Derives the redundancy score through min while computing initial event strength.
  const redundancyScore = Math.min(
    articleCount / EVENT_STRENGTH_CONFIG.maxArticleRedundancyCount,
    1
  );
  // Derives the topic score through min while computing initial event strength.
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
  // Returns no result when title is unavailable.
  if (!article?.title) return null;

  // Normalizes the name before generating event name.
  let name = article.title
    .replace(/\s*[-\u2013\u2014|:]\s*[^-\u2013\u2014|:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Handles the case where name count exceeds 120.
  if (name.length > 120) {
    name = name.slice(0, 120).replace(/\s+\S*$/, '') + '...';
  }

  return name || null;
}

// This function initializes event pointers while preserving already-seen standalone coverage.
function selectInitialArticlePointers(lockedArticles, lockedSeedArticle) {
  // Loads the previously read article needed while selecting initial article pointers.
  const previouslyReadArticle = lockedArticles.find(candidate =>
    Number(candidate.id) !== Number(lockedSeedArticle.id) &&
    wasReadBeforeArticleArrived(candidate, lockedSeedArticle)
  );

  // Returns early when locked seed article status is unread and previously read article is available.
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
  // Returns early when transaction is unavailable.
  if (!transaction) {
    // Runs the callback required while creating and assign event.
    return db.sequelize.transaction(managedTransaction => createAndAssignEvent({
      candidateArticles,
      article,
      cache,
      skipTopicAssignment,
      assignTopicsForEvent,
      transaction: managedTransaction
    }));
  }

  // Collects the proposed articles while creating and assign event.
  const proposedArticles = [...candidateArticles, article];
  // Derives the proposed articles by id required while creating and assign event.
  const proposedArticlesById = new Map(
    proposedArticles.map(item => [Number(item.id), item])
  );
  // Derives the event article id through sort while creating and assign event.
  const eventArticleIds = [...proposedArticlesById.keys()]
    .filter(Number.isInteger)
    .sort((left, right) => left - right);

  // Returns no result when event article id count is not proposed articles by id size.
  if (eventArticleIds.length !== proposedArticlesById.size) {
    return null;
  }

  // Loads the locked articles needed while creating and assign event.
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

  // Returns no result when locked articles count is not event article id count.
  if (lockedArticles.length !== eventArticleIds.length) {
    return null;
  }

  // Derives the locked articles by id required while creating and assign event.
  const lockedArticlesById = new Map(lockedArticles.map(item => [Number(item.id), item]));
  // Derives the locked seed article through get while creating and assign event.
  const lockedSeedArticle = lockedArticlesById.get(Number(article.id));

  // Returns no result when locked seed article is unavailable.
  if (!lockedSeedArticle) {
    return null;
  }

  // Builds the canonical event projection while creating and assign event.
  const projection = buildCanonicalEventProjection(lockedArticles);
  // Returns no result when projection event vector is unavailable.
  if (!projection.eventVector) {
    return null;
  }

  // Resolves the event window start at that governs creating and assign event.
  const eventWindowStartAt = projection.eventWindowStartAt ?? eventDateFromArticle(lockedSeedArticle);
  // Resolves the event window end at that governs creating and assign event.
  const eventWindowEndAt = projection.eventWindowEndAt ?? eventDateFromArticle(lockedSeedArticle);
  // Selects the initial article pointers while creating and assign event.
  const { representativeArticle, developingArticleId } = selectInitialArticlePointers(
    lockedArticles,
    lockedSeedArticle
  );
  // Derives the name through generate event name while creating and assign event.
  const name = generateEventName(representativeArticle);
  // Computes the initial event strength while creating and assign event.
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

  // Handles the case where id is unavailable.
  if (!newEvent?.id) {
    console.warn(
      `[EVENT] Failed to create event for article ${article.id}`
    );
    return null;
  }

  // Derives the values through update while creating and assign event.
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

  // Rejects processing when assigned article count is not event article id count.
  if (assignedArticleCount !== eventArticleIds.length) {
    throw new Error(`Failed to assign all articles to new event ${newEvent.id}`);
  }

  let primaryEventTopicId = null;

  // Handles the case where skip topic assignment is unavailable and assign topics for event is function.
  if (!skipTopicAssignment && typeof assignTopicsForEvent === 'function') {
    primaryEventTopicId = await assignTopicsForEvent({
      event: newEvent,
      eventTopicVector: projection.eventVector,
      transaction
    });

    // Handles the case where primary event topic id is available.
    if (primaryEventTopicId) {
      newEvent.topicId = primaryEventTopicId;
    }
  }

  // Handles the case where cache is available.
  if (cache) {
    // Runs the callback required while creating and assign event.
    transaction.afterCommit(() => {
      cache.add(newEvent);
    });
  }

  return newEvent.id;
}

export default createAndAssignEvent;
