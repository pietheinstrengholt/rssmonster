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

/* ------------------------------------------------------------------
 * Core logic
 * ------------------------------------------------------------------ */

export async function calculateFeedTrustForFeed(feedId) {
  // Fetch the feed from database
  const feed = await Feed.findByPk(feedId);
  if (!feed) return null;

  // Calculate lookback window (e.g., last 30 days)
  const since = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );

  // Fetch all articles from this feed in the lookback period
  // Include their cluster info (to detect duplicates/syndication)
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

  /* ============================================================
   * METRIC 1: DUPLICATION RATE
   * Percentage of articles that appear in clusters (duplicated/syndicated)
   * High duplication = feed not original, likely just republishing other content
   * ============================================================ */

  let duplicatedArticles = 0;
  let duplicationSamples = 0;

  // Count how many articles are in clusters (duplicated/syndicated)
  for (const article of articles) {
    const cluster = article.cluster;
    if (!cluster) continue;

    duplicationSamples++;

    // If cluster has 2+ articles, this article is not unique
    if ((cluster.articleCount || 1) >= DUPLICATION_CLUSTER_THRESHOLD) {
      duplicatedArticles++;
    }
  }

  // Calculate duplication rate (0 = all unique, 1 = all duplicated)
  const feedDuplicationRate =
    duplicationSamples > 0
      ? duplicatedArticles / duplicationSamples
      : 0;

  /* ============================================================
   * METRIC 2: ORIGINALITY
   * Based on:
   * - How often this feed's articles are cluster representatives
   * - Average cluster size (larger clusters = more syndication)
   * ============================================================ */

  let representativeCount = 0;
  let totalClusterSize = 0;
  let clusterSamples = 0;

  // Analyze cluster statistics
  for (const article of articles) {
    const cluster = article.cluster;
    if (!cluster) continue;

    clusterSamples++;
    totalClusterSize += cluster.articleCount || 1;

    // Count if this feed's article is the cluster representative (first published)
    if (cluster.representativeArticleId === article.id) {
      representativeCount++;
    }
  }

  // Ratio of this feed's articles that are cluster reps (0 = never first, 1 = always first)
  const representativeRatio =
    clusterSamples > 0
      ? representativeCount / clusterSamples
      : 0.5;

  // Average cluster size indicates how much content is syndicated
  const avgClusterSize =
    clusterSamples > 0
      ? totalClusterSize / clusterSamples
      : 1;

  // Combine: favor high rep ratio AND small clusters
  const baseOriginality = clamp(
    0.65 * representativeRatio +
    0.35 * (1 / Math.log2(avgClusterSize + 1))
  );

  // Apply duplication penalty (avoid double-penalizing)
  const originality = clamp(
    baseOriginality * (1 - feedDuplicationRate * 0.7)
  );

  /* ============================================================
   * METRIC 3: QUALITY
   * Average of the computed quality scores of all articles
   * Quality = weighted combination of sentiment, advertisement, and writing quality
   * ============================================================ */

  let qualitySum = 0;
  // Sum quality scores of all articles
  for (const article of articles) {
    qualitySum += article.quality;
  }

  // Calculate average quality (0 = all bad, 1 = all excellent)
  const avgQuality = clamp(qualitySum / articles.length);

  /* ============================================================
   * METRIC 4: ENGAGEMENT
   * How much users interact with articles from this feed
   * Starred articles = 1 point, Clicked articles = 0.5 points
   * ============================================================ */

  let engagementSum = 0;

  // Calculate engagement points (starred = 1, clicked = 0.5)
  for (const article of articles) {
    engagementSum +=
      (article.starInd ? 1 : 0) +
      (article.clickedInd ? 0.5 : 0);
  }

  // Normalize engagement to 0-1 scale (divide by max possible: 1.5 per article)
  const engagementRate = engagementSum / articles.length;
  const engagement = clamp(engagementRate / 1.5);

  /* ============================================================
   * METRIC 5: CONSISTENCY
   * Measures publishing cadence (regularity and volume)
   * Too sparse = unreliable, too frequent = potentially spam
   * ============================================================ */

  const articlesPerDay = articles.length / LOOKBACK_DAYS;

  // Score: 4 articles/day = 1.0, 0 articles/day = 0.0
  // Scales linearly (feeds publishing once every 6 days score ~0.17)
  const consistency = clamp(articlesPerDay / 4);

  /* ============================================================
   * METRIC 6: OBSERVED TRUST (weighted combination)
   * Weights:
   *   40% Originality (most important)
   *   30% Quality
   *   15% Engagement
   *   15% Consistency
   * ============================================================ */

  const observedTrust = clamp(
    0.40 * originality +
    0.30 * avgQuality +
    0.15 * engagement +
    0.15 * consistency
  );

  // SPAM PENALTY: Very high-volume feeds (>25 articles/day) get penalized
  // e.g., a feed at 50 articles/day loses (50-25)/25 = 1.0 * 0.4 = 40% trust
  const highVolumePenalty = clamp(
    (articlesPerDay - HIGH_VOLUME_THRESHOLD_PER_DAY) /
      HIGH_VOLUME_THRESHOLD_PER_DAY,
    0,
    1
  ) * HIGH_VOLUME_MAX_PENALTY;

  const observedWithVolume = clamp(observedTrust * (1 - highVolumePenalty));

  // SPREAD AMPLIFICATION: Push scores away from 0.5 to create wider distribution
  // e.g., 0.5 stays 0.5, but 0.3 becomes 0.1, and 0.7 becomes 0.9
  let adjustedObserved = clamp(
    0.5 + (observedWithVolume - 0.5) * SPREAD_FACTOR
  );

  // BONUS: Feeds with very strong scores (≥0.85) get an extra 5% uplift
  // Reward excellence
  if (observedWithVolume >= 0.85) {
    adjustedObserved = clamp(adjustedObserved + 0.05);
  }

  /* ============================================================
   * METRIC 7: EXPONENTIAL MOVING AVERAGE (EMA) UPDATE
   * Smoothly blends observed trust with historical trust
   * Formula: new_trust = alpha * observed + (1 - alpha) * previous_trust
   * 
   * This prevents trust scores from swinging wildly on a single bad/good day
   * Alpha = 0.35 means: 35% weight on current observation, 65% on history
   * ============================================================ */

  // Get the feed's previous trust score (or baseline if new feed)
  const previousTrust =
    feed.feedTrust ?? BASELINE_TRUST;

  // Calculate new EMA trust score
  const newTrust =
    EMA_ALPHA * adjustedObserved +
    (1 - EMA_ALPHA) * previousTrust;

  // Update feed record in database
  await feed.update({
    feedTrust: clamp(newTrust)
  });

  // Return the calculated metrics for logging
  return {
    trust: newTrust,
    duplicationRate: feedDuplicationRate
  };
}

