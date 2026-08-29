// Handles all in-memory sorting and score-based filtering for articles.
// This module complements database search when ranking requires runtime virtual fields or joined metadata.
import { computeRecommended } from '../recommendations/recommendedScore.js';
import { computeQuality, computeFeedTrust } from '../articles/articleQuality.js';
import { computeTopStories } from '../recommendations/topStoriesScore.js';
import { debugRecommendedScores } from './articleDebug.service.js';

const SCORE_FILTER_EXEMPT_ANALYSIS_STATUSES = new Set(['pending', 'processing', 'failed']);

// Applies a numeric comparison operator to a score value.
const compareValues = (left, operator, right) => {
  // Selects behavior from the supported operator values.
  switch (operator) {
    // Applies the =-specific behavior.
    case '=': return left === right;
    // Applies the >-specific behavior.
    case '>': return left > right;
    // Applies the <-specific behavior.
    case '<': return left < right;
    // Applies the >=-specific behavior.
    case '>=': return left >= right;
    // Applies the <=-specific behavior.
    case '<=': return left <= right;
    default: return true;
  }
};

// Sorts articles descending by a provided scoring function.
const sortByScore = (articles, scorer) =>
  articles
    .map(article => ({
      article,
      score: scorer(article)
    }))
    .sort((a, b) => {
      const scoreOrder = b.score - a.score;
      if (scoreOrder) return scoreOrder;

      const publishedAt = article => article.get?.('publishedAt') ?? article.publishedAt;
      const publishedOrder = new Date(publishedAt(b.article) || 0).getTime()
        - new Date(publishedAt(a.article) || 0).getTime();
      if (publishedOrder) return publishedOrder;

      return Number(b.article.id || 0) - Number(a.article.id || 0);
    })
    .map(({ article }) => article);

// Adds the optional Unread feed-trust boost to a normalized base sort score.
const boostedSortScore = (article, baseScore, prioritizeHighTrust) => (
  Number(baseScore || 0) + (prioritizeHighTrust ? computeFeedTrust(article) : 0)
);

// Applies runtime filters and optional score-based ordering to a list of article models.
export function sortArticles(articles, {
  sortRecommended,
  sortTopStories,
  sortQuality,
  sortAttention,
  sortDirection = 'desc',
  qualityFilter,
  freshnessFilter,
  prioritizeHighTrust = false
}) {
  // Apply quality score filter if present
  if (qualityFilter) {
    const beforeQualityCount = articles.length;
    // Filters source values to the entries eligible while performing sort articles.
    articles = articles.filter(article => {
      const analysisStatus = article.get?.('aiAnalysisStatus') ?? article.aiAnalysisStatus;
      const actionOwned = Boolean(
        article.get?.('qualityScoreActionOverrideInd') ??
        article.qualityScoreActionOverrideInd
      );
      return (
        (SCORE_FILTER_EXEMPT_ANALYSIS_STATUSES.has(analysisStatus) && !actionOwned) ||
        compareValues(article.quality, qualityFilter.operator, qualityFilter.value)
      );
    });
    console.log(`\x1b[31mApplied quality filter (${qualityFilter.operator}${qualityFilter.value}): ${beforeQualityCount} → ${articles.length} articles\x1b[0m`);
  }

  // Apply freshness score filter if present
  if (freshnessFilter) {
    const beforeFreshnessCount = articles.length;
    // Filters source values to the entries eligible while performing sort articles.
    articles = articles.filter(article => compareValues(article.freshness, freshnessFilter.operator, freshnessFilter.value));
    console.log(`\x1b[31mApplied freshness filter (${freshnessFilter.operator}${freshnessFilter.value}): ${beforeFreshnessCount} → ${articles.length} articles\x1b[0m`);
  }

  // Unified sorting logic
  if (sortRecommended) {
    articles = sortByScore(
      articles,
      computeRecommended
    );
    // Maps source values into the result produced while performing sort articles.
    debugRecommendedScores(
      articles.map(article => ({
        article,
        recommended: computeRecommended(article)
      }))
    );
  // Handles the case where Top Stories ranking is available.
  } else if (sortTopStories) {
    articles = sortByScore(articles, computeTopStories);
  // Handles the case where sort quality is available.
  } else if (sortQuality) {
    articles = sortByScore(articles, computeQuality);
  // Handles the case where sort attention is available.
  } else if (sortAttention) {
    // Runs the callback required while performing sort articles.
    articles = sortByScore(
      articles,
      article => boostedSortScore(article, article.attentionScore, prioritizeHighTrust)
    );
  // Applies the optional Unread trust boost to chronological sorts.
  } else if (prioritizeHighTrust && ['asc', 'desc'].includes(sortDirection)) {
    articles = sortByScore(articles, article => {
      const freshness = Number(article.freshness || 0);
      const chronologicalScore = sortDirection === 'asc' ? 1 - freshness : freshness;
      return boostedSortScore(article, chronologicalScore, true);
    });
  }

  return articles;
}
