import db from '../../models/index.js';
import { cosineSimilarity as sharedCosineSimilarity } from '../vectors/index.js';
import { canonicalArticleWhere } from '../duplicates/articleDuplicates.js';
import { ISLAND_DEBUG } from '../islands/islandVectorUtils.js';

// This service refreshes article interest scores from island memberships.
// It uses topic-to-island links first, then falls back to article-vector similarity when needed.

// Provides the shared dependencies used by this service.
const {
  sequelize,
  Article,
  Island,
  Sequelize
} = db;

// Provides the shared dependencies used by this service.
const { Op } = Sequelize;
// Defines the default island article score threshold enforced by this service.
const DEFAULT_ISLAND_ARTICLE_SCORE_THRESHOLD = Number.parseFloat(
  process.env.ISLAND_ARTICLE_SCORE_THRESHOLD || '0.62'
);
// Defines the scorable article status enforced by this service.
const SCORABLE_ARTICLE_STATUS = 'unread';

// This function formats island score values for concise logs.
function formatIslandMetric(value, digits = 3) {
  // Coerces the numeric into the representation required while performing format island metric.
  const numeric = Number(value);
  // Selects the result based on whether numeric is finite.
  return Number.isFinite(numeric) ? numeric.toFixed(digits) : 'n/a';
}

// This function writes verbose article scoring logs only when island debugging is enabled.
function debugIslandLog(message) {
  // Returns early when island debug is unavailable.
  if (!ISLAND_DEBUG) return;
  console.log(`[ISLAND] ${message}`);
}

// This function compares two article/island vectors with cosine similarity.
function cosineSimilarity(vectorA, vectorB) {
  return sharedCosineSimilarity(vectorA, vectorB, {
    parseStrings: true,
    coerceNumbers: true
  });
}

// This function finds the strongest island-derived score for one article vector.
function strongestIslandScore(articleVector, islands, threshold) {
  let strongest = null;

  // Processes each islands entry in turn.
  for (const island of islands) {
    // Derives the similarity through cosine similarity while performing strongest island score.
    const similarity = cosineSimilarity(articleVector, island.islandVector);
    // Skips the current entry when similarity is below threshold.
    if (similarity < threshold) continue;

    // Derives the score required while performing strongest island score.
    const score = Number(island.weight || 0) * similarity;
    // Handles the case where strongest is value or abs exceeds abs.
    if (strongest === null || Math.abs(score) > Math.abs(strongest.score)) {
      strongest = {
        islandId: island.id,
        score
      };
    }
  }

  return strongest;
}

// This function normalizes dialect-specific update metadata into an affected row count.
function updatedRowCount(result, metadata) {
  // Tracks row count source for the processing summary.
  const rowCountSource = metadata || result;

  // Returns early when row count source is an array.
  if (Array.isArray(rowCountSource)) {
    return Number(rowCountSource[1] || 0);
  }

  // Returns early when row count source is available and row count source is object.
  if (rowCountSource && typeof rowCountSource === 'object') {
    return Number(
      rowCountSource.affectedRows ??
      rowCountSource.changedRows ??
      rowCountSource.rowCount ??
      0
    );
  }

  return Number(rowCountSource || 0);
}

// This function scores articles by direct vector similarity when topic links do not produce a stronger score.
async function applyVectorFallbackScores(userId, options = {}) {
  const { createdAtFrom, transaction } = options;
  // Resolves the threshold that governs applying vector fallback scores.
  const threshold = options.threshold ?? DEFAULT_ISLAND_ARTICLE_SCORE_THRESHOLD;

  // Loads the islands needed while applying vector fallback scores.
  const islands = await Island.findAll({
    where: {
      userId,
      archivedInd: false,
      islandVector: { [Op.ne]: null }
    },
    attributes: ['id', 'weight', 'islandVector'],
    order: [['id', 'ASC']],
    transaction
  });

  // Selects the articles based on whether created at from is available.
  const articles = await Article.findAll({
    where: {
      userId,
      status: SCORABLE_ARTICLE_STATUS,
      ...canonicalArticleWhere(),
      filteredInd: false,
      articleVector: { [Op.ne]: null },
      ...(createdAtFrom ? { createdAt: { [Op.gte]: createdAtFrom } } : {})
    },
    attributes: ['id', 'interestScore', 'articleVector'],
    order: [['id', 'ASC']],
    transaction
  });

  // Returns early when islands is empty or articles is empty.
  if (!islands.length || !articles.length) return 0;

  let fallbackScoredCount = 0;

  // Processes each articles entry in turn.
  for (const article of articles) {
    // Derives the fallback through strongest island score while applying vector fallback scores.
    const fallback = strongestIslandScore(article.articleVector, islands, threshold);
    // Skips the current entry when fallback is value.
    if (fallback === null) continue;

    // Coerces the current score into the representation required while applying vector fallback scores.
    const currentScore = Number(article.interestScore || 0);
    // Skips the current entry when abs is at most abs.
    if (Math.abs(fallback.score) <= Math.abs(currentScore)) continue;

    await article.update({
      interestScore: Number(fallback.score.toFixed(4))
    }, { transaction });

    debugIslandLog(
      `article=${article.id} score=${formatIslandMetric(fallback.score)} ` +
      `island=${fallback.islandId} vector-fallback`
    );

    fallbackScoredCount += 1;
  }

  return fallbackScoredCount;
}

