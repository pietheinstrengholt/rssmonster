import { describe, expect, it } from 'vitest';

import {
  DAY_MS,
  HOUR_MS,
  MALFORMED_BASE_BACKOFF_MS,
  MALFORMED_QUARANTINE_THRESHOLD,
  MAX_ACTIVITY_INTERVAL_MS,
  MAX_JITTER_MS,
  MIN_FETCH_INTERVAL_MS,
  NOT_FOUND_BACKOFF_MS,
  PERMANENT_BACKOFF_MS,
  calculateActivityIntervalMs,
  calculateBaseFetchIntervalMs,
  calculateFailureBackoffMs,
  calculateIntervalChangeNextFetchAt,
  calculateNextFetchAt,
  classifyFetchRetry,
  deterministicJitterMs,
  updateCadenceObservation
} from '../../services/feeds/feedScheduling.js';

const NOW = new Date('2026-08-09T12:00:00.000Z');
const clock = () => NOW;

// Produces an activity timestamp a precise duration before the fixed clock.
const inactiveFor = milliseconds => new Date(NOW.getTime() - milliseconds);

describe('adaptive feed activity intervals', () => {
  it.each([
    ['just under seven days', 7 * DAY_MS - 1, 15 * 60 * 1000],
    ['exactly seven days', 7 * DAY_MS, HOUR_MS],
    ['eight days', 8 * DAY_MS, HOUR_MS],
    ['just under fourteen days', 14 * DAY_MS - 1, HOUR_MS],
    ['exactly fourteen days', 14 * DAY_MS, 2 * HOUR_MS],
    ['fifteen days', 15 * DAY_MS, 2 * HOUR_MS],
    ['just under thirty days', 30 * DAY_MS - 1, 2 * HOUR_MS],
    ['exactly thirty days', 30 * DAY_MS, 4 * HOUR_MS],
    ['more than thirty days', 45 * DAY_MS, 4 * HOUR_MS]
  ])('uses the %s boundary', (_label, inactiveMs, expectedMs) => {
    expect(calculateActivityIntervalMs({
      lastPublishedAt: inactiveFor(inactiveMs),
      observedEntryIntervalMs: 30 * 60 * 1000,
      now: NOW
    })).toBe(expectedMs);
  });

  it.each([
    ['below the minimum', 2 * 60 * 1000, MIN_FETCH_INTERVAL_MS],
    ['at the minimum cadence', 10 * 60 * 1000, MIN_FETCH_INTERVAL_MS],
    ['twenty-minute cadence', 20 * 60 * 1000, 10 * 60 * 1000],
    ['inside the range', 30 * 60 * 1000, 15 * 60 * 1000],
    ['four-hour cadence', 4 * HOUR_MS, HOUR_MS],
    ['at the recent ceiling', 2 * HOUR_MS, HOUR_MS],
    ['above the recent ceiling', 12 * HOUR_MS, HOUR_MS],
    ['missing cadence', null, MIN_FETCH_INTERVAL_MS]
  ])('clamps recent activity for %s', (_label, cadenceMs, expectedMs) => {
    expect(calculateActivityIntervalMs({
      lastPublishedAt: inactiveFor(DAY_MS),
      observedEntryIntervalMs: cadenceMs,
      now: NOW
    })).toBe(expectedMs);
  });

  it('does not infer recent publication activity from cadence alone', () => {
    expect(calculateActivityIntervalMs({
      lastPublishedAt: null,
      observedEntryIntervalMs: 30 * 60 * 1000,
      now: NOW
    })).toBe(MAX_ACTIVITY_INTERVAL_MS);
  });
});

