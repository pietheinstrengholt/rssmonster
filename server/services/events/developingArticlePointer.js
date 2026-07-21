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

// This function preserves a valid developing pointer or deterministically repairs it.
export function selectDevelopingArticleId(event, canonicalEventArticles) {
  const currentArticle = canonicalEventArticles.find(
    article => Number(article.id) === Number(event.developingArticleId)
  );

  if (currentArticle) {
    return currentArticle.id;
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

  if (event.developingArticleId == null) {
    return incomingIsEligible ? incomingArticle.id : null;
  }

  const currentArticle = await Article.findOne({
    where: {
      id: event.developingArticleId,
      userId: event.userId,
      eventId: event.id,
      ...canonicalArticleWhere()
    },
    attributes: ['id', 'status'],
    transaction
  });

  if (currentArticle?.status === 'unread') {
    return currentArticle.id;
  }

  if (currentArticle && incomingIsEligible) {
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
