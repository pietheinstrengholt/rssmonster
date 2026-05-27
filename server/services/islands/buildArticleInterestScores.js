import db from '../../models/index.js';

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

function parseVector(vector) {
  if (Array.isArray(vector)) return vector;
  if (typeof vector !== 'string') return null;

  try {
    const parsed = JSON.parse(vector);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cosineSimilarity(vectorA, vectorB) {
  const a = parseVector(vectorA);
  const b = parseVector(vectorB);

  if (!a?.length || !b?.length || a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index += 1) {
    const valueA = Number(a[index] || 0);
    const valueB = Number(b[index] || 0);

    dot += valueA * valueB;
    normA += valueA * valueA;
    normB += valueB * valueB;
  }

  if (!normA || !normB) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

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

export async function buildArticleInterestScoresForUser(userId, options = {}) {
  const { transaction } = options;

  await sequelize.query(
    `
    UPDATE articles
    SET interestScore = 0
    WHERE userId = :userId
    `,
    {
      replacements: { userId },
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
      GROUP BY atp.articleId
    ) scored
      ON scored.articleId = a.id
    SET a.interestScore = scored.interestScore
    WHERE a.userId = :userId
    `,
    {
      replacements: { userId },
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
