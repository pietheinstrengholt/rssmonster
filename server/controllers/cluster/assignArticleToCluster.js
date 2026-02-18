// controllers/cluster/assignArticleToCluster.js
import crypto from 'crypto';
import { Op } from 'sequelize';
import db from '../../models/index.js';

const { Article, ArticleCluster } = db;

/* ------------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------------ */

/**
 * -------------------------------------------------------------
 * Semantic similarity interpretation (cosine similarity)
 *
 *  Similarity | Meaning
 *  -----------|-----------------------------------------------
 *   0.95+     | Almost identical text
 *   0.90      | Same article, minor edits / syndication
 *   0.85      | Same event, different source
 *   0.78      | Related coverage (same story)
 *   < 0.70    | Different events
 *
 *  Notes:
 *  - Thresholds are empirical and model-dependent
 *  - Event clustering must remain conservative
 * -------------------------------------------------------------
 */

const EVENT_SIM_THRESHOLD = 0.88;
const TOPIC_SIM_THRESHOLD = 0.65;
const MAX_CANDIDATES = 300;

/* ------------------------------------------------------------------
 * Vector math (HARDENED)
 * ------------------------------------------------------------------ */

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (!a.length || !b.length) return 0;
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (!normA || !normB) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/* ------------------------------------------------------------------
 * Source diversity calculation
 *
 * Counts distinct feeds inside a cluster and derives a
 * logarithmic diversity score.
 *
 * Why log?
 * - 1 → 2 sources matters a lot
 * - 20 → 21 barely matters
 * ------------------------------------------------------------------ */

async function updateSourceDiversity(clusterId, userId) {
  const sourceCount = await Article.count({
    where: { clusterId, userId },
    distinct: true,
    col: 'feedId'
  });

  const sourceDiversityScore = Math.log(sourceCount + 1);

  await ArticleCluster.update(
    { sourceCount, sourceDiversityScore },
    { where: { id: clusterId } }
  );

  return { sourceCount, sourceDiversityScore };
}

/* ------------------------------------------------------------------
 * Topic key generation
 * ------------------------------------------------------------------ */

function generateTopicKey(topicVector) {
  if (!Array.isArray(topicVector)) return null;

  const slice = topicVector.slice(0, 32);
  const buffer = Buffer.from(
    slice.map(v => Math.round(v * 1e6)).join(',')
  );

  return crypto.createHash('sha1').update(buffer).digest('hex');
}

/* ------------------------------------------------------------------
 * Cluster naming
 * ------------------------------------------------------------------ */

