/**
 * Feed Trust calculation CLI runner
 *
 * This script calculates a trust score (0-1) for each feed.
 * Feed trust does not replace article quality; it summarizes a source's
 * consistent article value while keeping the article-level score separate:
 * - Article value: The average canonical article-quality score
 * - Engagement: How useful exposed articles proved to the user
 * - Originality: How many articles are canonical rather than actual duplicates
 * - Negative feedback: How often exposed articles receive explicit rejection
 *
 * Usage:
 *   npm run feedtrust
 *   or
 *   node scripts/calculateFeedTrust.js
 */

import { Op } from 'sequelize';
import db from '../models/index.js';
const { Feed, Article } = db;
import { computeArticleQuality } from '../services/articles/articleQuality.js';
import { resolvePredictedAffinity } from '../services/recommendations/predictedAffinityResolver.js';

/* ------------------------------------------------------------------
 * Configuration
 * These parameters tune how trust scores are calculated and updated
 * ------------------------------------------------------------------ */

// Feed trust and uncertain component observations share one neutral value.
const NEUTRAL_TRUST = 0.75;
const QUALITY_CONFIDENCE_TARGET = 4;
const ENGAGEMENT_CONFIDENCE_TARGET = 8;
const ORIGINALITY_CONFIDENCE_TARGET = 8;
const FEEDBACK_CONFIDENCE_TARGET = 8;
// LOOKBACK_DAYS: Only analyze articles published in the last 30 days
// Prevents old, stale data from influencing current feed trust
const LOOKBACK_DAYS = 30;

const FEED_TRUST_WEIGHTS = Object.freeze({
  articleQuality: 0.50,
  engagement: 0.20,
  originality: 0.15,
  negativeFeedbackQuality: 0.15
});

/* ------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------ */

const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));

const confidenceForSamples = (sampleCount, target) =>
  clamp(sampleCount / target);

const confidenceAdjusted = (observed, confidence) =>
  NEUTRAL_TRUST * (1 - confidence) + observed * confidence;

const hasUsableArticleQuality = article => {
  if (['pending', 'processing', 'failed'].includes(article.aiAnalysisStatus)) return false;
  return ['qualityScore', 'sentimentScore', 'advertisementScore']
    .every(field => article[field] != null && Number.isFinite(Number(article[field])));
};

