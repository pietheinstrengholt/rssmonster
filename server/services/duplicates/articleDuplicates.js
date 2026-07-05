import db from '../../models/index.js';
import { Op } from 'sequelize';
import { RECENCY_WINDOW_DAYS } from '../config/semanticConfig.js';
import { cosineSimilarity } from '../vectors/index.js';

const { Article, sequelize } = db;

export const DUPLICATE_ARTICLE_STATUS = 'duplicate';
export const DUPLICATE_SIMILARITY_THRESHOLD = Number.parseFloat(
  process.env.DUPLICATE_SIMILARITY_THRESHOLD || '0.99'
);

// This function returns the default canonical-article predicate for user-facing queries.
export function canonicalArticleWhere() {
  return {
    duplicateOfArticleId: { [Op.is]: null }
  };
}

// This function builds a published-date candidate window around one article.
function duplicateCandidateWindow(article) {
  const center = article?.published ? new Date(article.published) : new Date();
  const windowMs = RECENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  return {
    [Op.between]: [
      new Date(center.getTime() - windowMs),
      new Date(center.getTime() + windowMs)
    ]
  };
}

// This function finds the strongest canonical article matching a candidate duplicate.
export async function findCanonicalDuplicateForArticle(article, options = {}) {
  const threshold = options.threshold ?? DUPLICATE_SIMILARITY_THRESHOLD;

  if (!article?.id || !Array.isArray(article.articleVector) || !article.articleVector.length) {
    return null;
  }

  const candidates = await Article.findAll({
    where: {
      userId: article.userId,
      id: { [Op.lt]: article.id },
      ...canonicalArticleWhere(),
      articleVector: { [Op.ne]: null },
      published: duplicateCandidateWindow(article)
    },
    attributes: ['id', 'articleVector'],
    order: [['published', 'DESC'], ['id', 'DESC']],
    limit: options.limit || 300
  });

  let best = null;

  for (const candidate of candidates) {
    const similarity = cosineSimilarity(article.articleVector, candidate.articleVector, {
      parseStrings: true,
      coerceNumbers: true
    });

    if (similarity < threshold) continue;
    if (!best || similarity > best.similarity) {
      best = { article: candidate, similarity };
    }
  }

  return best;
}

// This function resolves a canonical article instance for duplicate counter updates.
async function resolveCanonicalArticle(canonicalArticleOrId, options = {}) {
  if (canonicalArticleOrId && typeof canonicalArticleOrId.increment === 'function') {
    return canonicalArticleOrId;
  }

  return Article.findByPk(canonicalArticleOrId, {
    attributes: ['id', 'duplicateCount'],
    transaction: options.transaction
  });
}

// This function marks one article as a duplicate of its canonical article.
export async function markArticleAsDuplicate(article, canonicalArticleOrId, options = {}) {
  const writeOptions = {
    ...(options.transaction ? { transaction: options.transaction } : {})
  };
  const canonicalArticleId = typeof canonicalArticleOrId === 'object'
    ? canonicalArticleOrId?.id
    : canonicalArticleOrId;

  if (!article?.id || !canonicalArticleId || Number(article.id) === Number(canonicalArticleId)) {
    return null;
  }

  if (
    Number(article.duplicateOfArticleId) === Number(canonicalArticleId) &&
    article.status === DUPLICATE_ARTICLE_STATUS
  ) {
    return article;
  }

  const canonicalArticle = await resolveCanonicalArticle(canonicalArticleOrId, writeOptions);
  if (!canonicalArticle) return null;

  const payload = {
    duplicateOfArticleId: canonicalArticleId,
    status: DUPLICATE_ARTICLE_STATUS,
    eventId: null,
    topicId: null,
    interestScore: 0
  };

  if (typeof article.update === 'function') {
    await article.update(payload, writeOptions);
    await canonicalArticle.increment('duplicateCount', {
      by: 1,
      transaction: writeOptions.transaction
    });
    return article;
  }

  await Article.update(payload, {
    where: { id: article.id },
    ...writeOptions
  });
  await canonicalArticle.increment('duplicateCount', {
    by: 1,
    transaction: writeOptions.transaction
  });

  return { ...article, ...payload };
}

// This function detects and marks duplicate articles for one user after vectors exist.
export async function markDuplicateArticlesForUser(userId, options = {}) {
  const where = {
    userId,
    ...canonicalArticleWhere(),
    articleVector: { [Op.ne]: null }
  };

  if (options.createdAfter) {
    where.createdAt = { [Op.gte]: options.createdAfter };
  }

  const articles = await Article.findAll({
    where,
    attributes: [
      'id',
      'userId',
      'published',
      'articleVector',
      'duplicateOfArticleId',
      'status'
    ],
    order: [['id', 'ASC']],
    limit: options.limit || 1000
  });

  let duplicateCount = 0;
  const duplicates = [];

  for (const article of articles) {
    const match = await findCanonicalDuplicateForArticle(article, options);
    if (!match?.article?.id) continue;

    await markArticleAsDuplicate(article, match.article, options);
    duplicateCount++;
    duplicates.push({
      articleId: article.id,
      duplicateOfArticleId: match.article.id,
      similarity: Number(match.similarity.toFixed(6))
    });
  }

  return {
    userId,
    scannedCount: articles.length,
    duplicateCount,
    duplicates
  };
}

// This function repairs cached duplicate counters from duplicateOfArticleId source-of-truth links.
export async function repairDuplicateCounts(options = {}) {
  const { transaction = null } = options;
  const [result, metadata] = await sequelize.query(
    `
    UPDATE articles a
    LEFT JOIN (
      SELECT duplicateOfArticleId, COUNT(*) AS duplicateCount
      FROM articles
      WHERE duplicateOfArticleId IS NOT NULL
      GROUP BY duplicateOfArticleId
    ) d ON d.duplicateOfArticleId = a.id
    SET a.duplicateCount = COALESCE(d.duplicateCount, 0)
    WHERE a.duplicateOfArticleId IS NULL
    `,
    {
      type: db.Sequelize.QueryTypes.UPDATE,
      transaction
    }
  );

  const rowCountSource = metadata || result;
  return Number(
    rowCountSource?.affectedRows ??
    rowCountSource?.changedRows ??
    rowCountSource?.rowCount ??
    rowCountSource ??
    0
  );
}
