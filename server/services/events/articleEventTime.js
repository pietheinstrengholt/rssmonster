import { EVENT_MAX_GAP_HOURS } from '../config/semanticConfig.js';

// Defines the hour ms enforced by this service.
export const HOUR_MS = 1000 * 60 * 60;

// This timestamp is the event-building clock: publication time first, ingestion creation time second.
export function articleEventTimestamp(article) {
  // Returns no result when article is unavailable.
  if (!article) return null;

  // Processes each entry entry in turn.
  for (const value of [article.publishedAt, article.createdAt]) {
    // Skips the current entry when value is unavailable.
    if (!value) continue;

    // Derives the timestamp through get time while performing article event timestamp.
    const timestamp = new Date(value).getTime();
    // Returns early when timestamp is finite.
    if (Number.isFinite(timestamp)) return timestamp;
  }

  return null;
}

// Performs the event timestamp operation.
export function eventTimestamp(value) {
  // Returns no result when value is unavailable.
  if (!value) return null;
  // Derives the timestamp through get time while performing event timestamp.
  const timestamp = new Date(value).getTime();
  // Selects the result based on whether timestamp is finite.
  return Number.isFinite(timestamp) ? timestamp : null;
}

// Performs the event date from article operation.
export function eventDateFromArticle(article, fallback = new Date()) {
  // Derives the timestamp through article event timestamp while performing event date from article.
  const timestamp = articleEventTimestamp(article);
  // Selects the result based on whether timestamp is finite.
  return Number.isFinite(timestamp) ? new Date(timestamp) : fallback;
}

// Performs the event window from articles operation.
export function eventWindowFromArticles(articles = []) {
  // Derives the timestamps through sort while performing event window from articles.
  const timestamps = articles
    .map(articleEventTimestamp)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  // Selects the result based on whether timestamps is non-empty.
  return {
    eventWindowStartAt: timestamps.length ? new Date(timestamps[0]) : null,
    eventWindowEndAt: timestamps.length ? new Date(timestamps[timestamps.length - 1]) : null
  };
}

// Performs the event window score operation.
export function eventWindowScore(article, event, maxGapHours = EVENT_MAX_GAP_HOURS) {
  // Derives the article ts through article event timestamp while performing event window score.
  const articleTs = articleEventTimestamp(article);
  // Derives the start ts through event timestamp while performing event window score.
  const startTs = eventTimestamp(event?.eventWindowStartAt ?? event?.eventWindowEndAt ?? event?.updatedAt);
  // Derives the end ts through event timestamp while performing event window score.
  const endTs = eventTimestamp(event?.eventWindowEndAt ?? event?.eventWindowStartAt ?? event?.updatedAt);

  // Returns early when article ts is not finite or start ts is not finite or end ts is not finite.
  if (!Number.isFinite(articleTs) || !Number.isFinite(startTs) || !Number.isFinite(endTs)) {
    return 0;
  }

  // Derives the max gap ms required while performing event window score.
  const maxGapMs = maxGapHours * HOUR_MS;
  // Derives the proposed start through min while performing event window score.
  const proposedStart = Math.min(articleTs, startTs, endTs);
  // Derives the proposed end through max while performing event window score.
  const proposedEnd = Math.max(articleTs, startTs, endTs);
  // Derives the proposed span ms required while performing event window score.
  const proposedSpanMs = proposedEnd - proposedStart;

  // Returns early when proposed span ms exceeds max gap ms.
  if (proposedSpanMs > maxGapMs) return 0;

  return 1 - proposedSpanMs / maxGapMs;
}

// Performs the article window score operation.
export function articleWindowScore(article, candidate, maxGapHours = EVENT_MAX_GAP_HOURS) {
  // Derives the article ts through article event timestamp while performing article window score.
  const articleTs = articleEventTimestamp(article);
  // Derives the candidate ts through article event timestamp while performing article window score.
  const candidateTs = articleEventTimestamp(candidate);

  // Returns early when article ts is not finite or candidate ts is not finite.
  if (!Number.isFinite(articleTs) || !Number.isFinite(candidateTs)) {
    return 0;
  }

  // Derives the diff hours required while performing article window score.
  const diffHours = Math.abs(articleTs - candidateTs) / HOUR_MS;
  // Returns early when diff hours exceeds max gap hours.
  if (diffHours > maxGapHours) return 0;

  return 1 - diffHours / maxGapHours;
}
