import { Op } from 'sequelize';
import Article from '../models/article.js';
import ArticleCluster from '../models/articleCluster.js';
import assignArticleToCluster from '../util/assignArticleToCluster.js';

/* ------------------------------------------------------------------
 * FULL reclustering job (destructive, deterministic)
 * ------------------------------------------------------------------ */

const BATCH_SIZE = 50;

export async function fullReclusterArticles() {
  console.log('[CLUSTER-REBUILD] Starting FULL recluster');

  // 1. Fetch all articles with vectors, oldest first
  const articles = await Article.findAll({
    where: {
      vector: { [Op.ne]: null }
    },
    order: [['published', 'ASC']]
  });

  console.log(`[CLUSTER-REBUILD] Found ${articles.length} articles`);

  if (articles.length === 0) {
    console.log('[CLUSTER-REBUILD] Nothing to do');
    return;
  }

  // 2️. Clear article.clusterId
  await Article.update(
    { clusterId: null },
    { where: { vector: { [Op.ne]: null } } }
  );

  // 3. Remove all clusters
  await ArticleCluster.destroy({ where: {} });

  console.log('[CLUSTER-REBUILD] Cleared existing clusters');

  // 4. Rebuild clusters deterministically
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);

    for (const article of batch) {
      await assignArticleToCluster(article.id, { force: true });
    }

    console.log(
      `[CLUSTER-REBUILD] Processed ${Math.min(
        i + BATCH_SIZE,
        articles.length
      )}/${articles.length}`
    );
  }

  console.log('[CLUSTER-REBUILD] FULL reclustering finished');
}

export default fullReclusterArticles;

/* ------------------------------------------------------------------
 * CLI runner
 * ------------------------------------------------------------------ */

if (process.argv[1].includes('reclusterArticles')) {
  fullReclusterArticles()
    .then(() => {
      console.log('[CLUSTER-REBUILD] Done');
      process.exit(0);
    })
    .catch(err => {
      console.error('[CLUSTER-REBUILD] Failed:', err);
      process.exit(1);
    });
}
