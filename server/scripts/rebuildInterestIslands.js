import db from '../models/index.js';
import { recordInterestFromArticleUpdate } from '../util/interestIsland.service.js';

const { Article, UserClusterAffinity, UserInterestProfile, sequelize } = db;

const run = async () => {
  try {
    await UserClusterAffinity.destroy({ where: {} });
    await UserInterestProfile.destroy({ where: {} });

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
      let applied = 0;
      let skippedNoVector = 0;
      let skippedNoCluster = 0;
      for (const article of articles) {
        const starInd = Number(article.starInd) === 1;
        const clickedAmount = Math.max(0, Number(article.clickedAmount) || 0);
        const negativeInd = Number(article.negativeInd) === 1;

        if (starInd) {
          const outcome = await recordInterestFromArticleUpdate(article, ['starInd']);
          if (outcome?.affinityRow || outcome?.profileRow) {
            applied++;
          } else if (!article.clusterId) {
            const cluster = article.get?.('cluster') ?? article.cluster;
            const hasVector = Boolean(cluster?.topicVector || cluster?.eventVector || article.topicVector || article.eventVector);
            if (!hasVector) {
              skippedNoVector++;
            } else {
              skippedNoCluster++;
            }
          }
          processed++;
        }

        if (clickedAmount > 0) {
          const originalClickedAmount = Number(article.clickedAmount) || 0;
          article.setDataValue('clickedAmount', 1);
          for (let i = 0; i < clickedAmount; i++) {
            const outcome = await recordInterestFromArticleUpdate(article, ['clickedAmount']);
            if (outcome?.affinityRow || outcome?.profileRow) {
              applied++;
            } else if (!article.clusterId) {
              const cluster = article.get?.('cluster') ?? article.cluster;
              const hasVector = Boolean(cluster?.topicVector || cluster?.eventVector || article.topicVector || article.eventVector);
              if (!hasVector) {
                skippedNoVector++;
              } else {
                skippedNoCluster++;
              }
            }
            processed++;
          }
          article.setDataValue('clickedAmount', originalClickedAmount);
        }

        if (negativeInd) {
          const outcome = await recordInterestFromArticleUpdate(article, ['negativeInd']);
          if (outcome?.affinityRow || outcome?.profileRow) {
            applied++;
          } else if (!article.clusterId) {
            const cluster = article.get?.('cluster') ?? article.cluster;
            const hasVector = Boolean(cluster?.topicVector || cluster?.eventVector || article.topicVector || article.eventVector);
            if (!hasVector) {
              skippedNoVector++;
            } else {
              skippedNoCluster++;
            }
          }
          processed++;
        }
      }

      console.log(`User ${userId}: processed ${processed} interactions, applied ${applied}, skippedNoVector ${skippedNoVector}, skippedNoCluster ${skippedNoCluster}`);
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