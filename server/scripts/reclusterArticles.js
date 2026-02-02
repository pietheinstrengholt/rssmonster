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

/* ------------------------------------------------------------------
 * Per-user reclustering logic
 * ------------------------------------------------------------------ */

async function reclusterForUser(userId) {
  console.log(`[CLUSTER-REBUILD] Starting recluster for user ${userId}`);

  /* --------------------------------------------------------------
   * 1. Fetch user articles with vectors
   * -------------------------------------------------------------- */
  const articles = await Article.scope('withVector').findAll({
    where: {
      userId,
      vector: { [Op.ne]: null }
    },
    order: [['published', 'ASC']]
  });

  console.log(
    `[CLUSTER-REBUILD] Found ${articles.length} articles for user ${userId}`
  );

  if (articles.length === 0) {
    console.log(
      `[CLUSTER-REBUILD] No embeddable articles for user ${userId}, skipping`
    );
    return;
  }

  /* --------------------------------------------------------------
   * 2. Clear clusterId for this user's articles
   * -------------------------------------------------------------- */
  await Article.update(
    { clusterId: null },
    {
      where: {
        userId,
        vector: { [Op.ne]: null }
      }
    }
  );

  /* --------------------------------------------------------------
   * 3. Remove this user's clusters
   * -------------------------------------------------------------- */
  await ArticleCluster.destroy({
    where: { userId }
  });

  console.log(
    `[CLUSTER-REBUILD] Cleared existing clusters for user ${userId}`
  );

  /* --------------------------------------------------------------
   * 4. Rebuild clusters deterministically
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
    `[CLUSTER-REBUILD] Finished reclustering for user ${userId}`
  );

  /* --------------------------------------------------------------
  * 5. Remove single-article clusters (no grouping value)
  * -------------------------------------------------------------- */

  const singleClusters = await ArticleCluster.findAll({
    where: {
      userId,
      articleCount: 1
    },
    attributes: ['id']
  });

  if (singleClusters.length > 0) {
    const clusterIds = singleClusters.map(c => c.id);

    // Detach articles
    await Article.update(
      { clusterId: null },
      {
        where: {
          userId,
          clusterId: { [Op.in]: clusterIds }
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
      `[CLUSTER-REBUILD] Removed ${clusterIds.length} single-article clusters for user ${userId}`
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
      // continue with next user
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