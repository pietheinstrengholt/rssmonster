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

const EMA_ALPHA = 0.05;
const LOOKBACK_DAYS = 30;

// Cluster size at which an article is considered duplicated/syndicated
const DUPLICATION_CLUSTER_THRESHOLD = 3;

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
      trust: feed.feedTrust,
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
    0.7 * representativeRatio +
    0.3 * (1 / Math.log2(avgClusterSize + 1))
  );

  // Penalize feeds that frequently publish duplicated content
  const originality = clamp(
    baseOriginality * (1 - feedDuplicationRate)
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
  const engagement = clamp(engagementRate / 2); // soft normalization

  /* --------------------------------------------------------------
   * 4) OBSERVED TRUST
   * -------------------------------------------------------------- */

  const observedTrust = clamp(
    0.35 * originality +
    0.25 * avgQuality +
    0.20 * engagement +
    0.20 * 1 // consistency placeholder (future)
  );

  /* --------------------------------------------------------------
   * 5) EMA UPDATE
   * -------------------------------------------------------------- */

  const previousTrust = feed.feedTrust ?? 0.5;

  const newTrust =
    EMA_ALPHA * observedTrust +
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
    where: {
      status: 'active'
    }
  });

  console.log(
    `[FEED-TRUST] Calculating trust for ${feeds.length} feeds`
  );

  for (const feed of feeds) {
    try {
      const result = await calculateFeedTrustForFeed(feed.id);
      console.log(
        `[FEED-TRUST] Updated feed ${feed.id} (${feed.feedName}): ` +
        `trust=${feed.feedTrust.toFixed(3)}`
      );

      if (!result || result.trust === undefined || result.duplicationRate === undefined) {
        console.log(`[FEED-TRUST] Feed ${feed.id} (${feed.feedName}) -> skipped (no valid result)`);
        continue;
      }

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