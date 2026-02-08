/**
 * Feed Trust calculation CLI runner
 *
 * This script calculates a trust score (0-1) for each feed based on:
 * - Originality: How many articles are original vs duplicates
 * - Quality: Computed quality scores of articles
 * - Engagement: How many articles users star or click
 * - Consistency: Publishing frequency/cadence
 * - Volume penalties: Very spammy/high-volume feeds are penalized
 *
 * Uses exponential moving average (EMA) to smoothly update trust over time.
 *
 * Usage:
 *   npm run feedtrust
 *   or
 *   node scripts/calculateFeedTrust.js
 */

import { Op } from 'sequelize';
import db from '../models/index.js';
const { Feed, Article, ArticleCluster } = db;
import { resolvePredictedAffinity } from '../util/predictedAffinityResolver.js';

/* ------------------------------------------------------------------
 * Configuration
 * These parameters tune how trust scores are calculated and updated
 * ------------------------------------------------------------------ */

// EMA_ALPHA controls how quickly the trust score responds to new data
// Higher alpha = faster response to recent observations (more volatile)
// Lower alpha = slower response, more stable (historical bias)
// 0.35 means: new_trust = 0.35 * observed + 0.65 * previous_trust
const EMA_ALPHA = 0.35;
// BASELINE_TRUST: Initial trust for new feeds with no history
// Start optimistic (0.9) and let the algorithm adjust down if needed
const BASELINE_TRUST = 0.9;
// SPREAD_FACTOR: Amplify deviation from neutral (0.5) to create wider score distribution
// Without this, scores would cluster around 0.5. This pushes good feeds higher and bad feeds lower.
const SPREAD_FACTOR = 2.0;
// HIGH_VOLUME_THRESHOLD_PER_DAY: Feeds publishing more than this per day start getting penalized
// Helps identify spam/clickbait feeds that flood with content
const HIGH_VOLUME_THRESHOLD_PER_DAY = 25;
// HIGH_VOLUME_MAX_PENALTY: Maximum trust reduction applied at extreme volumes
// e.g., a feed at 50+ articles/day loses up to 40% trust
const HIGH_VOLUME_MAX_PENALTY = 0.4;
// NEGATIVE_MAX_PENALTY: Maximum trust reduction for negativeInd articles.
// Applies a gentle, sublinear scaling (sqrt) so a few negatives still signal
// an issue without overwhelming the score when counts are low.
const NEGATIVE_MAX_PENALTY = 0.2;
// MUTE_MAX_PENALTY: Maximum penalty when a feed has been muted recently
// MUTE_STALE_MONTHS: Penalize if mutedUntil is within the last MUTE_STALE_MONTHS
const MUTE_MAX_PENALTY = 0.2;
const MUTE_STALE_MONTHS = 6;
// LOOKBACK_DAYS: Only analyze articles published in the last 30 days
// Prevents old, stale data from influencing current feed trust
const LOOKBACK_DAYS = 30;

// DUPLICATION_CLUSTER_THRESHOLD: Articles in clusters of 2+ are considered duplicates/syndication
// A cluster with 1 article = original; 2+ articles = the content appears elsewhere (less original)
const DUPLICATION_CLUSTER_THRESHOLD = 2;

/* ------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------ */

const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));

const attentionWeightFromBucket = (bucket) => {
  switch (bucket) {
    case 1: return 0.25;
    case 2: return 0.75;
    case 3: return 1.25;
    case 4: return 1.75;
    default: return 0;
  }
};

const attentionScoreFromBucket = (bucket) => {
  switch (bucket) {
    case 4: return 1.0;
    case 3: return 0.75;
    case 2: return 0.5;
    case 1: return 0.25;
    default: return 0;
  }
};

/* ------------------------------------------------------------------
 * Core logic
 * ------------------------------------------------------------------ */

