// Computes non-personalized story importance from event evidence, freshness, and Quality.
import { computeQuality } from '../articles/articleQuality.js';
import { clamp01, computeEventRankingMetrics } from './eventRankingMetrics.js';

const EVENT_IMPORTANCE_WEIGHTS = Object.freeze({
  coverage: 0.45,
  crossSource: 0.35,
  corroboration: 0.20
});

const TOP_STORIES_WEIGHTS = Object.freeze({
  eventImportance: 0.60,
  freshness: 0.25,
  quality: 0.15
});

// Computes the event-driven signals and bounded score used by Top Stories ranking.
export function computeTopStoriesBreakdown(article) {
  const eventMetrics = computeEventRankingMetrics(article);
  const eventImportance = clamp01(
    EVENT_IMPORTANCE_WEIGHTS.coverage * eventMetrics.coverage +
    EVENT_IMPORTANCE_WEIGHTS.crossSource * eventMetrics.crossSource +
    EVENT_IMPORTANCE_WEIGHTS.corroboration * eventMetrics.corroboration
  );
  const freshness = clamp01(article?.freshness ?? 0.5);
  const quality = computeQuality(article);
  const topStories = clamp01(
    TOP_STORIES_WEIGHTS.eventImportance * eventImportance +
    TOP_STORIES_WEIGHTS.freshness * freshness +
    TOP_STORIES_WEIGHTS.quality * quality
  );

  return {
    ...eventMetrics,
    eventImportance,
    freshness,
    quality,
    topStories
  };
}

// Computes the bounded runtime Top Stories score for an article.
export function computeTopStories(article) {
  return computeTopStoriesBreakdown(article).topStories;
}