/* ================================================================
 * BATCH PROCESSING
 * Processes all active feeds at once
 * ================================================================ */

export async function calculateFeedTrustForAllFeeds() {
  // Fetch all active feeds (skip deleted/inactive feeds)
  const feeds = await Feed.findAll({
    where: { status: 'active' }
  });

  console.log(
    `[FEED-TRUST] Calculating trust for ${feeds.length} feeds`
  );

  // Process each feed individually (handles errors gracefully)
  for (const feed of feeds) {
    try {
      const result = await calculateFeedTrustForFeed(feed.id);
      if (!result) continue;

      // Log the result with feed name and metrics
      console.log(
        `[FEED-TRUST] Feed ${feed.id} (${feed.feedName}) -> ` +
        `trust=${result.trust.toFixed(3)} ` +
        `dup=${result.duplicationRate.toFixed(2)}`
      );
    } catch (err) {
      // Log errors but continue processing other feeds
      console.error(
        `[FEED-TRUST] Failed for feed ${feed.id}:`,
        err.message
      );
    }
  }
}

/* ================================================================
 * CLI EXECUTION
 * Runs when this script is executed directly from command line
 * ================================================================ */

if (process.argv[1].includes('calculateFeedTrust')) {
  // Run the batch calculation and exit with appropriate status code
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