import { describe, expect, it } from 'vitest';

import {
  articleEventTimestamp,
  articleWindowScore,
  eventDateFromArticle,
  eventTimestamp,
  eventWindowFromArticles,
  eventWindowScore,
  HOUR_MS
} from '../../services/events/articleEventTime.js';

describe('articleEventTime', () => {
  it('prefers publication time and falls back to a valid creation time', () => {
    const publishedAt = new Date('2026-07-22T10:00:00.000Z');
    const createdAt = new Date('2026-07-22T11:00:00.000Z');

    expect(articleEventTimestamp({ publishedAt, createdAt })).toBe(publishedAt.getTime());
    expect(articleEventTimestamp({ publishedAt: 'invalid', createdAt })).toBe(createdAt.getTime());
    expect(articleEventTimestamp(null)).toBeNull();
    expect(articleEventTimestamp({ publishedAt: 'invalid', createdAt: 'invalid' })).toBeNull();
  });

  it('normalizes standalone dates and preserves the supplied article fallback', () => {
    const fallback = new Date('2026-07-22T12:00:00.000Z');

    expect(eventTimestamp(fallback)).toBe(fallback.getTime());
    expect(eventTimestamp('invalid')).toBeNull();
    expect(eventTimestamp(null)).toBeNull();
    expect(eventDateFromArticle({}, fallback)).toBe(fallback);
  });

  it('builds a chronological window while ignoring invalid article dates', () => {
    const early = new Date('2026-07-22T08:00:00.000Z');
    const late = new Date('2026-07-22T10:00:00.000Z');

    expect(eventWindowFromArticles([
      { publishedAt: late },
      { publishedAt: 'invalid' },
      { createdAt: early }
    ])).toEqual({
      eventWindowStartAt: early,
      eventWindowEndAt: late
    });
    expect(eventWindowFromArticles([])).toEqual({
      eventWindowStartAt: null,
      eventWindowEndAt: null
    });
  });

  it('scores event windows, including fallbacks and invalid or excessive gaps', () => {
    const center = new Date('2026-07-22T10:00:00.000Z');
    const oneHourLater = new Date(center.getTime() + HOUR_MS);

    expect(eventWindowScore(
      { publishedAt: oneHourLater },
      { eventWindowEndAt: center },
      2
    )).toBe(0.5);
    expect(eventWindowScore(
      { publishedAt: oneHourLater },
      { updatedAt: center },
      2
    )).toBe(0.5);
    expect(eventWindowScore({ publishedAt: 'invalid' }, { updatedAt: center }, 2)).toBe(0);
    expect(eventWindowScore(
      { publishedAt: new Date(center.getTime() + 3 * HOUR_MS) },
      { eventWindowStartAt: center, eventWindowEndAt: center },
      2
    )).toBe(0);
  });

  it('scores article pairs and rejects invalid or excessive gaps', () => {
    const center = new Date('2026-07-22T10:00:00.000Z');

    expect(articleWindowScore(
      { publishedAt: center },
      { publishedAt: new Date(center.getTime() + HOUR_MS) },
      2
    )).toBe(0.5);
    expect(articleWindowScore({}, { publishedAt: center }, 2)).toBe(0);
    expect(articleWindowScore(
      { publishedAt: center },
      { publishedAt: new Date(center.getTime() + 3 * HOUR_MS) },
      2
    )).toBe(0);
  });
});