export async function calculateFeedTrustForFeed(feedId) {
  const feed = await Feed.findByPk(feedId);
  if (!feed) return null;

  const since = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );

  const articles = await Article.findAll({
    where: {
      feedId: feed.id,
      published: { [Op.gte]: since }
    },
    include: [
      { model: ArticleCluster, as: 'cluster' }
    ]
  });

  const safe = (v) => (typeof v === 'number' && !Number.isNaN(v) ? v : 0);

  if (!articles.length) {
    return {
      trust: newTrust,
      duplicationRate: feedDuplicationRate,

      feedAttentionAvg: safe(feedAttentionAvg),
      feedDeepReadRatio: safe(feedDeepReadRatio),
      feedSkimRatio: safe(feedSkimRatio),
      feedIgnoreRatio: safe(feedIgnoreRatio),
      feedAttentionSampleSize: attentionSamples,

      predictedAffinity: predicted?.predictedAffinity ?? 'medium',
      predictedConfidence: safe(predicted?.confidence)
    };
  }

  /* ============================================================
   * METRIC 1: DUPLICATION RATE
   * ============================================================ */

  let duplicatedArticles = 0;
  let duplicationSamples = 0;

  for (const article of articles) {
    if (!article.cluster) continue;
    duplicationSamples++;
    if ((article.cluster.articleCount || 1) >= DUPLICATION_CLUSTER_THRESHOLD) {
      duplicatedArticles++;
    }
  }

  const feedDuplicationRate =
    duplicationSamples > 0
      ? duplicatedArticles / duplicationSamples
      : 0;

  /* ============================================================
   * METRIC 2: ORIGINALITY
   * ============================================================ */

  let representativeCount = 0;
  let totalClusterSize = 0;
  let clusterSamples = 0;

  for (const article of articles) {
    if (!article.cluster) continue;
    clusterSamples++;
    totalClusterSize += article.cluster.articleCount || 1;
    if (article.cluster.representativeArticleId === article.id) {
      representativeCount++;
    }
  }

  const representativeRatio =
    clusterSamples > 0 ? representativeCount / clusterSamples : 0.5;

  const avgClusterSize =
    clusterSamples > 0 ? totalClusterSize / clusterSamples : 1;

  const baseOriginality = clamp(
    0.65 * representativeRatio +
    0.35 * (1 / Math.log2(avgClusterSize + 1))
  );

  const originality = clamp(
    baseOriginality * (1 - feedDuplicationRate * 0.7)
  );

  /* ============================================================
   * METRIC 3: QUALITY
   * ============================================================ */

  let qualitySum = 0;
  for (const article of articles) {
    qualitySum += article.quality;
  }
  const avgQuality = clamp(qualitySum / articles.length);

  /* ============================================================
   * METRIC 4: ENGAGEMENT
   * ============================================================ */

  let engagementSum = 0;

  for (const article of articles) {
    const explicitEngagement =
      (article.starInd ? 1 : 0) +
      (article.clickedAmount > 0 ? 0.5 : 0);

    const attentionEngagement =
      attentionWeightFromBucket(article.attentionBucket);

    engagementSum += Math.min(
      explicitEngagement + attentionEngagement,
      2.5
    );
  }

  const engagement = clamp(
    (engagementSum / articles.length) / 2.5
  );

  /* ============================================================
   * METRIC 5: CONSISTENCY
   * ============================================================ */

  const articlesPerDay = articles.length / LOOKBACK_DAYS;
  const consistency = clamp(articlesPerDay / 4);

  /* ============================================================
   * METRIC 6: NEGATIVE FEEDBACK
   * ============================================================ */

  let negativeCount = 0;
  for (const article of articles) {
    if (article.negativeInd === 1) negativeCount++;
  }
  const negativeRate =
    articles.length > 0 ? negativeCount / articles.length : 0;

  /* ============================================================
   * METRIC 7: OBSERVED TRUST
   * ============================================================ */

  const observedTrust = clamp(
    0.40 * originality +
    0.30 * avgQuality +
    0.15 * engagement +
    0.15 * consistency
  );

  const highVolumePenalty = clamp(
    (articlesPerDay - HIGH_VOLUME_THRESHOLD_PER_DAY) /
      HIGH_VOLUME_THRESHOLD_PER_DAY,
    0,
    1
  ) * HIGH_VOLUME_MAX_PENALTY;

  const negativePenalty =
    clamp(Math.sqrt(negativeRate) * NEGATIVE_MAX_PENALTY);

  let observedWithPenalties = clamp(
    observedTrust *
    (1 - highVolumePenalty) *
    (1 - negativePenalty)
  );

  if (feed.mutedUntil) {
    const cutoff =
      Date.now() - MUTE_STALE_MONTHS * 30 * 24 * 60 * 60 * 1000;
    const muteTime = new Date(feed.mutedUntil).getTime();
    if (muteTime >= cutoff && muteTime <= Date.now()) {
      observedWithPenalties *= (1 - MUTE_MAX_PENALTY);
    }
  }

  let adjustedObserved = clamp(
    0.5 + (observedWithPenalties - 0.5) * SPREAD_FACTOR
  );

  if (observedWithPenalties >= 0.85) {
    adjustedObserved = clamp(adjustedObserved + 0.05);
  }

  const previousTrust = feed.feedTrust ?? BASELINE_TRUST;
  const newTrust =
    EMA_ALPHA * adjustedObserved +
    (1 - EMA_ALPHA) * previousTrust;

  /* ============================================================
   * FEED ATTENTION STATS (NEW)
   * ============================================================ */

  let attentionSum = 0;
  let attentionSamples = 0;
  let deepReads = 0;
  let skimReads = 0;
  let ignored = 0;

  for (const article of articles) {
    const bucket = article.attentionBucket ?? 0;
    const score = attentionScoreFromBucket(bucket);

    if (bucket > 0) {
      attentionSum += score;
      attentionSamples++;
      if (bucket >= 3) deepReads++;
      else if (bucket === 1) skimReads++;
    } else {
      ignored++;
    }
  }

  const feedAttentionAvg =
    attentionSamples > 0
      ? clamp(attentionSum / attentionSamples)
      : 0;

  const feedDeepReadRatio =
    attentionSamples > 0 ? deepReads / attentionSamples : 0;

  const feedSkimRatio =
    attentionSamples > 0 ? skimReads / attentionSamples : 0;

  const feedIgnoreRatio =
    articles.length > 0 ? ignored / articles.length : 0;

  /* ============================================================
   * UPDATE FEED
   * ============================================================ */

  const now = new Date();
  await feed.update({
    feedTrust: clamp(newTrust),
    feedDuplicationRate,

    feedAttentionAvg,
    feedDeepReadRatio,
    feedSkimRatio,
    feedIgnoreRatio,
    feedAttentionSampleSize: attentionSamples,
    feedAttentionUpdatedAt: now
  });

  /* ============================================================
   * DEBUG: Predicted Reading Affinity (for new articles)
   * ============================================================ */

  const predicted = resolvePredictedAffinity({
    article: {
      attentionBucket: 0,
      status: 'unread'
    },
    feed
  });

  return {
    trust: newTrust,
    duplicationRate: feedDuplicationRate,

    feedAttentionAvg,
    feedDeepReadRatio,
    feedSkimRatio,
    feedIgnoreRatio,
    feedAttentionSampleSize: attentionSamples,

    predictedAffinity: predicted?.predictedAffinity ?? 'unknown',
    predictedConfidence: predicted?.confidence ?? 0
  };
}

