import { computeRecommendedBreakdown } from './recommendedScore.js';

function compactEventName(name) {
  if (!name || typeof name !== 'string') return '';

  return name
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

function resolveEventName(article) {
  const cluster =
    article?.get?.('cluster') ??
    article?.cluster ??
    article?.get?.('event') ??
    article?.event;

  return cluster?.name || '';
}

function resolveEventId(article) {
  const cluster =
    article?.get?.('cluster') ??
    article?.cluster ??
    article?.get?.('event') ??
    article?.event;

  return cluster?.id ?? article?.eventId ?? null;
}

export function debugRecommendedScores(scored) {
  if (process.env.NODE_ENV === 'development') {
    const totalArticles = scored.length;
    const eventIds = scored
      .map(({ article }) => resolveEventId(article))
      .filter(eventId => eventId != null);
    const articlesWithEvents = eventIds.length;
    const distinctEvents = new Set(eventIds).size;
    const eventCoveragePct = totalArticles
      ? Number(((articlesWithEvents / totalArticles) * 100).toFixed(1))
      : 0;

    console.log('[RECOMMENDED DEBUG] Formula: 0.20*freshness + 0.22*interest + 0.10*quality + 0.22*coverage + 0.13*crossSource + 0.13*corroboration + eventBoost + ruleBoost');
    console.log(
      `[RECOMMENDED DEBUG] articles=${totalArticles} ` +
      `articlesWithEvents=${articlesWithEvents} ` +
      `events=${distinctEvents} ` +
      `eventCoverage=${eventCoveragePct}%`
    );
    console.table(
      scored.slice(0, 250).map(({ article, recommended }, index) => {
        const bd = computeRecommendedBreakdown(article);
        return {
          rank: index + 1,
          articleId: article.id,
          eventName: compactEventName(resolveEventName(article)),
          freshness: Number(bd.freshness.toFixed(4)),
          quality: Number(bd.quality.toFixed(4)),
          coverage: Number(bd.coverage.toFixed(4)),
          crossSource: Number(bd.crossSource.toFixed(4)),
          corroboration: Number(bd.corroboration.toFixed(4)),
          eventBoost: Number(bd.eventBoost.toFixed(4)),
          ruleBoost: Number(bd.ruleBoost.toFixed(4)),
          clusterSize: bd.clusterSize,
          sourceCount: bd.sourceCount,
          recommended: Number(recommended.toFixed(4))
        };
      })
    );
  }
}
