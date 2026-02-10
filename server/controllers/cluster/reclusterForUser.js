// controllers/cluster/reclusterForUser.js
import crypto from 'crypto';
import db from '../../models/index.js';
import { Op } from 'sequelize';

import assignArticleToCluster from './assignArticleToCluster.js';

const { Article, ArticleCluster } = db;

/* ------------------------------------------------------------------
 * Topic key generation (shared logic)
 * ------------------------------------------------------------------ */

function generateTopicKey(topicVector) {
  if (!Array.isArray(topicVector)) return null;

  const slice = topicVector.slice(0, 32);
  const buffer = Buffer.from(
    slice.map(v => Math.round(v * 1e6)).join(',')
  );

  return crypto
    .createHash('sha1')
    .update(buffer)
    .digest('hex');
}

/* ------------------------------------------------------------------
 * Cluster strength (EVENT-LEVEL)
 * ------------------------------------------------------------------ */

function computeClusterStrength({
  articleCount,
  topicEventCount
}) {
  // Redundancy: confidence grows with confirmations
  const redundancyScore = Math.min(articleCount / 3, 1); // saturates at 3

  // Topic relevance: event inside a larger story
  const topicScore = Math.min(
    Math.log2((topicEventCount ?? 1) + 1) / 3,
    1
  );

  // Cohesion placeholder (future intra-event similarity)
  const cohesionScore = 0.85;

  return Number((
    redundancyScore * 0.45 +
    cohesionScore   * 0.35 +
    topicScore      * 0.20
  ).toFixed(3));
}

/* ------------------------------------------------------------------
 * Rebuild clustering for a single user
 * ------------------------------------------------------------------ */

export async function reclusterForUser(userId) {
  console.log(`[CLUSTER] Rebuilding clusters for user ${userId}`);

  /* --------------------------------------------------------------
   * 1. HARD RESET (IDEMPOTENT)
   * -------------------------------------------------------------- */

  await Article.update(
    { clusterId: null },
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
      eventVector: { [Op.ne]: null },
      topicVector: { [Op.ne]: null }
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
   * 3. ASSIGN ARTICLES TO EVENT CLUSTERS
   * -------------------------------------------------------------- */

  for (const article of articles) {
    await assignArticleToCluster(article.id);
  }

  /* --------------------------------------------------------------
   * 3.5 RECONCILE CLUSTER VECTORS & TOPICS
   * -------------------------------------------------------------- */

  const clusters = await ArticleCluster.findAll({
    where: { userId }
  });

  for (const cluster of clusters) {
    const clusterArticles = await Article.scope('withVector').findAll({
      where: { clusterId: cluster.id }
    });

    if (!clusterArticles.length) {
      await cluster.destroy();
      continue;
    }

    /* ----------------------------------------------------------
     * Event vector centroid
     * ---------------------------------------------------------- */

    const embedded = clusterArticles.filter(
      a => Array.isArray(a.eventVector)
    );

    let eventVector = null;

    if (embedded.length) {
      eventVector = embedded[0].eventVector;

      if (embedded.length > 1) {
        eventVector = eventVector.map((_, i) =>
          embedded.reduce(
            (sum, a) => sum + a.eventVector[i],
            0
          ) / embedded.length
        );
      }
    }

    /* ----------------------------------------------------------
     * Topic key (assigned once)
     * ---------------------------------------------------------- */

    let topicKey = cluster.topicKey;

    if (!topicKey) {
      const withTopic = clusterArticles.find(
        a => Array.isArray(a.topicVector)
      );

      if (withTopic) {
        topicKey = generateTopicKey(withTopic.topicVector);
      }
    }

    /* ----------------------------------------------------------
     * Persist reconciliation
     * ---------------------------------------------------------- */

    await cluster.update({
      articleCount: clusterArticles.length,
      eventVector,
      topicKey
    });

    console.log(
      `[CLUSTER] Reconciled cluster ${cluster.id}` +
      ` articles=${clusterArticles.length}` +
      (topicKey ? ` topic=${topicKey.slice(0, 8)}` : '')
    );
  }

  /* --------------------------------------------------------------
   * 4. COMPUTE TOPIC SIZES (EVENT COUNTS PER TOPIC)
   * -------------------------------------------------------------- */

  const topicRows = await ArticleCluster.findAll({
    where: { userId },
    attributes: [
      'topicKey',
      [db.sequelize.fn('COUNT', '*'), 'eventCount']
    ],
    group: ['topicKey'],
    raw: true
  });

  const topicSizeMap = Object.fromEntries(
    topicRows.map(r => [r.topicKey, Number(r.eventCount)])
  );

  /* --------------------------------------------------------------
   * 5. FINAL STRENGTH & CONSISTENCY PASS
   * -------------------------------------------------------------- */

  const finalClusters = await ArticleCluster.findAll({
    where: { userId }
  });

  for (const cluster of finalClusters) {
    const articleCount = await Article.count({
      where: { clusterId: cluster.id }
    });

    if (articleCount === 0) {
      await cluster.destroy();
      continue;
    }

    const topicEventCount =
      topicSizeMap[cluster.topicKey] ?? 1;

    const strength = computeClusterStrength({
      articleCount,
      topicEventCount
    });

    await cluster.update({
      articleCount,
      clusterStrength: strength
    });
  }

  console.log(
    `[CLUSTER] Finished deterministic rebuild for user ${userId}`
  );
}

export default reclusterForUser;
