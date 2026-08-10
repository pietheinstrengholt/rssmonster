import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { DEFAULT_FEED_LEASE_MS } from '../../services/feeds/feedClaims.js';
import { DEFAULT_FEED_INPUT_LIMITS } from '../../services/feeds/feedsmith/feedInputLimits.js';
import {
  DEFAULT_FEED_PARSER_MEMORY_MB,
  DEFAULT_FEED_PARSER_TIMEOUT_MS
} from '../../services/feeds/feedsmith/isolatedFeedParser.js';
import { DEFAULT_FEED_RESPONSE_MAX_BYTES } from '../../services/feeds/http/responseBody.js';
import {
  resolveFeedHttpTimeoutMs
} from '../../services/feeds/http/contracts.js';
import {
  DEFAULT_FEED_CACHE_FRESHNESS_MAX_MS,
  DEFAULT_FEED_RETRY_AFTER_MAX_MS
} from '../../services/feeds/http/responsePolicy.js';

const EXAMPLE_ENV = readFileSync(
  new URL('../../.env.example', import.meta.url),
  'utf8'
);

// Reads one documented example value without applying dotenv interpolation.
const exampleValue = name => EXAMPLE_ENV.match(
  new RegExp(`^${name}=(.*)$`, 'm')
)?.[1];

describe('feed environment example defaults', () => {
  it('matches runtime defaults for feed acquisition and parser limits', () => {
    expect(Number(exampleValue('FEED_RESPONSE_MAX_BYTES')))
      .toBe(DEFAULT_FEED_RESPONSE_MAX_BYTES);
    expect(Number(exampleValue('FEED_HTTP_TIMEOUT_MS')))
      .toBe(resolveFeedHttpTimeoutMs({}));
    expect(Number(exampleValue('FEED_LEASE_MS'))).toBe(DEFAULT_FEED_LEASE_MS);
    expect(Number(exampleValue('FEED_CACHE_FRESHNESS_MAX_MS')))
      .toBe(DEFAULT_FEED_CACHE_FRESHNESS_MAX_MS);
    expect(Number(exampleValue('FEED_RETRY_AFTER_MAX_MS')))
      .toBe(DEFAULT_FEED_RETRY_AFTER_MAX_MS);
    expect(Number(exampleValue('FEED_PARSER_TIMEOUT_MS')))
      .toBe(DEFAULT_FEED_PARSER_TIMEOUT_MS);
    expect(Number(exampleValue('FEED_PARSER_MEMORY_MB')))
      .toBe(DEFAULT_FEED_PARSER_MEMORY_MB);
    expect(Number(exampleValue('FEED_MAX_ENTRIES')))
      .toBe(DEFAULT_FEED_INPUT_LIMITS.entries);
    expect(Number(exampleValue('FEED_MAX_CONTENT_BYTES')))
      .toBe(DEFAULT_FEED_INPUT_LIMITS.contentBytes);
  });

  it('documents the current crawl batch default under its preferred name', () => {
    expect(exampleValue('FEED_MAX_COUNT')).toBe('10');
    expect(exampleValue('FEED_PARALLEL_CONCURRENCY')).toBe('3');
    expect(exampleValue('MAX_FEEDCOUNT')).toBeUndefined();
  });
});
