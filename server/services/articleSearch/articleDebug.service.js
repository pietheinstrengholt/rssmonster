// Provides development-only diagnostics for recommended article rankings.
// The helpers compact event metadata and log score components without affecting production behavior.
import { computeRecommendedBreakdown } from '../recommendations/recommendedScore.js';

// Normalizes long event names for compact debug-table output.
function compactEventName(name) {
  // Returns early when name is unavailable or name is not string.
  if (!name || typeof name !== 'string') return '';

  return name
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

// Reads the associated event from either Sequelize getters or plain properties.
function resolveEvent(article) {
  return article?.get?.('event') ??
    article?.event;
}

// Reads the associated event name from either Sequelize getters or plain properties.
function resolveEventName(article) {
  return resolveEvent(article)?.name || '';
}

// Reads the associated event id from either Sequelize getters or plain properties.
function resolveEventId(article) {
  return resolveEvent(article)?.id ?? article?.eventId ?? null;
}

// Logs recommended-score inputs and output for a scored article list in development mode.
export function debugRecommendedScores(scored) {
  // Handles the case where process env node env is development.
  if (process.env.NODE_ENV === 'development') {
    const totalArticles = scored.length;
    // Keeps the event id entries eligible while performing debug recommended scores.
    const eventIds = scored
      .map(({ article }) => resolveEventId(article))
      .filter(eventId => eventId != null);
    const articlesWithEvents = eventIds.length;
    const distinctEvents = new Set(eventIds).size;
    // Selects the event coverage pct based on whether total articles is available.
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
    // Maps source values into the result produced while performing debug recommended scores.
    console.table(
      scored.slice(0, 250).map(({ article, recommended }) => {
        // Computes the recommended breakdown while performing debug recommended scores.
        const bd = computeRecommendedBreakdown(article);
        return {
          articleId: article.id,
          eventName: compactEventName(resolveEventName(article)),
          freshness: Number(bd.freshness.toFixed(4)),
          interest: Number(bd.interestScore.toFixed(4)),
          coverage: Number(bd.coverage.toFixed(4)),
          crossSource: Number(bd.crossSource.toFixed(4)),
          corroboration: Number(bd.corroboration.toFixed(4)),
          eventBoost: Number(bd.eventBoost.toFixed(4)),
          ruleBoost: Number(bd.ruleBoost.toFixed(4)),
          eventArticleCount: bd.eventArticleCount,
          sourceCount: bd.sourceCount,
          recommended: Number(recommended.toFixed(4))
        };
      })
    );
  }
}
