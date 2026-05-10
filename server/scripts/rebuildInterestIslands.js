import db from '../models/index.js';
import { recordInterestFromArticleUpdate } from '../util/interestIsland.service.js';

const { Article, sequelize } = db;

const run = async () => {
  try {
    const users = await Article.findAll({
      attributes: [[Article.sequelize.fn('DISTINCT', Article.sequelize.col('userId')), 'userId']],
      raw: true
    });

    const userIds = users.map(row => Number(row.userId)).filter(Number.isFinite);
    console.log(`Rebuilding interest islands for ${userIds.length} users...`);

    for (const userId of userIds) {
      const articles = await Article.scope('withVector').findAll({
        where: { userId },
        order: [['updatedAt', 'ASC']],
        include: [
          {
            model: db.ArticleCluster,
            as: 'cluster',
            required: false,
            attributes: ['id', 'topicKey', 'topicVector', 'eventVector', 'articleCount', 'sourceCount', 'sourceDiversityScore']
          }
        ]
      });

      let processed = 0;
      for (const article of articles) {
        const changedFields = [];

        if (Number(article.starInd) === 1) changedFields.push('starInd');
        if (Number(article.clickedAmount) > 0) changedFields.push('clickedAmount');
        if (Number(article.negativeInd) === 1) changedFields.push('negativeInd');

        if (!changedFields.length) continue;

        await recordInterestFromArticleUpdate(article, changedFields);
        processed++;
      }

      console.log(`User ${userId}: processed ${processed} interest-bearing articles`);
    }

    console.log('Interest island rebuild complete.');
  } catch (error) {
    console.error('Error rebuilding interest islands:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
};

run();