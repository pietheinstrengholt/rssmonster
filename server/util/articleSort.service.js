// articleSort.service.js
// Handles all in-memory sorting and filtering for articles
import { computeRecommended, computeRecommendedBreakdown } from './recommendedScore.js';
import { debugRecommendedScores } from './articleDebug.service.js';

const compareValues = (left, operator, right) => {
  switch (operator) {
    case '=': return left === right;
    case '>': return left > right;
    case '<': return left < right;
    case '>=': return left >= right;
    case '<=': return left <= right;
    default: return true;
  }
};

// Extracted sorting logic to a reusable function
const sortByScore = (articles, scorer) =>
  articles
    .map(article => ({
      article,
      score: scorer(article)
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ article }) => article);

export function sortArticles(articles, { sortRecommended, sortQuality, sortAttention, qualityFilter, freshnessFilter }) {
  // Apply quality score filter if present
  if (qualityFilter) {
    const beforeQualityCount = articles.length;
    articles = articles.filter(article => compareValues(article.quality, qualityFilter.operator, qualityFilter.value));
    console.log(`\x1b[31mApplied quality filter (${qualityFilter.operator}${qualityFilter.value}): ${beforeQualityCount} → ${articles.length} articles\x1b[0m`);
  }

  // Apply freshness score filter if present
  if (freshnessFilter) {
    const beforeFreshnessCount = articles.length;
    articles = articles.filter(article => compareValues(article.freshness, freshnessFilter.operator, freshnessFilter.value));
    console.log(`\x1b[31mApplied freshness filter (${freshnessFilter.operator}${freshnessFilter.value}): ${beforeFreshnessCount} → ${articles.length} articles\x1b[0m`);
  }

  // Unified sorting logic
  if (sortRecommended) {
    articles = sortByScore(articles, computeRecommended);
    debugRecommendedScores(articles.map(article => ({ article, recommended: computeRecommended(article) })));
  } else if (sortQuality) {
    articles = sortByScore(articles, article => article.quality);
  } else if (sortAttention) {
    articles = sortByScore(articles, article => article.attentionScore || 0);
  }

  return articles;
}
