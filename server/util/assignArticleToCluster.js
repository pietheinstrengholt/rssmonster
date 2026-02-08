// util/assignArticleToCluster.js
import { Op } from 'sequelize';
import db from '../models/index.js';
const { Article, ArticleCluster } = db;

/* ------------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------------ */

const CLUSTER_SIM_THRESHOLD = 0.81;     // Strong semantic match
const SOFT_CLUSTER_THRESHOLD = 0.76;    // Title-only fallback
const DEDUP_SIM_THRESHOLD = 0.93;       // Near-identical
const MAX_CANDIDATES = 200;
const CLUSTER_ACTIVE_DAYS = 14;

/* ------------------------------------------------------------------
 * Vector math (HARDENED)
 * ------------------------------------------------------------------ */

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return 0;
  if (a.length === 0 || b.length === 0) return 0;
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
 * Title similarity (cheap, embedding-free)
 * ------------------------------------------------------------------ */

function normalizeTitle(title = '') {
  return title
    .toLowerCase()
    .replace(/^(breaking|update|live):?\s*/i, '')
    .replace(/\s+\|\s+.*$/, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titlesLookSimilar(a, b) {
  if (!a || !b) return false;

  const ta = new Set(normalizeTitle(a).split(' '));
  const tb = new Set(normalizeTitle(b).split(' '));
  if (!ta.size || !tb.size) return false;

  let overlap = 0;
  for (const w of ta) {
    if (tb.has(w)) overlap++;
  }

  return overlap / Math.min(ta.size, tb.size) >= 0.6;
}

/* ------------------------------------------------------------------
 * Representative scoring (embedding-independent)
 * ------------------------------------------------------------------ */

function representativeScore(article) {
  const length =
    (article.contentStripped || article.contentOriginal || '').length;

  const ageHours =
    (Date.now() - new Date(article.published).getTime()) / 36e5;

  return Math.log(length + 1) - ageHours * 0.05;
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
 * Cluster strength
 * ------------------------------------------------------------------ */

function computeClusterStrength({
  articleCount,
  embeddedCount,
  avgSimilarity
}) {
  const countScore = Math.min(articleCount / 5, 1);
  const embeddingScore =
    articleCount > 0 ? embeddedCount / articleCount : 0;
  const similarityScore = avgSimilarity ?? 0;

  return (
    countScore * 0.4 +
    embeddingScore * 0.3 +
    similarityScore * 0.3
  );
}

/* ------------------------------------------------------------------
 * Core clustering logic
 * ------------------------------------------------------------------ */

export async function assignArticleToCluster(articleId, { force = false } = {}) {
  const article = await Article.scope('withVector').findByPk(articleId);
  if (!article) return;

  // Already clustered → skip
  if (article.clusterId && !force) return;

  /* --------------------------------------------------------------
   * Fetch cluster representatives (vector OPTIONAL)
   * -------------------------------------------------------------- */
  const clusters = await ArticleCluster.findAll({
    where: {
      userId: article.userId
    },
    include: [{
      model: Article,
      as: 'representative',
      required: true
    }],
    order: [['id', 'ASC']], // determinism
    limit: MAX_CANDIDATES
  });

  let bestCluster = null;
  let bestRep = null;
  let bestScore = 0;

  for (const cluster of clusters) {
    const rep = cluster.representative;
    if (!rep) continue;

    let score = 0;

    // Tier 1: semantic similarity
    if (article.vector && rep.vector) {
      score = cosineSimilarity(article.vector, rep.vector);
    }

    // Tier 2: title fallback
    if (score === 0 && titlesLookSimilar(article.title, rep.title)) {
      score = SOFT_CLUSTER_THRESHOLD;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCluster = cluster;
      bestRep = rep;
    }
  }

  const canStrongMatch =
    article.vector &&
    bestScore >= CLUSTER_SIM_THRESHOLD;

  const canSoftMatch =
    !article.vector &&
    bestScore >= SOFT_CLUSTER_THRESHOLD;

  /* --------------------------------------------------------------
   * Create new cluster
   * -------------------------------------------------------------- */
  if (!bestCluster || !(canStrongMatch || canSoftMatch)) {
    const name = generateClusterName(article);

    const cluster = await ArticleCluster.create({
      userId: article.userId,
      representativeArticleId: article.id,
      name,
      articleCount: 1,
      clusterStrength: 0.2
    });

    await article.update({ clusterId: cluster.id });

    console.log(
      `[CLUSTER] Article ${article.id} → NEW cluster ${cluster.id}` +
      (name ? ` (${name})` : '')
    );

    return;
  }

  /* --------------------------------------------------------------
   * Assign to existing cluster
   * -------------------------------------------------------------- */
  await article.update({ clusterId: bestCluster.id });

  const assignmentSimilarity = bestScore;

  if (
    article.vector &&
    bestRep?.vector &&
    bestScore >= DEDUP_SIM_THRESHOLD &&
    article.id !== bestRep.id
  ) {
    await article.update({ status: 'duplicate' });
  }

  console.log(
    `[CLUSTER] Article ${article.id} → cluster ${bestCluster.id} (sim=${bestScore.toFixed(3)})`
  );

  /* --------------------------------------------------------------
   * Recompute articleCount (IDEMPOTENT)
   * -------------------------------------------------------------- */
  const articleCount = await Article.count({
    where: { clusterId: bestCluster.id }
  });

  /* --------------------------------------------------------------
   * Re-evaluate representative (IGNORE duplicates)
   * -------------------------------------------------------------- */
  const clusterArticles = await Article.findAll({
    where: {
      clusterId: bestCluster.id,
      status: { [Op.ne]: 'duplicate' }
    }
  });

  if (!clusterArticles.length) return;

  let bestNewRep = clusterArticles
  .sort((a, b) => a.id - b.id)[0]; // determinism
  let bestRepScore = representativeScore(bestNewRep);

  for (const a of clusterArticles) {
    const score = representativeScore(a);
    if (score > bestRepScore) {
      bestNewRep = a;
      bestRepScore = score;
    }
  }

  if (bestNewRep.id !== bestCluster.representativeArticleId) {
    const newName = generateClusterName(bestNewRep);

    await bestCluster.update({
      representativeArticleId: bestNewRep.id,
      name: bestCluster.name ?? newName
    });

    console.log(
      `[CLUSTER] Cluster ${bestCluster.id} representative updated → article ${bestNewRep.id}`
    );
  }

  /* --------------------------------------------------------------
   * Update cluster strength (IDEMPOTENT)
   * -------------------------------------------------------------- */
  const allClusterArticles = await Article.findAll({
    where: { clusterId: bestCluster.id },
    attributes: ['id', 'vector']
  });

  const embeddedCount = allClusterArticles.filter(a => a.vector).length;

  const strength = computeClusterStrength({
    articleCount,
    embeddedCount,
    avgSimilarity: assignmentSimilarity
  });

  await bestCluster.update({
    articleCount,
    clusterStrength: strength
  });

  console.log(
    `[CLUSTER] Cluster ${bestCluster.id} articleCount=${articleCount} strength=${strength.toFixed(2)}`
  );
}

export default assignArticleToCluster;