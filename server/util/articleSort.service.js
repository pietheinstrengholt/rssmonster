// articleSort.service.js
// Handles all in-memory sorting and filtering for articles
import { computeRecommended, computeRecommendedBreakdown } from './recommendedScore.js';

export function sortArticles(articles, { sortRecommended, sortQuality, sortAttention, qualityFilter, freshnessFilter }) {
  // Apply quality score filter if present (must be done in-memory since quality is a virtual field)
  if (qualityFilter) {
    const beforeQualityCount = articles.length;
    articles = articles.filter(article => {
      const articleQuality = article.quality;
      const { operator, value } = qualityFilter;
      switch (operator) {
        case '=':
          return articleQuality === value;
        case '>':
          return articleQuality > value;
        case '<':
          return articleQuality < value;
        case '>=':
          return articleQuality >= value;
        case '<=':
          return articleQuality <= value;
        default:
          return true;
      }
    });
    console.log(`\x1b[31mApplied quality filter (${qualityFilter.operator}${qualityFilter.value}): ${beforeQualityCount} → ${articles.length} articles\x1b[0m`);
  }

  // Apply freshness score filter if present (must be done in-memory since freshness is a virtual field)
  if (freshnessFilter) {
    const beforeFreshnessCount = articles.length;
    articles = articles.filter(article => {
      const articleFreshness = article.freshness;
      const { operator, value } = freshnessFilter;
      switch (operator) {
        case '=':
          return articleFreshness === value;
        case '>':
          return articleFreshness > value;
        case '<':
          return articleFreshness < value;
        case '>=':
          return articleFreshness >= value;
        case '<=':
          return articleFreshness <= value;
        default:
          return true;
      }
    });
    console.log(`\x1b[31mApplied freshness filter (${freshnessFilter.operator}${freshnessFilter.value}): ${beforeFreshnessCount} → ${articles.length} articles\x1b[0m`);
  }

  // Sorting
  if (sortRecommended) {
    const scored = articles
      .map(article => ({
        article,
        recommended: computeRecommended(article)
      }))
      .sort((a, b) => b.recommended - a.recommended);
    articles = scored.map(item => item.article);

    if (process.env.NODE_ENV === 'development') {
      console.log('[RECOMMENDED DEBUG] Formula: 0.10*quality + 0.15*freshness + 0.45*coverage + 0.15*crossSource + 0.15*corroboration + ruleBoost');
      console.table(
        scored.slice(0, 50).map(({ article, recommended }, index) => {
          const bd = computeRecommendedBreakdown(article);
          return {
            rank: index + 1,
            articleId: article.id,
            freshness: Number(bd.freshness.toFixed(4)),
            quality: Number(bd.quality.toFixed(4)),
            coverage: Number(bd.coverage.toFixed(4)),
            crossSource: Number(bd.crossSource.toFixed(4)),
            corroboration: Number(bd.corroboration.toFixed(4)),
            ruleBoost: Number(bd.ruleBoost.toFixed(4)),
            clusterSize: bd.clusterSize,
            sourceCount: bd.sourceCount,
            recommended: Number(recommended.toFixed(4))
          };
        })
      );
    }
  } else if (sortQuality) {
    articles = articles
      .map(article => ({
        article,
        quality: article.quality
      }))
      .sort((a, b) => b.quality - a.quality)
      .map(item => item.article);
  } else if (sortAttention) {
    articles = articles
      .map(article => ({
        article,
        attention: article.attentionScore || 0
      }))
      .sort((a, b) => b.attention - a.attention)
      .map(item => item.article);
  }
  return articles;
}
