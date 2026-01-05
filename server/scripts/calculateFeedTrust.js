/**
 * Feed Trust calculation CLI runner
 *
 * Usage:
 *   npm run feedtrust
 *   or
 *   node scripts/calculateFeedTrust.js
 */

import { Op } from 'sequelize';
import Feed from '../models/feed.js';
import { Article } from '../models/article.js';
import ArticleCluster from '../models/articleCluster.js';

/* ------------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------------ */

const EMA_ALPHA = 0.05;
const LOOKBACK_DAYS = 30;

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
    return feed.feedTrust;
  }

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

  const originality = clamp(
    0.7 * representativeRatio +
    0.3 * (1 / Math.log2(avgClusterSize + 1))
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
    0.20 * 1 // consistency placeholder
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

  return newTrust;
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
      const trust = await calculateFeedTrustForFeed(feed.id);
      console.log(
        `[FEED-TRUST] Feed ${feed.id} (${feed.feedName}) → ${trust.toFixed(3)}`
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