function generateClusterName(article) {
  if (!article?.title) return null;

  let name = article.title
    .replace(/\s*[-–—|:]\s*[^-–—|:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (name.length > 120) {
    name = name.slice(0, 120).replace(/\s+\S*$/, '') + '…';
  }

  return name || null;
}

/* ------------------------------------------------------------------
 * In-memory cluster cache for batch operations
 *
 * Avoids reloading up to 300 clusters (with large JSON vectors)
 * for every single article. Load once, mutate in-memory, persist.
 * ------------------------------------------------------------------ */

export class ClusterCache {
  constructor(clusters = []) {
    this._clusters = clusters;
  }

  /**
   * Load candidate clusters for a user from DB (once per batch).
   */
  static async forUser(userId) {
    const clusters = await ArticleCluster.findAll({
      where: { userId },
      order: [['updatedAt', 'DESC']],
      limit: MAX_CANDIDATES
    });

    return new ClusterCache(clusters);
  }

  get clusters() {
    return this._clusters;
  }

  /**
   * Add a newly created cluster to the cache.
   */
  add(cluster) {
    this._clusters.unshift(cluster);

    if (this._clusters.length > MAX_CANDIDATES) {
      this._clusters.pop();
    }
  }

  /**
   * Update an existing cluster's in-memory state.
   */
  updateInMemory(clusterId, updates) {
    const cluster = this._clusters.find(c => c.id === clusterId);
    if (cluster) {
      Object.assign(cluster.dataValues, updates);
    }
  }
}

/* ------------------------------------------------------------------
 * Core clustering logic
 *
 * Accepts an optional ClusterCache to avoid redundant DB loads.
 * Falls back to loading from DB if no cache is provided.
 * ------------------------------------------------------------------ */

export async function assignArticleToCluster(articleId, cache = null) {
  const article = await Article.scope('withVector').findByPk(articleId);

  if (!article || !article.eventVector) return;

  /* --------------------------------------------------------------
   * Fetch candidate clusters (use cache or load from DB)
   * -------------------------------------------------------------- */

  const clusters = cache
    ? cache.clusters
    : (await ArticleCluster.findAll({
        where: { userId: article.userId },
        order: [['updatedAt', 'DESC']],
        limit: MAX_CANDIDATES
      }));

  let bestCluster = null;
  let bestScore = 0;

  for (const cluster of clusters) {
    if (!cluster.eventVector) continue;

    const sim = cosineSimilarity(
      article.eventVector,
      cluster.eventVector
    );

    if (sim > bestScore) {
      bestScore = sim;
      bestCluster = cluster;
    }
  }

  /* --------------------------------------------------------------
   * Phase 1 — Same event
   * -------------------------------------------------------------- */

  if (bestCluster && bestScore >= EVENT_SIM_THRESHOLD) {
    await article.update({ clusterId: bestCluster.id });

    const newCount = bestCluster.articleCount + 1;

    let updatedEventVector = bestCluster.eventVector;

    if (bestCluster.eventVector && article.eventVector) {
      const weight = 1 / newCount;
      updatedEventVector = bestCluster.eventVector.map(
        (v, i) =>
          v * (1 - weight) + article.eventVector[i] * weight
      );
    }

    await bestCluster.update({
      eventVector: updatedEventVector,
      articleCount: newCount
    });

    /* --------------------------------------------------------------
     * Update source diversity (distinct feed count)
     * -------------------------------------------------------------- */

    const diversity = await updateSourceDiversity(
      bestCluster.id,
      article.userId
    );

    // Keep cache in sync
    if (cache) {
      cache.updateInMemory(bestCluster.id, {
        eventVector: updatedEventVector,
        articleCount: newCount,
        ...diversity
      });
    }

    console.log(
      `[CLUSTER] Article ${article.id} → EVENT cluster ${bestCluster.id} (sim=${bestScore.toFixed(3)})`
    );
    return;
  }

  /* --------------------------------------------------------------
   * Phase 2 — Topic inheritance
   * -------------------------------------------------------------- */

  let topicKey = null;

  if (article.topicVector) {
    let bestTopicSim = 0;
    let bestTopicKey = null;

    for (const cluster of clusters) {
      if (!cluster.topicVector || !cluster.topicKey) continue;

      const sim = cosineSimilarity(
        article.topicVector,
        cluster.topicVector
      );

      if (sim > bestTopicSim) {
        bestTopicSim = sim;
        bestTopicKey = cluster.topicKey;
      }
    }

    topicKey =
      bestTopicSim >= TOPIC_SIM_THRESHOLD
        ? bestTopicKey
        : generateTopicKey(article.topicVector);
  }

  /* --------------------------------------------------------------
   * Phase 3 — Create new event cluster
   * -------------------------------------------------------------- */

  const name = generateClusterName(article);

  const newCluster = await ArticleCluster.create({
    userId: article.userId,
    representativeArticleId: article.id,
    name,
    articleCount: 1,
    clusterStrength: 0.2,
    topicKey,
    eventVector: article.eventVector,
    topicVector: article.topicVector ?? null,

    /* ----------------------------------------------------------
     * Initialize source diversity
     * First article → 1 source
     * ---------------------------------------------------------- */
    sourceCount: 1,
    sourceDiversityScore: Math.log(2)
  });

  if (!newCluster?.id) {
    console.warn(
      `[CLUSTER] Failed to create cluster for article ${article.id}`
    );
    return;
  }

  await article.update({ clusterId: newCluster.id });

  // Add to cache so subsequent articles can match against it
  if (cache) {
    cache.add(newCluster);
  }

  console.log(
    `[CLUSTER] Article ${article.id} → NEW EVENT cluster ${newCluster.id}` +
      (topicKey ? ` (topic=${topicKey.slice(0, 8)})` : '')
  );
}

export default assignArticleToCluster;