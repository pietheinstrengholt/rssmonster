import db from '../../models/index.js';
import { Op } from 'sequelize';
import { RECENCY_WINDOW_DAYS } from '../config/semanticConfig.js';
import { cosineSimilarity } from '../vectors/index.js';

// Provides the shared dependencies used by this service.
const { Article, sequelize } = db;

// Defines the duplicate article status enforced by this service.
export const DUPLICATE_ARTICLE_STATUS = 'duplicate';
// Defines the duplicate similarity threshold enforced by this service.
export const DUPLICATE_SIMILARITY_THRESHOLD = Number.parseFloat(
  process.env.DUPLICATE_SIMILARITY_THRESHOLD || '0.99'
);

// This function returns the default canonical-article predicate for user-facing queries.
export function canonicalArticleWhere() {
  return {
    duplicateOfArticleId: { [Op.is]: null },
    filteredInd: false
  };
}

// This function builds a publishedAt-date candidate window around one article.
function duplicateCandidateWindow(article) {
  // Selects the center based on whether published at is available.
  const center = article?.publishedAt ? new Date(article.publishedAt) : new Date();
  // Resolves the window ms that governs performing duplicate candidate window.
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
  // Resolves the threshold that governs finding canonical duplicate for article.
  const threshold = options.threshold ?? DUPLICATE_SIMILARITY_THRESHOLD;

  // Returns no result when id is unavailable or article article vector is not an array or article article vector is empty.
  if (!article?.id || !Array.isArray(article.articleVector) || !article.articleVector.length) {
    return null;
  }

  // Loads the candidates needed while finding canonical duplicate for article.
  const candidates = await Article.findAll({
    where: {
      userId: article.userId,
      id: { [Op.lt]: article.id },
      ...canonicalArticleWhere(),
      filteredInd: false,
      articleVector: { [Op.ne]: null },
      publishedAt: duplicateCandidateWindow(article)
    },
    attributes: ['id', 'articleVector'],
    order: [['publishedAt', 'DESC'], ['id', 'DESC']],
    limit: options.limit || 300
  });

  let best = null;

  // Processes each candidates entry in turn.
  for (const candidate of candidates) {
    // Derives the similarity through cosine similarity while finding canonical duplicate for article.
    const similarity = cosineSimilarity(article.articleVector, candidate.articleVector, {
      parseStrings: true,
      coerceNumbers: true
    });

    // Skips the current entry when similarity is below threshold.
    if (similarity < threshold) continue;
    // Handles the case where best is unavailable or similarity exceeds best similarity.
    if (!best || similarity > best.similarity) {
      best = { article: candidate, similarity };
    }
  }

  return best;
}

// This function resolves a canonical article instance for duplicate counter updates.
async function resolveCanonicalArticle(canonicalArticleOrId, options = {}) {
  // Returns early when canonical article or id is available and canonical article or id is function.
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
  // Selects the write options based on whether options transaction is available.
  const writeOptions = {
    ...(options.transaction ? { transaction: options.transaction } : {})
  };
  // Selects the canonical article id based on whether canonical article or id is object.
  const canonicalArticleId = typeof canonicalArticleOrId === 'object'
    ? canonicalArticleOrId?.id
    : canonicalArticleOrId;

  // Returns no result when id is unavailable or canonical article id is unavailable or number is number.
  if (!article?.id || !canonicalArticleId || Number(article.id) === Number(canonicalArticleId)) {
    return null;
  }

  // Returns early when number is number and article status is duplicate article status.
  if (
    Number(article.duplicateOfArticleId) === Number(canonicalArticleId) &&
    article.status === DUPLICATE_ARTICLE_STATUS
  ) {
    return article;
  }

  // Resolves the canonical article while performing mark article as duplicate.
  const canonicalArticle = await resolveCanonicalArticle(canonicalArticleOrId, writeOptions);
  // Returns no result when canonical article is unavailable.
  if (!canonicalArticle) return null;

  // Builds the payload assembled while performing mark article as duplicate.
  const payload = {
    duplicateOfArticleId: canonicalArticleId,
    status: DUPLICATE_ARTICLE_STATUS,
    eventId: null,
    topicId: null,
    interestScore: 0
  };

  // Handles the case where article is function.
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
  // Builds the where assembled while performing mark duplicate articles for user.
  const where = {
    userId,
    ...canonicalArticleWhere(),
    filteredInd: false,
    articleVector: { [Op.ne]: null }
  };

  // Handles the case where options created at from is available.
  if (options.createdAtFrom) {
    where.createdAt = { [Op.gte]: options.createdAtFrom };
  }

  // Loads the articles needed while performing mark duplicate articles for user.
  const articles = await Article.findAll({
    where,
    attributes: [
      'id',
      'userId',
      'publishedAt',
      'articleVector',
      'duplicateOfArticleId',
      'status'
    ],
    order: [['id', 'ASC']],
    limit: options.limit || 1000
  });

  let duplicateCount = 0;
  // Collects the duplicates while performing mark duplicate articles for user.
  const duplicates = [];

  // Processes each articles entry in turn.
  for (const article of articles) {
    // Finds the canonical duplicate for article while performing mark duplicate articles for user.
    const match = await findCanonicalDuplicateForArticle(article, options);
    // Skips the current entry when id is unavailable.
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
  // Performs the query operation while performing repair duplicate counts.
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

  // Tracks row count source for the processing summary.
  const rowCountSource = metadata || result;
  return Number(
    rowCountSource?.affectedRows ??
    rowCountSource?.changedRows ??
    rowCountSource?.rowCount ??
    rowCountSource ??
    0
  );
}
