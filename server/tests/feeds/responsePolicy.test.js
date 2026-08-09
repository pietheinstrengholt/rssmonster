import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_FEED_CACHE_FRESHNESS_MAX_MS,
  DEFAULT_FEED_RETRY_AFTER_MAX_MS,
  parseResponsePolicy
} from '../../services/feeds/http/responsePolicy.js';

const RECEIVED_AT = new Date('2026-08-09T12:00:00.000Z');
const ORIGINAL_CACHE_BOUND = process.env.FEED_CACHE_FRESHNESS_MAX_MS;
const ORIGINAL_RETRY_BOUND = process.env.FEED_RETRY_AFTER_MAX_MS;

afterEach(() => {
  if (ORIGINAL_CACHE_BOUND === undefined) {
    delete process.env.FEED_CACHE_FRESHNESS_MAX_MS;
  } else {
    process.env.FEED_CACHE_FRESHNESS_MAX_MS = ORIGINAL_CACHE_BOUND;
  }
  if (ORIGINAL_RETRY_BOUND === undefined) {
    delete process.env.FEED_RETRY_AFTER_MAX_MS;
  } else {
    process.env.FEED_RETRY_AFTER_MAX_MS = ORIGINAL_RETRY_BOUND;
  }
});

describe('neutral HTTP response policy', () => {
  it.each([
    [
      'max-age with Date and Age',
      {
        'cache-control': 'public, max-age=600',
        date: 'Sun, 09 Aug 2026 11:59:00 GMT',
        age: '120'
      },
      '2026-08-09T12:08:00.000Z'
    ],
    [
      'quoted max-age',
      { 'cache-control': 'max-age="300"' },
      '2026-08-09T12:05:00.000Z'
    ],
    [
      'Expires fallback adjusted by Age',
      {
        date: 'Sun, 09 Aug 2026 12:00:00 GMT',
        expires: 'Sun, 09 Aug 2026 12:10:00 GMT',
        age: '120'
      },
      '2026-08-09T12:08:00.000Z'
    ],
    [
      'no-cache requires immediate revalidation',
      { 'cache-control': 'private, no-cache' },
      '2026-08-09T12:00:00.000Z'
    ],
    ['no freshness metadata', {}, null],
    [
      'invalid freshness metadata',
      {
        'cache-control': 'max-age=tomorrow',
        expires: 'not-a-date',
        date: 'invalid',
        age: '-4'
      },
      null
    ],
    [
      'overflowing max-age',
      { 'cache-control': 'max-age=9007199254740991' },
      '2026-08-10T12:00:00.000Z'
    ]
  ])('calculates freshness for %s', (_label, headers, expected) => {
    const policy = parseResponsePolicy(headers, RECEIVED_AT);

    expect(policy.cacheFreshUntil?.toISOString() || null).toBe(expected);
  });

  it.each([
    ['delta-seconds', '120', '2026-08-09T12:02:00.000Z'],
    [
      'HTTP date',
      'Sun, 09 Aug 2026 12:05:00 GMT',
      '2026-08-09T12:05:00.000Z'
    ],
    ['past HTTP date', 'Sun, 09 Aug 2026 11:00:00 GMT', RECEIVED_AT.toISOString()],
    ['invalid value', 'later', null],
    ['negative delta', '-1', null],
    ['overflowing delta', '9007199254740991', '2026-08-16T12:00:00.000Z']
  ])('parses Retry-After %s', (_label, value, expected) => {
    const policy = parseResponsePolicy(
      { 'retry-after': value },
      RECEIVED_AT
    );

    expect(policy.retryAfterAt?.toISOString() || null).toBe(expected);
  });

  it.each([
    ['strong ETag', '"feed-v2"', '"feed-v2"'],
    ['weak ETag', 'W/"feed-v2"', 'W/"feed-v2"'],
    ['oversized valid ETag', `"${'x'.repeat(2047)}"`, null],
    ['unquoted ETag', 'feed-v2', null],
    ['newline ETag', '"feed\nvalue"', null]
  ])('parses %s', (_label, value, expected) => {
    expect(parseResponsePolicy({ etag: value }, RECEIVED_AT).etag).toBe(expected);
  });

  it.each([
    [
      'valid Last-Modified',
      'Sun, 09 Aug 2026 11:55:00 GMT',
      'Sun, 09 Aug 2026 11:55:00 GMT'
    ],
    ['invalid Last-Modified', 'not-a-date', null]
  ])('parses %s', (_label, value, expected) => {
    expect(parseResponsePolicy(
      { 'last-modified': value },
      RECEIVED_AT
    ).lastModified).toBe(expected);
  });

  it('caps extreme publisher freshness and retry deadlines at documented defaults', () => {
    const policy = parseResponsePolicy({
      'cache-control': 'max-age=2592000',
      'retry-after': '2592000'
    }, RECEIVED_AT);

    expect(policy.cacheFreshUntil.getTime() - RECEIVED_AT.getTime())
      .toBe(DEFAULT_FEED_CACHE_FRESHNESS_MAX_MS);
    expect(policy.retryAfterAt.getTime() - RECEIVED_AT.getTime())
      .toBe(DEFAULT_FEED_RETRY_AFTER_MAX_MS);
  });

  it('applies the freshness bound after accounting for response age', () => {
    const policy = parseResponsePolicy({
      'cache-control': 'max-age=2592000',
      age: '1728000'
    }, RECEIVED_AT);

    expect(policy.cacheFreshUntil.getTime() - RECEIVED_AT.getTime())
      .toBe(DEFAULT_FEED_CACHE_FRESHNESS_MAX_MS);
  });

  it('honors configured operational deadline bounds', () => {
    process.env.FEED_CACHE_FRESHNESS_MAX_MS = '60000';
    process.env.FEED_RETRY_AFTER_MAX_MS = '120000';

    const policy = parseResponsePolicy({
      expires: 'Sun, 09 Aug 2026 13:00:00 GMT',
      'retry-after': '3600'
    }, RECEIVED_AT);

    expect(policy.cacheFreshUntil.toISOString()).toBe('2026-08-09T12:01:00.000Z');
    expect(policy.retryAfterAt.toISOString()).toBe('2026-08-09T12:02:00.000Z');
  });
});
