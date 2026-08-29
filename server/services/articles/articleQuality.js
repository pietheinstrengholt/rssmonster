const DEFAULT_ARTICLE_SCORE = 70;
const DEFAULT_FEED_TRUST = 0.5;

// Reads one persisted article score while preserving the neutral fallback for unscored articles.
const articleScore = (article, key) => {
  const value = typeof article?.getDataValue === 'function'
    ? article.getDataValue(key)
    : article?.[key];
  const numeric = Number(value ?? DEFAULT_ARTICLE_SCORE);
  return Number.isFinite(numeric) ? numeric : DEFAULT_ARTICLE_SCORE;
};

// Computes the normalized article-only quality shared by model presentation and ranking.
export const computeArticleQuality = article => {
  const overall =
    articleScore(article, 'qualityScore') * 0.50 +
    articleScore(article, 'sentimentScore') * 0.25 +
    articleScore(article, 'advertisementScore') * 0.25;

  return Math.max(0, Math.min(100, overall)) / 100;
};

// Returns the normalized source-trust signal used by the established Quality sort.
export const computeFeedTrust = article => {
  const feed = article?.get?.('Feed') ?? article?.get?.('feed') ?? article?.Feed ?? article?.feed;
  const feedTrust = Number(feed?.feedTrust);
  return Number.isFinite(feedTrust)
    ? Math.max(0, Math.min(1, feedTrust))
    : DEFAULT_FEED_TRUST;
};

// Computes the normalized Quality ranking signal shared by every intelligent sort.
export const computeQuality = article => (
  computeArticleQuality(article) * 0.7 + computeFeedTrust(article) * 0.3
);
