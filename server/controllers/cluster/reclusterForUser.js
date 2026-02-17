// controllers/cluster/reclusterForUser.js
import crypto from 'crypto';
import db from '../../models/index.js';
import { Op } from 'sequelize';

import { assignArticleToCluster, ClusterCache } from './assignArticleToCluster.js';

const { Article, ArticleCluster } = db;

/* ------------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------------ */

const RECENCY_WINDOW_DAYS = parseInt(process.env.RECENCY_WINDOW_DAYS) || 7;

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

/* ==================================================================
 * SHARED: Assign articles & reconcile touched clusters
 * ================================================================== */

async function assignAndReconcile(userId, articles, label) {
  const touchedClusterIds = new Set();

  // Load clusters ONCE for the entire batch (avoids N redundant DB loads)
  const cache = await ClusterCache.forUser(userId);

  for (const article of articles) {
    await assignArticleToCluster(article.id, cache);

    const updated = await Article.findByPk(article.id, {
      attributes: ['clusterId']
    });

    if (updated?.clusterId) {
      touchedClusterIds.add(updated.clusterId);
    }
  }

  if (!touchedClusterIds.size) {
    console.log(`[CLUSTER] ${label}: no clusters created or updated`);
    return;
  }

  const touchedIds = [...touchedClusterIds];

  console.log(
    `[CLUSTER] ${label}: ${touchedIds.length} clusters touched ` +
    `(${articles.length} articles assigned)`
  );

  /* --- Reconcile centroids & topic keys --- */

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

    let topicKey = cluster.topicKey;

    if (!topicKey) {
      const withTopic = clusterArticles.find(
        a => Array.isArray(a.topicVector)
      );

      if (withTopic) {
        topicKey = generateTopicKey(withTopic.topicVector);
      }
    }

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

  /* --- Topic sizes & strength --- */

  const touchedTopicKeys = [
    ...new Set(
      clusters.filter(c => c.topicKey).map(c => c.topicKey)
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
}

/* ------------------------------------------------------------------
 * INCREMENTAL: Append-only for post-crawl
 *
 * Only processes articles that have no cluster yet (newly fetched).
 * Fast — no unclustering, no window scan.
 * ------------------------------------------------------------------ */

export async function incrementalClusterForUser(userId) {
  console.log(`[CLUSTER] Incremental clustering for user ${userId}`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RECENCY_WINDOW_DAYS);

  // Only consider truly new articles that haven't been clustered yet
  const articles = await Article.scope('withVector').findAll({
    where: {
      status: 'unread',
      userId,
      eventVector: { [Op.ne]: null },
      topicVector: { [Op.ne]: null },
      clusterId: null,
      published: { [Op.gte]: cutoffDate }
    },
    order: [
      ['published', 'ASC'],
      ['id', 'ASC']
    ]
  });

  if (!articles.length) {
    console.log(
      '[CLUSTER] No unclustered articles — nothing to do'
    );
    return;
  }

  console.log(
    `[CLUSTER] ${articles.length} unclustered articles to assign`
  );

  await assignAndReconcile(userId, articles, 'incremental');

  console.log(
    `[CLUSTER] Finished incremental pass for user ${userId}`
  );
}

/* ------------------------------------------------------------------
 * WINDOW REPLAY: Sliding-window recluster (CLI / scheduled)
 *
 * Strategy:
 *   1. Uncluster all articles within the recency window
 *   2. Delete clusters that become empty (all members were recent)
 *   3. Re-assign window articles against the FULL cluster set
 *      (older clusters act as stable anchors)
 *   4. Reconcile only the clusters that were touched
 *
 * Handles cascading: a single new article can shift a centroid,
 * pulling other recent articles into a different cluster.
 * ------------------------------------------------------------------ */

export async function reclusterForUser(userId) {
  console.log(`[CLUSTER] Window replay clustering for user ${userId}`);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RECENCY_WINDOW_DAYS);

  /* --- 1. Identify articles in the recency window --- */

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

  /* --- 2. Uncluster window articles --- */

  await Article.update(
    { clusterId: null },
    { where: { id: { [Op.in]: windowArticleIds } } }
  );

  /* --- 3. Delete clusters that are now empty --- */

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
    console.log(`[CLUSTER] Removed ${deletedCount} empty clusters`);
  }

  /* --- 4. Re-assign window articles against full cluster set --- */

  await assignAndReconcile(userId, windowArticles, 'replay');

  console.log(
    `[CLUSTER] Finished window replay for user ${userId}` +
    ` (window=${RECENCY_WINDOW_DAYS}d, articles=${windowArticles.length},` +
    ` pruned=${deletedCount})`
  );
}

export default reclusterForUser;