describe('feed interval overrides', () => {
  it('uses adaptive cadence for null and a positive override as the base interval', () => {
    const adaptiveInput = {
      updateIntervalMinutes: null,
      lastPublishedAt: inactiveFor(DAY_MS),
      observedEntryIntervalMs: 30 * 60 * 1000,
      now: NOW
    };

    expect(calculateBaseFetchIntervalMs(adaptiveInput)).toBe(15 * 60 * 1000);
    expect(calculateBaseFetchIntervalMs({
      ...adaptiveInput,
      updateIntervalMinutes: 120
    })).toBe(2 * HOUR_MS);
  });

  it('does not schedule a disabled feed even after a successful fetch', () => {
    expect(calculateNextFetchAt({
      feedIdentity: 'disabled-feed',
      updateIntervalMinutes: 0,
      outcomeType: 'changed'
    }, { clock })).toBeNull();
  });

  it.each([
    ['publisher freshness', {
      cacheFreshUntil: new Date(NOW.getTime() + 2 * HOUR_MS),
      outcomeType: 'changed'
    }, 2 * HOUR_MS],
    ['Retry-After', {
      retryAfterAt: new Date(NOW.getTime() + 3 * HOUR_MS),
      outcomeType: 'rate_limited',
      consecutiveFailures: 1
    }, 3 * HOUR_MS],
    ['failure backoff', {
      outcomeType: 'permanent_failure',
      consecutiveFailures: 1
    }, PERMANENT_BACKOFF_MS]
  ])('keeps %s later than a positive override', (_label, policy, delayMs) => {
    const feedIdentity = 'manual-policy-feed';
    const result = calculateNextFetchAt({
      feedIdentity,
      updateIntervalMinutes: 5,
      lastPublishedAt: inactiveFor(DAY_MS),
      ...policy
    }, { clock });

    expect(result.getTime()).toBe(
      NOW.getTime() + delayMs + deterministicJitterMs(feedIdentity)
    );
  });

  it('re-enables a disabled feed immediately with stable jitter', () => {
    const feedIdentity = 're-enabled-feed';
    const result = calculateIntervalChangeNextFetchAt({
      feedIdentity,
      previousUpdateIntervalMinutes: 0,
      updateIntervalMinutes: null,
      lastFetchOutcome: 'changed'
    }, { clock });

    expect(result.getTime()).toBe(
      NOW.getTime() + deterministicJitterMs(feedIdentity)
    );
  });

  it('does not shorten a durable rate-limit deadline when the setting changes', () => {
    const currentNextFetchAt = new Date(NOW.getTime() + 6 * HOUR_MS);
    const result = calculateIntervalChangeNextFetchAt({
      feedIdentity: 'rate-limited-feed',
      previousUpdateIntervalMinutes: 60,
      updateIntervalMinutes: 5,
      currentNextFetchAt,
      lastFetchOutcome: 'rate_limited'
    }, { clock });

    expect(result).toEqual(currentNextFetchAt);
  });

  it.each([
    ['security quarantine', 'security_rejected', 1],
    ['malformed quarantine', 'malformed', MALFORMED_QUARANTINE_THRESHOLD]
  ])('does not lift %s when the interval changes', (
    _label,
    lastFetchOutcome,
    consecutiveFailures
  ) => {
    expect(calculateIntervalChangeNextFetchAt({
      feedIdentity: 'quarantined-feed',
      previousUpdateIntervalMinutes: 60,
      updateIntervalMinutes: 5,
      lastFetchOutcome,
      consecutiveFailures
    }, { clock })).toBeNull();
  });
});

