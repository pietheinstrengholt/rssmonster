import { Op } from 'sequelize';
import Article from '../models/article.js';
import ArticleCluster from '../models/articleCluster.js';

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
 *   0.85      | Same story, different source
 *   0.78      | Related coverage (same event/topic)
 *   0.70      | Same topic, different angle
 *   < 0.65    | Usually unrelated
 *
 *  Notes:
 *  - Thresholds are empirical and model-dependent
 *  - Start permissive for testing, tighten for production
 *  - Always compare against cluster representatives only
 * -------------------------------------------------------------
 */

const CLUSTER_SIM_THRESHOLD = 0.85; // Minimum similarity to assign to existing cluster
const DEDUP_SIM_THRESHOLD = 0.93;   // Similarity threshold to mark as duplicate
const LOOKBACK_DAYS = 7;            // Only consider articles published within the last N days
const MAX_CANDIDATES = 200;         // Max number of cluster candidates to evaluate

// Alternative thresholds for experimentation
//const CLUSTER_SIM_THRESHOLD = 0.72;
//const DEDUP_SIM_THRESHOLD   = 0.88;
//const LOOKBACK_DAYS         = 14;
//const MAX_CANDIDATES        = 500;

/* ------------------------------------------------------------------
 * Vector math
 * ------------------------------------------------------------------ */

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/* ------------------------------------------------------------------
 * Representative scoring
 * ------------------------------------------------------------------ */

function representativeScore(article) {
  const length =
    (article.contentStripped || article.contentOriginal || '').length;

  const ageHours =
    (Date.now() - new Date(article.published).getTime()) / 36e5;

  return Math.log(length + 1) - ageHours * 0.05;
}

/* ------------------------------------------------------------------
 * Cluster naming (Phase 1: deterministic, no LLM)
 * ------------------------------------------------------------------ */

function generateClusterName(article) {
  if (!article?.title) return null;

  let name = article.title
    // Remove common site suffixes
    .replace(/\s*[-–—|:]\s*[^-–—|:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Keep names readable
  if (name.length > 120) {
    name = name.slice(0, 120).replace(/\s+\S*$/, '') + '…';
  }

  return name || null;
}

/* ------------------------------------------------------------------
 * Core clustering logic
 * ------------------------------------------------------------------ */

export async function assignArticleToCluster(articleId) {
  const article = await Article.findByPk(articleId);
  if (!article || !article.vector) return;

  // Already clustered → skip
  if (article.clusterId) return;

  /* --------------------------------------------------------------
   * Fetch recent cluster representatives
   * -------------------------------------------------------------- */
  const representatives = await Article.findAll({
    where: {
      vector: { [Op.ne]: null },
      clusterId: { [Op.ne]: null },
      language: article.language,
      published: {
        [Op.gte]: new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000)
      }
    },
    order: [['published', 'DESC']],
    limit: MAX_CANDIDATES
  });

  let bestMatch = null;
  let bestScore = 0;

  for (const candidate of representatives) {
    const score = cosineSimilarity(article.vector, candidate.vector);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  /* --------------------------------------------------------------
   * No suitable cluster → create new
   * -------------------------------------------------------------- */
  if (!bestMatch || bestScore < CLUSTER_SIM_THRESHOLD) {
    const name = generateClusterName(article);

    const cluster = await ArticleCluster.create({
      representativeArticleId: article.id,
      name
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
  await article.update({ clusterId: bestMatch.clusterId });

  console.log(
    `[CLUSTER] Article ${article.id} → cluster ${bestMatch.clusterId} (sim=${bestScore.toFixed(3)})`
  );

  // Optional: mark near-duplicates
  if (bestScore >= DEDUP_SIM_THRESHOLD) {
    await article.update({ status: 'duplicate' });
  }

  /* --------------------------------------------------------------
   * Re-evaluate representative
   * -------------------------------------------------------------- */
  const clusterArticles = await Article.findAll({
    where: { clusterId: bestMatch.clusterId }
  });

  let bestRep = clusterArticles[0];
  let bestRepScore = representativeScore(bestRep);

  for (const a of clusterArticles) {
    const score = representativeScore(a);
    if (score > bestRepScore) {
      bestRep = a;
      bestRepScore = score;
    }
  }

  const cluster = await ArticleCluster.findByPk(bestMatch.clusterId);
  const repChanged = bestRep.id !== cluster.representativeArticleId;

  if (repChanged) {
    const newName = generateClusterName(bestRep);

    await cluster.update({
      representativeArticleId: bestRep.id,
      name: cluster.name ?? newName
    });

    console.log(
      `[CLUSTER] Cluster ${cluster.id} representative updated → article ${bestRep.id}` +
      (newName ? ` (${newName})` : '')
    );
  } else {
    await cluster.update({
      representativeArticleId: bestRep.id
    });
  }
}

export default assignArticleToCluster;