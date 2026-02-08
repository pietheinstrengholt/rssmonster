// util/reclusterForUser.js
import db from '../models/index.js';
const { Article, ArticleCluster } = db;
import { Op } from 'sequelize';

import assignArticleToCluster from './assignArticleToCluster.js';

export async function reclusterForUser(userId) {
  console.log(`[CLUSTER] Rebuilding clusters for user ${userId}`);

  /* --------------------------------------------------------------
   * 1. HARD RESET (IDEMPOTENT)
   * -------------------------------------------------------------- */

  await Article.update(
    { clusterId: null, status: 'unread' },
    { where: { userId } }
  );

  await ArticleCluster.destroy({
    where: { userId }
  });

  /* --------------------------------------------------------------
   * 2. LOAD ARTICLES (DETERMINISTIC ORDER)
   * -------------------------------------------------------------- */

  const articles = await Article.scope('withVector').findAll({
    where: {
      userId,
      vector: { [Op.ne]: null }
    },
    order: [
      ['published', 'ASC'],
      ['id', 'ASC']
    ]
  });

  console.log(
    `[CLUSTER] ${articles.length} articles loaded for clustering`
  );

  /* --------------------------------------------------------------
   * 3. ASSIGN ARTICLES
   * -------------------------------------------------------------- */

  for (const article of articles) {
    await assignArticleToCluster(article.id, { force: true });
  }

  /* --------------------------------------------------------------
   * 4. FINAL CONSISTENCY PASS
   * -------------------------------------------------------------- */

  const clusters = await ArticleCluster.findAll({
    where: { userId }
  });

  for (const cluster of clusters) {
    const articleCount = await Article.count({
      where: { clusterId: cluster.id }
    });

    if (articleCount === 0) {
      await cluster.destroy();
      continue;
    }

    await cluster.update({ articleCount });
  }

  console.log(
    `[CLUSTER] Finished deterministic rebuild for user ${userId}`
  );
}

export default reclusterForUser;