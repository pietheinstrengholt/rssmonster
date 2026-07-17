import { EVENT_MAX_GAP_HOURS } from '../config/semanticConfig.js';

export const HOUR_MS = 1000 * 60 * 60;

// This timestamp is the event-building clock: publication time first, ingestion creation time second.
export function articleEventTimestamp(article) {
  if (!article) return null;

  for (const value of [article.publishedAt, article.createdAt]) {
    if (!value) continue;

    const timestamp = new Date(value).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }

  return null;
}

export function eventTimestamp(value) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function eventDateFromArticle(article, fallback = new Date()) {
  const timestamp = articleEventTimestamp(article);
  return Number.isFinite(timestamp) ? new Date(timestamp) : fallback;
}

export function eventWindowFromArticles(articles = []) {
  const timestamps = articles
    .map(articleEventTimestamp)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  return {
    eventWindowStartAt: timestamps.length ? new Date(timestamps[0]) : null,
    eventWindowEndAt: timestamps.length ? new Date(timestamps[timestamps.length - 1]) : null
  };
}

export function eventWindowScore(article, event, maxGapHours = EVENT_MAX_GAP_HOURS) {
  const articleTs = articleEventTimestamp(article);
  const startTs = eventTimestamp(event?.eventWindowStartAt ?? event?.eventWindowEndAt ?? event?.updatedAt);
  const endTs = eventTimestamp(event?.eventWindowEndAt ?? event?.eventWindowStartAt ?? event?.updatedAt);

  if (!Number.isFinite(articleTs) || !Number.isFinite(startTs) || !Number.isFinite(endTs)) {
    return 0;
  }

  const maxGapMs = maxGapHours * HOUR_MS;
  const proposedStart = Math.min(articleTs, startTs, endTs);
  const proposedEnd = Math.max(articleTs, startTs, endTs);
  const proposedSpanMs = proposedEnd - proposedStart;

  if (proposedSpanMs > maxGapMs) return 0;

  return 1 - proposedSpanMs / maxGapMs;
}

export function articleWindowScore(article, candidate, maxGapHours = EVENT_MAX_GAP_HOURS) {
  const articleTs = articleEventTimestamp(article);
  const candidateTs = articleEventTimestamp(candidate);

  if (!Number.isFinite(articleTs) || !Number.isFinite(candidateTs)) {
    return 0;
  }

  const diffHours = Math.abs(articleTs - candidateTs) / HOUR_MS;
  if (diffHours > maxGapHours) return 0;

  return 1 - diffHours / maxGapHours;
}
