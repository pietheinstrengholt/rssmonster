/**
 * Feed Trust calculation CLI runner
 *
 * Usage:
 *   npm run feedtrust
 *   or
 *   node scripts/calculateFeedTrust.js
 */

import { Op } from 'sequelize';
import db from '../models/index.js';
const { Feed, Article, ArticleCluster } = db;

/* ------------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------------ */

// Trust sensitivity: higher alpha responds faster to recent observations
const EMA_ALPHA = 0.35;
// Baseline trust for feeds with no history
const BASELINE_TRUST = 0.8;
// Amplify deviation from neutral (0.5) to widen score spread
const SPREAD_FACTOR = 2.0;
// Above this many articles per day, we start penalizing for spammy volume
const HIGH_VOLUME_THRESHOLD_PER_DAY = 25;
// Max penalty applied when volume is extremely high
const HIGH_VOLUME_MAX_PENALTY = 0.4;
const LOOKBACK_DAYS = 30;

// Cluster size at which an article is considered duplicated/syndicated
const DUPLICATION_CLUSTER_THRESHOLD = 2;

/* ------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------ */

const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));

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
      published: {
        [Op.gte]: since
      }
    },
    include: [
      {
        model: ArticleCluster,
        as: 'cluster'
      }
    ]
  });

  if (!articles.length) {
    return {
      trust: feed.feedTrust ?? 0.5,
      duplicationRate: 0
    };
  }

  /* --------------------------------------------------------------
   * Feed duplication rate
   * -------------------------------------------------------------- */

  let duplicatedArticles = 0;
  let duplicationSamples = 0;

  for (const article of articles) {
    const cluster = article.cluster;
    if (!cluster) continue;

    duplicationSamples++;

    if ((cluster.articleCount || 1) >= DUPLICATION_CLUSTER_THRESHOLD) {
      duplicatedArticles++;
    }
  }

  const feedDuplicationRate =
    duplicationSamples > 0
      ? duplicatedArticles / duplicationSamples
      : 0;

  /* --------------------------------------------------------------
   * 1) ORIGINALITY
   * -------------------------------------------------------------- */

  let representativeCount = 0;
  let totalClusterSize = 0;
  let clusterSamples = 0;

  for (const article of articles) {
    const cluster = article.cluster;
    if (!cluster) continue;

    clusterSamples++;
    totalClusterSize += cluster.articleCount || 1;

    if (cluster.representativeArticleId === article.id) {
      representativeCount++;
    }
  }

  const representativeRatio =
    clusterSamples > 0
      ? representativeCount / clusterSamples
      : 0.5;

  const avgClusterSize =
    clusterSamples > 0
      ? totalClusterSize / clusterSamples
      : 1;

  const baseOriginality = clamp(
    0.65 * representativeRatio +
    0.35 * (1 / Math.log2(avgClusterSize + 1))
  );

  // Softer duplication penalty (avoid double punishment)
  const originality = clamp(
    baseOriginality * (1 - feedDuplicationRate * 0.7)
  );

  /* --------------------------------------------------------------
   * 2) QUALITY
   * -------------------------------------------------------------- */

  let qualitySum = 0;
  for (const article of articles) {
    qualitySum += article.quality;
  }

  const avgQuality = clamp(qualitySum / articles.length);

  /* --------------------------------------------------------------
   * 3) ENGAGEMENT
   * -------------------------------------------------------------- */

  let engagementSum = 0;

  for (const article of articles) {
    engagementSum +=
      (article.starInd ? 1 : 0) +
      (article.clickedInd ? 0.5 : 0);
  }

  const engagementRate = engagementSum / articles.length;
  const engagement = clamp(engagementRate / 1.5);

  /* --------------------------------------------------------------
   * 4) CONSISTENCY (publishing cadence)
   * -------------------------------------------------------------- */

  const articlesPerDay = articles.length / LOOKBACK_DAYS;

  // 0–4 articles/day → 0–1 score (slightly stricter)
  const consistency = clamp(articlesPerDay / 4);

  /* --------------------------------------------------------------
   * 5) OBSERVED TRUST
   * -------------------------------------------------------------- */

  const observedTrust = clamp(
    0.40 * originality +
    0.30 * avgQuality +
    0.15 * engagement +
    0.15 * consistency
  );

  // Penalize extremely high-volume feeds (spammy behavior)
  const highVolumePenalty = clamp(
    (articlesPerDay - HIGH_VOLUME_THRESHOLD_PER_DAY) /
      HIGH_VOLUME_THRESHOLD_PER_DAY,
    0,
    1
  ) * HIGH_VOLUME_MAX_PENALTY;

  const observedWithVolume = clamp(observedTrust * (1 - highVolumePenalty));

  // Widen the range by pushing values away from 0.5
  let adjustedObserved = clamp(
    0.5 + (observedWithVolume - 0.5) * SPREAD_FACTOR
  );

  // Additional uplift for very strong observed scores
  if (observedWithVolume >= 0.85) {
    adjustedObserved = clamp(adjustedObserved + 0.05);
  }

  /* --------------------------------------------------------------
   * 6) EMA UPDATE
   * -------------------------------------------------------------- */

  const previousTrust =
    feed.feedTrust ?? BASELINE_TRUST;

  const newTrust =
    EMA_ALPHA * adjustedObserved +
    (1 - EMA_ALPHA) * previousTrust;

  await feed.update({
    feedTrust: clamp(newTrust)
  });

  return {
    trust: newTrust,
    duplicationRate: feedDuplicationRate
  };
}

/* ------------------------------------------------------------------
 * Batch runner
 * ------------------------------------------------------------------ */

export async function calculateFeedTrustForAllFeeds() {
  const feeds = await Feed.findAll({
    where: { status: 'active' }
  });

  console.log(
    `[FEED-TRUST] Calculating trust for ${feeds.length} feeds`
  );

  for (const feed of feeds) {
    try {
      const result = await calculateFeedTrustForFeed(feed.id);
      if (!result) continue;

      console.log(
        `[FEED-TRUST] Feed ${feed.id} (${feed.feedName}) -> ` +
        `trust=${result.trust.toFixed(3)} ` +
        `dup=${result.duplicationRate.toFixed(2)}`
      );
    } catch (err) {
      console.error(
        `[FEED-TRUST] Failed for feed ${feed.id}:`,
        err.message
      );
    }
  }
}

/* ------------------------------------------------------------------
 * CLI runner
 * ------------------------------------------------------------------ */

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