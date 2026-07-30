import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';

// Provides the shared dependencies used by this service.
const { Article } = db;
// Defines the developing article order enforced by this service.
const DEVELOPING_ARTICLE_ORDER = [
  ['publishedAt', 'DESC'],
  ['createdAt', 'DESC'],
  ['id', 'DESC']
];

// This function reports whether an available article can be used as a developing article.
export function isCanonicalUnreadArticle(article) {
  return article?.status === 'unread' &&
    article.duplicateOfArticleId == null &&
    article.filteredInd === false;
}

// This function reports whether coverage was read before a later article reached RSSMonster.
export function wasReadBeforeArticleArrived(article, incomingArticle) {
  // Rejects the value when read at is unavailable or created at is unavailable.
  if (!article?.readAt || !incomingArticle?.createdAt) {
    return false;
  }

  // Derives the read at through get time while performing was read before article arrived.
  const readAt = new Date(article.readAt).getTime();
  // Derives the incoming created at through get time while performing was read before article arrived.
  const incomingCreatedAt = new Date(incomingArticle.createdAt).getTime();

  return Number.isFinite(readAt) &&
    Number.isFinite(incomingCreatedAt) &&
    readAt < incomingCreatedAt;
}

// This function returns an Article's arrival timestamp or sorts invalid values last.
function articleArrivalTimestamp(article) {
  // Derives the timestamp through get time while performing article arrival timestamp.
  const timestamp = new Date(article?.createdAt).getTime();
  // Selects the result based on whether timestamp is finite.
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

// This function returns the earliest-arriving Article without mutating the caller's collection.
function oldestArrivingArticle(articles) {
  // Orders values deterministically while performing oldest arriving article.
  return articles
    .slice()
    .sort((left, right) =>
      articleArrivalTimestamp(left) - articleArrivalTimestamp(right) ||
      Number(left.id) - Number(right.id)
    )[0] ?? null;
}

// This function preserves a valid developing pointer or deterministically repairs it.
export function selectDevelopingArticleId(event, canonicalEventArticles) {
  // Loads the current article needed while selecting developing article id.
  const currentArticle = canonicalEventArticles.find(
    article => Number(article.id) === Number(event.developingArticleId)
  );

  // Returns early when current article is available.
  if (currentArticle) {
    return currentArticle.id;
  }

  // Loads the representative article needed while selecting developing article id.
  const representativeArticle = canonicalEventArticles.find(
    article => Number(article.id) === Number(event.representativeArticleId)
  );

  // Handles the case where representative article is available.
  if (representativeArticle) {
    // Derives the first unread after consumption through oldest arriving article while selecting developing article id.
    const firstUnreadAfterConsumption = oldestArrivingArticle(
      canonicalEventArticles.filter(article =>
        article.status === 'unread' &&
        wasReadBeforeArticleArrived(representativeArticle, article)
      )
    );

    return firstUnreadAfterConsumption?.id ?? representativeArticle.id;
  }

  // Derives the first unread article through oldest arriving article while selecting developing article id.
  const firstUnreadArticle = oldestArrivingArticle(
    canonicalEventArticles.filter(article => article.status === 'unread')
  );

  return firstUnreadArticle?.id ??
    oldestArrivingArticle(canonicalEventArticles)?.id ??
    null;
}

// This function resolves the sticky developing pointer when an article joins an existing event.
export async function resolveDevelopingArticleIdForAssignment({
  event,
  incomingArticle,
  transaction = null
}) {
  // Derives the incoming is eligible through is canonical unread article while resolving developing article id for assignment.
  const incomingIsEligible = isCanonicalUnreadArticle(incomingArticle);
  // Derives the pointer id required while resolving developing article id for assignment.
  const pointerId = event.developingArticleId ?? event.representativeArticleId;
  // Selects the current article based on whether pointer id is value.
  let currentArticle = pointerId == null ? null : await Article.findOne({
    where: {
      id: pointerId,
      userId: event.userId,
      eventId: event.id,
      ...canonicalArticleWhere()
    },
    attributes: ['id', 'status', 'readAt'],
    transaction
  });

  // Handles the case where current article is unavailable and event representative article id is not value and number is not number.
  if (
    !currentArticle &&
    event.representativeArticleId != null &&
    Number(event.representativeArticleId) !== Number(pointerId)
  ) {
    currentArticle = await Article.findOne({
      where: {
        id: event.representativeArticleId,
        userId: event.userId,
        eventId: event.id,
        ...canonicalArticleWhere()
      },
      attributes: ['id', 'status', 'readAt'],
      transaction
    });
  }

  // Returns early when status is unread.
  if (currentArticle?.status === 'unread') {
    return currentArticle.id;
  }

  // Returns early when current article is available and incoming is eligible is available and was read before article arrived succeeds.
  if (
    currentArticle &&
    incomingIsEligible &&
    wasReadBeforeArticleArrived(currentArticle, incomingArticle)
  ) {
    return incomingArticle.id;
  }

  // Returns early when current article is available.
  if (currentArticle) {
    return currentArticle.id;
  }

  // Loads the canonical event articles needed while resolving developing article id for assignment.
  const canonicalEventArticles = await Article.findAll({
    where: {
      userId: event.userId,
      eventId: event.id,
      ...canonicalArticleWhere()
    },
    attributes: [
      'id',
      'status',
      'readAt',
      'publishedAt',
      'createdAt',
      'duplicateOfArticleId',
      'filteredInd'
    ],
    order: DEVELOPING_ARTICLE_ORDER,
    transaction
  });

  return selectDevelopingArticleId(event, canonicalEventArticles);
}
