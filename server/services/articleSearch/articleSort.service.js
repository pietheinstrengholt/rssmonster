// Handles all in-memory sorting and score-based filtering for articles.
// This module complements database search when ranking requires runtime virtual fields or joined metadata.
import { computeRecommended } from '../recommendations/recommendedScore.js';
import { debugRecommendedScores } from './articleDebug.service.js';

// Applies a numeric comparison operator to a score value.
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

// Sorts articles descending by a provided scoring function.
const sortByScore = (articles, scorer) =>
  articles
    .map(article => ({
      article,
      score: scorer(article)
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ article }) => article);

// Applies runtime filters and optional score-based ordering to a list of article models.
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