// This function clears previous interest scores before applying current island state.
async function resetArticleInterestScores(userId, options = {}) {
  const { createdAtFrom, transaction } = options;
  // Selects the result based on whether created at from is available.
  await sequelize.query(
    `
    UPDATE articles
    SET interestScore = 0
    WHERE userId = :userId
      AND status = :status
      AND duplicateOfArticleId IS NULL
      AND filteredInd = false
      ${createdAtFrom ? 'AND createdAt >= :createdAtFrom' : ''}
    `,
    {
      replacements: { userId, status: SCORABLE_ARTICLE_STATUS, createdAtFrom },
      type: db.Sequelize.QueryTypes.UPDATE,
      transaction
    }
  );
}

// This function scores articles through topic-to-island memberships.
async function applyTopicPathScores(userId, options = {}) {
  const { createdAtFrom, transaction } = options;
  // Selects the values based on whether created at from is available.
  const [result, metadata] = await sequelize.query(
    `
    UPDATE articles a
    INNER JOIN (
      SELECT
        atp.articleId,
        CASE
          WHEN ABS(MIN(i.weight)) > ABS(MAX(i.weight)) THEN MIN(i.weight)
          ELSE MAX(i.weight)
        END AS interestScore
      FROM article_topics atp
      INNER JOIN island_topics it
        ON it.topicId = atp.topicId
      INNER JOIN islands i
        ON i.id = it.islandId
       AND i.userId = :userId
       AND i.archivedInd = 0
      INNER JOIN articles src
        ON src.id = atp.articleId
       AND src.userId = :userId
       AND src.status = :status
       AND src.duplicateOfArticleId IS NULL
       AND src.filteredInd = false
       ${createdAtFrom ? 'AND src.createdAt >= :createdAtFrom' : ''}
      GROUP BY atp.articleId
    ) scored
      ON scored.articleId = a.id
    SET a.interestScore = scored.interestScore
    WHERE a.userId = :userId
      AND a.status = :status
      AND a.duplicateOfArticleId IS NULL
      AND a.filteredInd = false
      ${createdAtFrom ? 'AND a.createdAt >= :createdAtFrom' : ''}
    `,
    {
      replacements: { userId, status: SCORABLE_ARTICLE_STATUS, createdAtFrom },
      type: db.Sequelize.QueryTypes.UPDATE,
      transaction
    }
  );

  // Derives the topic scored count through updated row count while applying topic path scores.
  const topicScoredCount = updatedRowCount(result, metadata);

  // Handles the case where island debug is available and topic scored count exceeds value.
  if (ISLAND_DEBUG && topicScoredCount > 0) {
    // Selects the topic scored rows based on whether created at from is available.
    const topicScoredRows = await sequelize.query(
      `
      SELECT
        a.id AS articleId,
        a.interestScore AS score,
        MIN(i.id) AS islandId
      FROM articles a
      INNER JOIN article_topics atp
        ON atp.articleId = a.id
      INNER JOIN island_topics it
        ON it.topicId = atp.topicId
      INNER JOIN islands i
        ON i.id = it.islandId
       AND i.userId = :userId
       AND i.archivedInd = 0
      WHERE a.userId = :userId
        AND a.status = :status
        AND a.duplicateOfArticleId IS NULL
        AND a.filteredInd = false
        AND a.interestScore <> 0
        ${createdAtFrom ? 'AND a.createdAt >= :createdAtFrom' : ''}
      GROUP BY a.id, a.interestScore
      ORDER BY a.id ASC
      `,
      {
        replacements: { userId, status: SCORABLE_ARTICLE_STATUS, createdAtFrom },
        type: db.Sequelize.QueryTypes.SELECT,
        transaction
      }
    );

    // Processes each topic scored rows entry in turn.
    for (const row of topicScoredRows) {
      debugIslandLog(
        `article=${row.articleId} score=${formatIslandMetric(row.score)} ` +
        `island=${row.islandId} topic-path`
      );
    }
  }

  return topicScoredCount;
}

// This function scores unread articles for one user from existing island state.
// It first applies topic/island memberships, then fills stronger vector fallback scores.
export async function scoreArticlesFromIslandsForUser(userId, options = {}) {
  const { createdAtFrom, transaction } = options;

  await resetArticleInterestScores(userId, { createdAtFrom, transaction });
  // Derives the topic scored count through apply topic path scores while performing score articles from islands for user.
  const topicScoredCount = await applyTopicPathScores(userId, { createdAtFrom, transaction });
  // Derives the fallback scored count through apply vector fallback scores while performing score articles from islands for user.
  const fallbackScoredCount = await applyVectorFallbackScores(userId, {
    createdAtFrom,
    transaction,
    threshold: options.articleScoreThreshold
  });

  return {
    userId,
    topicScoredCount,
    fallbackScoredCount,
    updatedCount: topicScoredCount + fallbackScoredCount
  };
}

export default scoreArticlesFromIslandsForUser;
