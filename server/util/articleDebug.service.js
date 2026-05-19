import { computeRecommendedBreakdown } from './recommendedScore.js';

export function debugRecommendedScores(scored) {
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
}