// Reading state and explicit actions are the available evidence that an article was meaningfully exposed.
const hasMeaningfulExposure = article => (
  article.status === 'read' ||
  Number(article.attentionBucket) > 0 ||
  Number(article.clickedAmount) > 0 ||
  Boolean(article.favoriteInd) ||
  Number(article.negativeInd) === 1
);

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
      publishedAt: { [Op.gte]: since }
    },
    attributes: [
      'id',
      'status',
      'duplicateOfArticleId',
      'favoriteInd',
      'negativeInd',
      'clickedAmount',
      'attentionBucket',
      'qualityScore',
      'sentimentScore',
      'advertisementScore',
      'aiAnalysisStatus'
    ]
  });

  /* ============================================================
   * METRIC 1: AVERAGE ARTICLE QUALITY
   * ============================================================ */

  const qualityArticles = articles.filter(hasUsableArticleQuality);
  const averageArticleQuality = qualityArticles.length > 0
    ? qualityArticles.reduce((sum, article) => sum + computeArticleQuality(article), 0) /
      qualityArticles.length
    : NEUTRAL_TRUST;
  const qualityConfidence = confidenceForSamples(
    qualityArticles.length,
    QUALITY_CONFIDENCE_TARGET
  );

  /* ============================================================
   * METRIC 2: ENGAGEMENT
   * ============================================================ */

  const engagementArticles = articles.filter(hasMeaningfulExposure);
  const engagementSum = engagementArticles.reduce((sum, article) => {
    const explicitEngagement =
      (article.favoriteInd ? 1 : 0) +
      (article.clickedAmount > 0 ? 0.5 : 0);
    const attentionEngagement =
      attentionWeightFromBucket(article.attentionBucket);

    return sum + Math.min(
      explicitEngagement + attentionEngagement,
      2.5
    );
  }, 0);
  const engagement = engagementArticles.length > 0
    ? clamp((engagementSum / engagementArticles.length) / 2.5)
    : NEUTRAL_TRUST;
  const engagementConfidence = confidenceForSamples(
    engagementArticles.length,
    ENGAGEMENT_CONFIDENCE_TARGET
  );

  /* ============================================================
   * METRIC 3: ORIGINALITY
   * ============================================================ */

  // duplicateOfArticleId is RSSMonster's deterministic duplicate/syndication evidence.
  // Undefined means the field was unavailable, so it must not be guessed from events.
  const originalityArticles = articles.filter(article => article.duplicateOfArticleId !== undefined);
  const duplicatedArticles = originalityArticles.filter(
    article => article.duplicateOfArticleId !== null
  ).length;
  const feedDuplicationRate = originalityArticles.length > 0
    ? duplicatedArticles / originalityArticles.length
    : 0;
  const originality = originalityArticles.length > 0
    ? 1 - feedDuplicationRate
    : NEUTRAL_TRUST;
  const originalityConfidence = confidenceForSamples(
    originalityArticles.length,
    ORIGINALITY_CONFIDENCE_TARGET
  );

  /* ============================================================
   * METRIC 4: NEGATIVE FEEDBACK QUALITY
   * ============================================================ */

  const feedbackArticles = engagementArticles;
  const negativeCount = feedbackArticles.filter(
    article => Number(article.negativeInd) === 1
  ).length;
  const negativeFeedbackQuality = feedbackArticles.length > 0
    ? 1 - negativeCount / feedbackArticles.length
    : NEUTRAL_TRUST;
  const negativeFeedbackConfidence = confidenceForSamples(
    feedbackArticles.length,
    FEEDBACK_CONFIDENCE_TARGET
  );

  /* ============================================================
   * DETERMINISTIC FEED TRUST
   * ============================================================ */

  const effectiveAverageArticleQuality = confidenceAdjusted(
    averageArticleQuality,
    qualityConfidence
  );
  const effectiveEngagement = confidenceAdjusted(engagement, engagementConfidence);
  const effectiveOriginality = confidenceAdjusted(originality, originalityConfidence);
  const effectiveNegativeFeedbackQuality = confidenceAdjusted(
    negativeFeedbackQuality,
    negativeFeedbackConfidence
  );
  const newTrust = clamp(
    FEED_TRUST_WEIGHTS.articleQuality * effectiveAverageArticleQuality +
    FEED_TRUST_WEIGHTS.engagement * effectiveEngagement +
    FEED_TRUST_WEIGHTS.originality * effectiveOriginality +
    FEED_TRUST_WEIGHTS.negativeFeedbackQuality * effectiveNegativeFeedbackQuality
  );
  const sampleConfidence =
    FEED_TRUST_WEIGHTS.articleQuality * qualityConfidence +
    FEED_TRUST_WEIGHTS.engagement * engagementConfidence +
    FEED_TRUST_WEIGHTS.originality * originalityConfidence +
    FEED_TRUST_WEIGHTS.negativeFeedbackQuality * negativeFeedbackConfidence;

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

  const clickedArticles = articles.filter(article => (article.clickedAmount ?? 0) > 0).length;
  const totalClicks = articles.reduce(
    (sum, article) => sum + Math.max(Number(article.clickedAmount ?? 0), 0),
    0
  );
  const feedClickAvg = articles.length > 0 ? totalClicks / articles.length : 0;
  const feedClickRatio = articles.length > 0 ? clamp(clickedArticles / articles.length) : 0;

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
    feedClickAvg,
    feedClickRatio,
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
    feedClickAvg,
    feedClickRatio,
    feedAttentionSampleSize: attentionSamples,
    sampleConfidence,

    averageArticleQuality,
    engagement,
    originality,
    negativeFeedbackQuality,
    componentConfidences: {
      quality: qualityConfidence,
      engagement: engagementConfidence,
      originality: originalityConfidence,
      negativeFeedback: negativeFeedbackConfidence
    },

    predictedAffinity: predicted?.predictedAffinity ?? 'unknown',
    predictedConfidence: predicted?.confidence ?? 0
  };
}

/* ================================================================
 * BATCH PROCESSING
 * ================================================================ */

export async function calculateFeedTrustForAllFeeds({ userId = null } = {}) {
  const where = { status: 'active' };

  if (userId) {
    where.userId = userId;
  }

  const feeds = await Feed.findAll({
    where
  });

  console.log(
    `[FEED-TRUST] Calculating trust & attention for ${feeds.length} feeds`
  );

  let updatedCount = 0;
  let failedCount = 0;

  for (const feed of feeds) {
    try {
      const result = await calculateFeedTrustForFeed(feed.id);
      if (!result) continue;
      updatedCount++;

      console.log(
        `[FEED-TRUST] Feed ${feed.id} (${feed.feedName}) -> ` +
        `trust=${result.trust.toFixed(3)} ` +
        `affinity=${result.predictedAffinity} ` +
        `conf=${result.predictedConfidence.toFixed(2)} ` +
        `sampleConf=${result.sampleConfidence.toFixed(2)} ` +
        `att=${result.feedAttentionAvg.toFixed(2)} ` +
        `deep=${(result.feedDeepReadRatio * 100).toFixed(0)}% ` +
        `skim=${(result.feedSkimRatio * 100).toFixed(0)}% ` +
        `ignore=${(result.feedIgnoreRatio * 100).toFixed(0)}% ` +
        `clickAvg=${result.feedClickAvg.toFixed(2)} ` +
        `clickRatio=${(result.feedClickRatio * 100).toFixed(0)}% ` +
        `samples=${result.feedAttentionSampleSize}`
      );
    } catch (err) {
      failedCount++;
      console.error(
        `[FEED-TRUST] Failed for feed ${feed.id}:`,
        err.message
      );
    }
  }

  return {
    feedCount: feeds.length,
    updatedCount,
    failedCount
  };
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