describe('trusted publication cadence observations', () => {
  it('stores the newest first observation without learning from one snapshot', () => {
    const result = updateCadenceObservation({
      lastPublishedAt: null,
      observedEntryIntervalMs: null,
      publicationTimestamps: [
        new Date('2026-08-09T08:00:00.000Z'),
        new Date('2026-08-09T10:00:00.000Z'),
        new Date('2026-08-09T09:00:00.000Z')
      ]
    }, { clock });

    expect(result).toEqual({
      lastPublishedAt: new Date('2026-08-09T10:00:00.000Z'),
      observedEntryIntervalMs: null
    });
  });

  it('uses every adjacent interval from multiple hourly publications', () => {
    const result = updateCadenceObservation({
      lastPublishedAt: new Date('2026-08-09T08:00:00.000Z'),
      observedEntryIntervalMs: 2 * HOUR_MS,
      publicationTimestamps: [
        new Date('2026-08-09T11:00:00.000Z'),
        new Date('2026-08-09T09:00:00.000Z'),
        new Date('2026-08-09T10:00:00.000Z')
      ]
    }, { clock });

    expect(result).toEqual({
      lastPublishedAt: new Date('2026-08-09T11:00:00.000Z'),
      observedEntryIntervalMs: 105 * 60 * 1000
    });
  });

  it('deduplicates and sorts publisher timestamps before sampling', () => {
    const result = updateCadenceObservation({
      lastPublishedAt: new Date('2026-08-09T08:00:00.000Z'),
      observedEntryIntervalMs: null,
      publicationTimestamps: [
        new Date('2026-08-09T10:00:00.000Z'),
        new Date('2026-08-09T09:00:00.000Z'),
        new Date('2026-08-09T10:00:00.000Z'),
        new Date('2026-08-09T09:00:00.000Z')
      ]
    }, { clock });

    expect(result).toEqual({
      lastPublishedAt: new Date('2026-08-09T10:00:00.000Z'),
      observedEntryIntervalMs: HOUR_MS
    });
  });

  it('uses the median adjacent interval instead of one long snapshot gap', () => {
    const result = updateCadenceObservation({
      lastPublishedAt: new Date('2026-08-09T05:00:00.000Z'),
      observedEntryIntervalMs: null,
      publicationTimestamps: [
        new Date('2026-08-09T11:00:00.000Z'),
        new Date('2026-08-09T06:00:00.000Z'),
        new Date('2026-08-09T07:00:00.000Z')
      ]
    }, { clock });

    expect(result.observedEntryIntervalMs).toBe(HOUR_MS);
  });

  it.each([
    ['short samples', 60 * 1000, MIN_FETCH_INTERVAL_MS],
    ['long samples', 40 * DAY_MS, 30 * DAY_MS]
  ])('bounds %s before initializing the EWMA', (_label, sampleMs, expected) => {
    const previous = inactiveFor(sampleMs);
    const result = updateCadenceObservation({
      lastPublishedAt: previous,
      observedEntryIntervalMs: null,
      publicationTimestamps: [NOW]
    }, { clock });

    expect(result.observedEntryIntervalMs).toBe(expected);
  });

  it('excludes invalid, future, and backfilled timestamps', () => {
    const previous = new Date('2026-08-09T10:00:00.000Z');
    const result = updateCadenceObservation({
      lastPublishedAt: previous,
      observedEntryIntervalMs: HOUR_MS,
      publicationTimestamps: [
        'invalid',
        new Date('2026-08-09T09:00:00.000Z'),
        previous,
        new Date('2026-08-09T11:00:00.000Z'),
        new Date('2026-08-09T12:00:00.001Z')
      ]
    }, { clock });

    expect(result).toEqual({
      lastPublishedAt: new Date('2026-08-09T11:00:00.000Z'),
      observedEntryIntervalMs: HOUR_MS
    });
  });

  it('keeps an old first-import backlog at the inactive four-hour bound', () => {
    const result = updateCadenceObservation({
      lastPublishedAt: null,
      observedEntryIntervalMs: null,
      publicationTimestamps: [
        inactiveFor(60 * DAY_MS),
        inactiveFor(60 * DAY_MS - HOUR_MS),
        inactiveFor(60 * DAY_MS - 2 * HOUR_MS)
      ]
    }, { clock });

    expect(result.observedEntryIntervalMs).toBeNull();
    expect(calculateActivityIntervalMs({
      ...result,
      now: NOW
    })).toBe(MAX_ACTIVITY_INTERVAL_MS);
  });

  it('preserves activity state when an unchanged feed supplies no timestamps', () => {
    const lastPublishedAt = new Date('2026-08-09T10:00:00.000Z');
    expect(updateCadenceObservation({
      lastPublishedAt,
      observedEntryIntervalMs: HOUR_MS,
      publicationTimestamps: []
    }, { clock })).toEqual({
      lastPublishedAt,
      observedEntryIntervalMs: HOUR_MS
    });
  });
});

describe('classified failure backoff', () => {
  it.each([
    ['changed', 9, null, 0],
    ['unchanged', 9, null, 0],
    ['not_modified', 9, null, 0],
    ['transient_failure', 1, null, 5 * 60 * 1000],
    ['transient_failure', 2, null, 10 * 60 * 1000],
    ['timed_out', 3, null, 20 * 60 * 1000],
    ['rate_limited', 4, null, 40 * 60 * 1000],
    ['transient_failure', 5, null, 80 * 60 * 1000],
    ['rate_limited', 6, null, 160 * 60 * 1000],
    ['transient_failure', 7, null, 4 * HOUR_MS],
    ['transient_failure', 8, null, 4 * HOUR_MS],
    ['permanent_failure', 1, 404, NOT_FOUND_BACKOFF_MS],
    ['permanent_failure', 7, 410, NOT_FOUND_BACKOFF_MS],
    ['permanent_failure', 1, 401, PERMANENT_BACKOFF_MS],
    ['malformed', 1, null, MALFORMED_BASE_BACKOFF_MS],
    ['malformed', 2, null, 2 * MALFORMED_BASE_BACKOFF_MS],
    ['malformed', MALFORMED_QUARANTINE_THRESHOLD, null, null],
    ['security_rejected', 1, null, null],
    ['too_large', 1, null, PERMANENT_BACKOFF_MS]
  ])('classifies %s at failure count %i', (
    outcomeType,
    failures,
    httpStatus,
    expected
  ) => {
    expect(calculateFailureBackoffMs({
      outcomeType,
      httpStatus,
      consecutiveFailures: failures
    })).toBe(expected);
  });

  it.each([
    ['transient_failure', 1, true, false],
    ['permanent_failure', 1, true, false],
    ['malformed', 2, true, false],
    ['malformed', 3, false, true],
    ['security_rejected', 1, false, true]
  ])('marks %s at failure count %i retryable=%s quarantined=%s', (
    outcomeType,
    consecutiveFailures,
    retryable,
    quarantined
  ) => {
    expect(classifyFetchRetry({
      outcomeType,
      consecutiveFailures
    })).toMatchObject({ retryable, quarantined });
  });
});

