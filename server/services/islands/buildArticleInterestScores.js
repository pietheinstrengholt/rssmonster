import db from '../../models/index.js';

const { sequelize } = db;

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

  const [result] = await sequelize.query(
    `
    UPDATE articles a
    INNER JOIN (
      SELECT
        atp.articleId,
        MAX(i.weight) AS interestScore
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

  const updatedCount = Array.isArray(result)
    ? Number(result[1] || 0)
    : Number(result || 0);

  return {
    userId,
    updatedCount
  };
}

export default buildArticleInterestScoresForUser;
