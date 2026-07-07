// Predicts how a user is likely to read a new unread article from feed-level attention history.
// The resolver is deterministic, explainable, and side-effect free.

// Clamps a numeric score into the expected confidence range.
const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));

// Normalizes feed behavior metrics into the expected 0-1 range.
const metric = value => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? clamp(numericValue) : 0;
};

// Resolves predicted reading affinity for a single article/feed pair.
export function resolvePredictedAffinity({ article, feed }) {
  // Safety checks
  if (!article || !feed) {
    return {
      predictedAffinity: 'medium',
      confidence: 0.25,
      source: 'default'
    };
  }

  // Only predict for unread / untouched articles
  if (article.attentionBucket > 0 || article.status !== 'unread') {
    return {
      predictedAffinity: null,
      confidence: 1,
      source: 'measured'
    };
  }

  const {
    feedAttentionAvg = 0,
    feedDeepReadRatio = 0,
    feedSkimRatio = 0,
    feedIgnoreRatio = 0,
    feedClickAvg = 0,
    feedClickRatio = 0,
    feedAttentionSampleSize = 0
  } = feed;

  const attentionScore = metric(feedAttentionAvg);
  const deepReadRatio = metric(feedDeepReadRatio);
  const skimRatio = metric(feedSkimRatio);
  const ignoreRatio = metric(feedIgnoreRatio);
  const clickRatio = metric(feedClickRatio);
  const clickAvgSignal = clamp(Math.log2(Math.max(Number(feedClickAvg) || 0, 0) + 1) / 2);
  const clickSignal = clamp(clickRatio * 0.7 + clickAvgSignal * 0.3);
  const sampleSize = Math.max(Number(feedAttentionSampleSize) || 0, 0);
  const engagementScore = clamp(
    attentionScore * 0.5 +
    deepReadRatio * 0.2 +
    clickSignal * 0.2 +
    skimRatio * 0.1 -
    ignoreRatio * 0.25
  );

  /* ------------------------------------------------------------
   * Cold start handling
   * ------------------------------------------------------------ */

  // Not enough behavioral data and no meaningful click signal → safe default
  if (sampleSize < 8 && clickSignal < 0.08) {
    return {
      predictedAffinity: 'cold',
      confidence: 0.25,
      source: 'feed',
      engagementScore
    };
  }

  /* ------------------------------------------------------------
   * Decision tree (calibrated on real production data)
   *
   * Observations:
   * - feedAttentionAvg usually lives between 0.28–0.38
   * - deepReadRatio > 10–12% is already exceptional
   * - click behavior is a secondary engagement signal for feeds that invite follow-through
   * - skim-heavy feeds are normal and valuable
   * ------------------------------------------------------------ */

  let predictedAffinity;
  let confidence;

  // Rare but strong signal: deep reading behavior
  if (
    (
      deepReadRatio >= 0.12 &&
      attentionScore >= 0.35
    ) ||
    (
      engagementScore >= 0.45 &&
      deepReadRatio >= 0.08
    )
  ) {
    predictedAffinity = 'deep';
    confidence = clamp(
      0.55 +
      engagementScore * 0.35 +
      deepReadRatio * 0.5 +
      Math.min(sampleSize / 50, 0.15)
    );
  } else if (
    engagementScore >= 0.27 ||
    attentionScore >= 0.30 ||
    clickSignal >= 0.18
  ) {
    // Normal engaged reading (most good feeds)
    predictedAffinity = 'medium';
    confidence = clamp(
      0.45 +
      engagementScore * 0.45 +
      clickSignal * 0.25 +
      Math.min(sampleSize / 100, 0.15)
    );
  } else if (
    attentionScore >= 0.18 ||
    skimRatio >= 0.60 ||
    clickSignal >= 0.08
  ) {
    // Headline / scanning value
    predictedAffinity = 'skim';
    confidence = clamp(
      0.40 +
      engagementScore * 0.35 +
      clickSignal * 0.3 +
      Math.min(sampleSize / 150, 0.1)
    );
  } else {
    // Default: muted / collapsed by default
    predictedAffinity = 'ignore';
    confidence = clamp(
      0.4 +
      Math.min(sampleSize / 200, 0.1)
    );
  }

  return {
    predictedAffinity,
    confidence,
    source: 'feed',
    engagementScore
  };
}
