/**
 * Recluster Articles CLI runner
 *
 * Usage:
 *   npm run recluster
 *   node scripts/reclusterArticles.js
 *
 * Programmatic usage:
 *   fullReclusterArticles({ userId })
 */

import { Op } from 'sequelize';
import db from '../models/index.js';
const { Article, ArticleCluster, User } = db;

import assignArticleToCluster from '../util/assignArticleToCluster.js';

/* ------------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------------ */

const BATCH_SIZE = 250;
const RECLUSTER_DAYS = 7;

/* ------------------------------------------------------------------
 * Per-user reclustering logic (windowed)
 * ------------------------------------------------------------------ */

async function reclusterForUser(userId) {
  console.log(`[CLUSTER-REBUILD] Starting recluster for user ${userId}`);

  const cutoffDate = new Date(
    Date.now() - RECLUSTER_DAYS * 24 * 60 * 60 * 1000
  );

  /* --------------------------------------------------------------
   * 1. Fetch RECENT user articles with vectors
   * -------------------------------------------------------------- */
  const articles = await Article.scope('withVector').findAll({
    where: {
      userId,
      vector: { [Op.ne]: null },
      published: { [Op.gte]: cutoffDate }
    },
    order: [['published', 'ASC']]
  });

  console.log(
    `[CLUSTER-REBUILD] Found ${articles.length} recent articles for user ${userId}`
  );

  if (articles.length === 0) {
    console.log(
      `[CLUSTER-REBUILD] No recent embeddable articles for user ${userId}, skipping`
    );
    return;
  }

  /* --------------------------------------------------------------
   * 2. Detach RECENT articles only
   * -------------------------------------------------------------- */
  await Article.update(
    { clusterId: null },
    {
      where: {
        userId,
        vector: { [Op.ne]: null },
        published: { [Op.gte]: cutoffDate }
      }
    }
  );

  /* --------------------------------------------------------------
   * 3. Rebuild clusters for recent articles
   *    (can attach to older clusters)
   * -------------------------------------------------------------- */
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);

    for (const article of batch) {
      await assignArticleToCluster(article.id, { force: true });
    }

    console.log(
      `[CLUSTER-REBUILD] User ${userId}: processed ${Math.min(
        i + BATCH_SIZE,
        articles.length
      )}/${articles.length}`
    );
  }

  console.log(
    `[CLUSTER-REBUILD] Finished reclustering recent articles for user ${userId}`
  );

  /* --------------------------------------------------------------
   * 4. Remove single-article clusters created INSIDE window
   * -------------------------------------------------------------- */
  const singleClusters = await ArticleCluster.findAll({
    where: {
      userId,
      articleCount: 1,
      createdAt: { [Op.gte]: cutoffDate }
    },
    attributes: ['id']
  });

  if (singleClusters.length > 0) {
    const clusterIds = singleClusters.map(c => c.id);

    // Detach recent articles
    await Article.update(
      { clusterId: null },
      {
        where: {
          userId,
          clusterId: { [Op.in]: clusterIds },
          published: { [Op.gte]: cutoffDate }
        }
      }
    );

    // Remove clusters
    await ArticleCluster.destroy({
      where: {
        userId,
        id: { [Op.in]: clusterIds }
      }
    });

    console.log(
      `[CLUSTER-REBUILD] Removed ${clusterIds.length} single-article recent clusters for user ${userId}`
    );
  }
}

/* ------------------------------------------------------------------
 * FULL reclustering entrypoint
 * ------------------------------------------------------------------ */

/**
 * @param {Object} [options]
 * @param {number|null} [options.userId]
 */
export async function fullReclusterArticles({ userId = null } = {}) {
  // Case 1: Explicit userId provided
  if (userId) {
    await reclusterForUser(userId);
    return;
  }

  // Case 2: No userId → recluster all users
  console.log('[CLUSTER-REBUILD] No userId provided, reclustering ALL users');

  const users = await User.findAll({
    attributes: ['id'],
    order: [['id', 'ASC']]
  });

  console.log(
    `[CLUSTER-REBUILD] Found ${users.length} users to recluster`
  );

  for (const user of users) {
    try {
      await reclusterForUser(user.id);
    } catch (err) {
      console.error(
        `[CLUSTER-REBUILD] Failed reclustering for user ${user.id}:`,
        err
      );
    }
  }

  console.log('[CLUSTER-REBUILD] Finished reclustering ALL users');
}

export default fullReclusterArticles;

/* ------------------------------------------------------------------
 * CLI runner
 * ------------------------------------------------------------------ */

if (process.argv[1]?.includes('reclusterArticles')) {
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