/* ================================================================
 * BATCH PROCESSING
 * ================================================================ */

export async function calculateFeedTrustForAllFeeds() {
  const feeds = await Feed.findAll({
    where: { status: 'active' }
  });

  console.log(
    `[FEED-TRUST] Calculating trust & attention for ${feeds.length} feeds`
  );

  for (const feed of feeds) {
    try {
      const result = await calculateFeedTrustForFeed(feed.id);
      if (!result) continue;

      console.log(
        `[FEED-TRUST] Feed ${feed.id} (${feed.feedName}) -> ` +
        `trust=${result.trust.toFixed(3)} ` +
        `affinity=${result.predictedAffinity} ` +
        `conf=${result.predictedConfidence.toFixed(2)} ` +
        `att=${result.feedAttentionAvg.toFixed(2)} ` +
        `deep=${(result.feedDeepReadRatio * 100).toFixed(0)}% ` +
        `skim=${(result.feedSkimRatio * 100).toFixed(0)}% ` +
        `ignore=${(result.feedIgnoreRatio * 100).toFixed(0)}% ` +
        `samples=${result.feedAttentionSampleSize}`
      );
    } catch (err) {
      console.error(
        `[FEED-TRUST] Failed for feed ${feed.id}:`,
        err.message
      );
    }
  }
}

/* ================================================================
 * CLI EXECUTION
 * ================================================================ */

if (process.argv[1].includes('calculateFeedTrust')) {
  calculateFeedTrustForAllFeeds()
    .then(() => {
      console.log('[FEED-TRUST] Done');
      process.exit(0);
    })
    .catch(err => {
      console.error('[FEED-TRUST] Failed:', err);
      process.exit(1);
    });
}