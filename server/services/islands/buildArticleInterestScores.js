import db from '../../models/index.js';
import { cosineSimilarity as sharedCosineSimilarity } from '../vectors/index.js';

// This service refreshes article interest scores from island memberships.
// It uses topic-to-island links first, then falls back to article-vector similarity when needed.

const {
  sequelize,
  Article,
  Island,
  Sequelize
} = db;

const { Op } = Sequelize;
const DEFAULT_ISLAND_ARTICLE_SCORE_THRESHOLD = Number.parseFloat(
  process.env.ISLAND_ARTICLE_SCORE_THRESHOLD || '0.62'
);
const SCORABLE_ARTICLE_STATUS = 'unread';

// This function compares two article/island vectors with cosine similarity.
function cosineSimilarity(vectorA, vectorB) {
  return sharedCosineSimilarity(vectorA, vectorB, {
    parseStrings: true,
    coerceNumbers: true
  });
}

// This function finds the strongest island-derived score for one article vector.
function strongestIslandScore(articleVector, islands, threshold) {
  let strongestScore = null;

  for (const island of islands) {
    const similarity = cosineSimilarity(articleVector, island.islandVector);
    if (similarity < threshold) continue;

    const score = Number(island.weight || 0) * similarity;
    if (strongestScore === null || Math.abs(score) > Math.abs(strongestScore)) {
      strongestScore = score;
    }
  }

  return strongestScore;
}

// This function normalizes dialect-specific update metadata into an affected row count.
function updatedRowCount(result, metadata) {
  const rowCountSource = metadata || result;

  if (Array.isArray(rowCountSource)) {
    return Number(rowCountSource[1] || 0);
  }

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
  const { transaction } = options;
  const threshold = options.threshold ?? DEFAULT_ISLAND_ARTICLE_SCORE_THRESHOLD;

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

  const articles = await Article.findAll({
    where: {
      userId,
      status: SCORABLE_ARTICLE_STATUS,
      articleVector: { [Op.ne]: null }
    },
    attributes: ['id', 'interestScore', 'articleVector'],
    order: [['id', 'ASC']],
    transaction
  });

  if (!islands.length || !articles.length) return 0;

  let fallbackScoredCount = 0;

  for (const article of articles) {
    const fallbackScore = strongestIslandScore(article.articleVector, islands, threshold);
    if (fallbackScore === null) continue;

    const currentScore = Number(article.interestScore || 0);
    if (Math.abs(fallbackScore) <= Math.abs(currentScore)) continue;

    await article.update({
      interestScore: Number(fallbackScore.toFixed(4))
    }, { transaction });

    fallbackScoredCount += 1;
  }

  return fallbackScoredCount;
}

// This function rebuilds all article interest scores for one user.
// It first applies topic/island memberships, then fills stronger vector fallback scores.
export async function buildArticleInterestScoresForUser(userId, options = {}) {
  const { transaction } = options;

  await sequelize.query(
    `
    UPDATE articles
    SET interestScore = 0
    WHERE userId = :userId
      AND status = :status
    `,
    {
      replacements: { userId, status: SCORABLE_ARTICLE_STATUS },
      type: db.Sequelize.QueryTypes.UPDATE,
      transaction
    }
  );

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
      GROUP BY atp.articleId
    ) scored
      ON scored.articleId = a.id
    SET a.interestScore = scored.interestScore
    WHERE a.userId = :userId
      AND a.status = :status
    `,
    {
      replacements: { userId, status: SCORABLE_ARTICLE_STATUS },
      type: db.Sequelize.QueryTypes.UPDATE,
      transaction
    }
  );

  const topicScoredCount = updatedRowCount(result, metadata);
  const fallbackScoredCount = await applyVectorFallbackScores(userId, {
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

export default buildArticleInterestScoresForUser;
