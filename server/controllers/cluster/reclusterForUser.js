// controllers/cluster/reclusterForUser.js
import crypto from 'crypto';
import db from '../../models/index.js';
import { Op } from 'sequelize';

import assignArticleToCluster from './assignArticleToCluster.js';

const { Article, ArticleCluster } = db;

/* ------------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------------ */

const RECENCY_WINDOW_DAYS = 14;

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
 * Incremental clustering for a single user (SLIDING WINDOW REPLAY)
 *
 * Strategy:
 *   1. Uncluster all articles within the recency window
 *   2. Delete clusters that become empty (all members were recent)
 *   3. Re-assign window articles against the FULL cluster set
 *      (older clusters act as stable anchors)
 *   4. Reconcile only the clusters that were touched
 *
 * This handles cascading: a single new article can shift a centroid,
 * pulling other recent articles into a different cluster.
 * ------------------------------------------------------------------ */

export async function reclusterForUser(userId) {
  console.log(`[CLUSTER] Incremental clustering for user ${userId}`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RECENCY_WINDOW_DAYS);

  /* --------------------------------------------------------------
   * 1. IDENTIFY ARTICLES IN THE RECENCY WINDOW
   * -------------------------------------------------------------- */

  const windowArticles = await Article.scope('withVector').findAll({
    where: {
      userId,
      eventVector: { [Op.ne]: null },
      topicVector: { [Op.ne]: null },
      published: { [Op.gte]: cutoffDate }
    },
    order: [
      ['published', 'ASC'],
      ['id', 'ASC']
    ]
  });

  if (!windowArticles.length) {
    console.log(
      '[CLUSTER] No vectorized articles in recency window — nothing to do'
    );
    return;
  }

  // Track which clusters had articles before we uncluster
  const previousClusterIds = new Set(
    windowArticles
      .filter(a => a.clusterId != null)
      .map(a => a.clusterId)
  );

  const windowArticleIds = windowArticles.map(a => a.id);

  console.log(
    `[CLUSTER] ${windowArticles.length} articles in ` +
    `${RECENCY_WINDOW_DAYS}-day window ` +
    `(${previousClusterIds.size} clusters affected)`
  );

  /* --------------------------------------------------------------
   * 2. UNCLUSTER WINDOW ARTICLES
   * -------------------------------------------------------------- */

  await Article.update(
    { clusterId: null },
    { where: { id: { [Op.in]: windowArticleIds } } }
  );

  /* --------------------------------------------------------------
   * 3. DELETE CLUSTERS THAT ARE NOW EMPTY
   *    (all their articles were inside the window)
   * -------------------------------------------------------------- */

  let deletedCount = 0;

  if (previousClusterIds.size) {
    for (const cid of previousClusterIds) {
      const remaining = await Article.count({
        where: { clusterId: cid }
      });

      if (remaining === 0) {
        await ArticleCluster.destroy({ where: { id: cid } });
        deletedCount++;
      }
    }
  }

  if (deletedCount) {
    console.log(
      `[CLUSTER] Removed ${deletedCount} empty clusters`
    );
  }

  /* --------------------------------------------------------------
   * 4. RE-ASSIGN WINDOW ARTICLES AGAINST FULL CLUSTER SET
   * -------------------------------------------------------------- */

  const touchedClusterIds = new Set();

  for (const article of windowArticles) {
    await assignArticleToCluster(article.id);

    // Reload to capture which cluster was assigned
    const updated = await Article.findByPk(article.id, {
      attributes: ['clusterId']
    });

    if (updated?.clusterId) {
      touchedClusterIds.add(updated.clusterId);
    }
  }

  if (!touchedClusterIds.size) {
    console.log('[CLUSTER] No clusters were created or updated');
    return;
  }

  console.log(
    `[CLUSTER] ${touchedClusterIds.size} clusters touched ` +
    `(${windowArticles.length} articles assigned)`
  );

  /* --------------------------------------------------------------
   * 5. RECONCILE TOUCHED CLUSTERS
   * -------------------------------------------------------------- */

  const touchedIds = [...touchedClusterIds];

  const clusters = await ArticleCluster.findAll({
    where: { id: { [Op.in]: touchedIds } }
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
   * 6. COMPUTE TOPIC SIZES FOR TOUCHED TOPIC KEYS
   * -------------------------------------------------------------- */

  const touchedTopicKeys = [
    ...new Set(
      clusters
        .filter(c => c.topicKey)
        .map(c => c.topicKey)
    )
  ];

  let topicSizeMap = {};

  if (touchedTopicKeys.length) {
    const topicRows = await ArticleCluster.findAll({
      where: {
        userId,
        topicKey: { [Op.in]: touchedTopicKeys }
      },
      attributes: [
        'topicKey',
        [db.sequelize.fn('COUNT', '*'), 'eventCount']
      ],
      group: ['topicKey'],
      raw: true
    });

    topicSizeMap = Object.fromEntries(
      topicRows.map(r => [r.topicKey, Number(r.eventCount)])
    );
  }

  /* --------------------------------------------------------------
   * 7. FINAL STRENGTH FOR TOUCHED CLUSTERS
   * -------------------------------------------------------------- */

  const finalClusters = await ArticleCluster.findAll({
    where: { id: { [Op.in]: touchedIds } }
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
    `[CLUSTER] Finished window replay for user ${userId}` +
    ` (window=${RECENCY_WINDOW_DAYS}d, articles=${windowArticles.length},` +
    ` clusters=${touchedClusterIds.size}, pruned=${deletedCount})`
  );
}

export default reclusterForUser;
