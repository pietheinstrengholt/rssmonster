import { literal } from 'sequelize';

const DEFAULT_ARTICLE_SCORE = 70;
const NEUTRAL_FEED_TRUST = 0.75;
const QUALITY_WEIGHTS = { qualityScore: 0.5, toneScore: 0.25, advertisementScore: 0.25 };

// SQL filtering uses the same components, fallback, and bounds as the public quality value.
export const articleQualityPercentExpression = () => {
  const weighted = Object.entries(QUALITY_WEIGHTS)
    .map(([field, weight]) => `COALESCE(\`${field}\`, ${DEFAULT_ARTICLE_SCORE}) * ${weight}`)
    .join(' + ');
  return literal(`CASE WHEN (${weighted}) < 0 THEN 0 WHEN (${weighted}) > 100 THEN 100 ELSE (${weighted}) END`);
};

// Reads one persisted article score while preserving the neutral fallback for unscored articles.
const articleScore = (article, key) => {
  const value = typeof article?.getDataValue === 'function'
    ? article.getDataValue(key)
    : article?.[key];
  const numeric = Number(value ?? DEFAULT_ARTICLE_SCORE);
  return Number.isFinite(numeric) ? numeric : DEFAULT_ARTICLE_SCORE;
};

// Computes the normalized article-only quality shared by model presentation and ranking.
// Overall article quality drives the badge and quality gates; source trust and
// personal interest must not change this content-only value.
export const computeArticleQuality = article => {
  const overall = Object.entries(QUALITY_WEIGHTS)
    .reduce((total, [field, weight]) => total + articleScore(article, field) * weight, 0);

  return Math.max(0, Math.min(100, overall)) / 100;
};

// Uses the FeedTrust neutral prior when source evidence is unavailable; zero is a valid estimate.
export const computeFeedTrust = article => {
  const feed = article?.get?.('Feed') ?? article?.get?.('feed') ?? article?.Feed ?? article?.feed;
  const feedTrust = Number(feed?.feedTrust ?? NEUTRAL_FEED_TRUST);
  return Number.isFinite(feedTrust)
    ? Math.max(0, Math.min(1, feedTrust))
    : NEUTRAL_FEED_TRUST;
};

// Computes the normalized Quality ranking signal shared by every intelligent sort.
// "Quality & source trust" combines signals for ordering, not article-quality
// filtering. Recommended adds personal interest separately.
export const computeQuality = article => (
  computeArticleQuality(article) * 0.7 + computeFeedTrust(article) * 0.3
);
