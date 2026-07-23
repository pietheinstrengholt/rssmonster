import db from '../../models/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';

const { Article } = db;
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
  if (!article?.readAt || !incomingArticle?.createdAt) {
    return false;
  }

  const readAt = new Date(article.readAt).getTime();
  const incomingCreatedAt = new Date(incomingArticle.createdAt).getTime();

  return Number.isFinite(readAt) &&
    Number.isFinite(incomingCreatedAt) &&
    readAt < incomingCreatedAt;
}

// This function preserves a valid developing pointer or deterministically repairs it.
export function selectDevelopingArticleId(event, canonicalEventArticles) {
  const currentArticle = canonicalEventArticles.find(
    article => Number(article.id) === Number(event.developingArticleId)
  );

  if (currentArticle) {
    return currentArticle.id;
  }

  const representativeArticle = canonicalEventArticles.find(
    article => Number(article.id) === Number(event.representativeArticleId)
  );

  if (representativeArticle) {
    return canonicalEventArticles.find(article =>
      article.status === 'unread' &&
      wasReadBeforeArticleArrived(representativeArticle, article)
    )?.id ?? representativeArticle.id;
  }

  return canonicalEventArticles.find(article => article.status === 'unread')?.id ??
    canonicalEventArticles[0]?.id ??
    null;
}

// This function resolves the sticky developing pointer when an article joins an existing event.
export async function resolveDevelopingArticleIdForAssignment({
  event,
  incomingArticle,
  transaction = null
}) {
  const incomingIsEligible = isCanonicalUnreadArticle(incomingArticle);
  const pointerId = event.developingArticleId ?? event.representativeArticleId;
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

  if (currentArticle?.status === 'unread') {
    return currentArticle.id;
  }

  if (
    currentArticle &&
    incomingIsEligible &&
    wasReadBeforeArticleArrived(currentArticle, incomingArticle)
  ) {
    return incomingArticle.id;
  }

  if (currentArticle) {
    return currentArticle.id;
  }

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