describe('deterministic next-fetch calculation', () => {
  it('bootstraps recent unknown cadence at five minutes plus deterministic jitter', () => {
    const feedIdentity = 'new-active-feed';
    const result = calculateNextFetchAt({
      feedIdentity,
      lastPublishedAt: inactiveFor(HOUR_MS),
      observedEntryIntervalMs: null,
      outcomeType: 'changed'
    }, { clock });

    expect(result.getTime()).toBe(
      NOW.getTime() + MIN_FETCH_INTERVAL_MS +
      deterministicJitterMs(feedIdentity)
    );
  });

  it.each([
    ['activity', {}, 10 * 60 * 1000],
    [
      'publisher freshness',
      { cacheFreshUntil: new Date(NOW.getTime() + 30 * 60 * 1000) },
      30 * 60 * 1000
    ],
    [
      'Retry-After beyond the activity ceiling',
      { retryAfterAt: new Date(NOW.getTime() + 12 * HOUR_MS) },
      12 * HOUR_MS
    ],
    [
      'classified transient backoff',
      { outcomeType: 'transient_failure', consecutiveFailures: 3 },
      20 * 60 * 1000
    ],
    [
      'classified permanent backoff',
      { outcomeType: 'permanent_failure', consecutiveFailures: 1 },
      PERMANENT_BACKOFF_MS
    ]
  ])('selects %s as the latest constraint', (_label, overrides, delayMs) => {
    const feedIdentity = 'feed-42';
    const result = calculateNextFetchAt({
      feedIdentity,
      lastPublishedAt: inactiveFor(DAY_MS),
      observedEntryIntervalMs: 20 * 60 * 1000,
      outcomeType: 'changed',
      ...overrides
    }, { clock });

    expect(result.getTime()).toBe(
      NOW.getTime() + delayMs + deterministicJitterMs(feedIdentity)
    );
  });

  it('never caps a valid publisher Retry-After at four hours', () => {
    const retryAfterAt = new Date(NOW.getTime() + 2 * DAY_MS);
    const result = calculateNextFetchAt({
      feedIdentity: 99,
      lastPublishedAt: inactiveFor(60 * DAY_MS),
      observedEntryIntervalMs: null,
      retryAfterAt,
      outcomeType: 'rate_limited',
      consecutiveFailures: 12
    }, { clock });

    expect(result.getTime()).toBe(
      retryAfterAt.getTime() + deterministicJitterMs(99)
    );
  });

  it.each([
    ['security rejection', 'security_rejected', 1],
    ['third malformed response', 'malformed', 3]
  ])('does not schedule %s automatically', (
    _label,
    outcomeType,
    consecutiveFailures
  ) => {
    expect(calculateNextFetchAt({
      feedIdentity: 99,
      lastPublishedAt: inactiveFor(DAY_MS),
      outcomeType,
      consecutiveFailures
    }, { clock })).toBeNull();
  });

  it('derives stable, bounded, non-negative jitter from feed identity', () => {
    const first = deterministicJitterMs('https://example.com/feed.xml');
    const repeated = deterministicJitterMs('https://example.com/feed.xml');
    const different = deterministicJitterMs('https://example.com/other.xml');

    expect(first).toBe(repeated);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(MAX_JITTER_MS);
    expect(different).not.toBe(first);
  });

  it('rejects an invalid injected clock', () => {
    expect(() => calculateNextFetchAt({
      feedIdentity: 1,
      outcomeType: 'changed'
    }, { clock: () => 'invalid' })).toThrow('scheduling clock is invalid');
  });
});
