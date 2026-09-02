import { describe, expect, it } from 'vitest';

import {
  CRAWL_OUTCOMES,
  classifyCrawlOutcome,
  formatCrawlResultLine
} from '../../services/feeds/crawlResult.js';

describe('feed crawl operational results', () => {
  it.each([
    ['direct success', { outcome: { type: 'changed' } }, CRAWL_OUTCOMES.SUCCESS],
    ['not modified success', {
      outcome: { type: 'not_modified' }
    }, CRAWL_OUTCOMES.SUCCESS],
    ['recovered success', {
      outcome: { type: 'changed', discovery: { recovered: true } }
    }, CRAWL_OUTCOMES.RECOVERED],
    ['empty valid feed', {
      outcome: { type: 'changed' }, parsedFeed: true, itemCount: 0
    }, CRAWL_OUTCOMES.EMPTY_FEED],
    ['timeout', { outcome: { type: 'timed_out' } }, CRAWL_OUTCOMES.TIMEOUT],
    ['rate limit', { outcome: { type: 'rate_limited' } }, CRAWL_OUTCOMES.RATE_LIMITED],
    ['not found', {
      outcome: { type: 'permanent_failure', response: { status: 404 } }
    }, CRAWL_OUTCOMES.NOT_FOUND],
    ['other HTTP error', {
      outcome: { type: 'transient_failure', response: { status: 503 } }
    }, CRAWL_OUTCOMES.HTTP_ERROR],
    ['redirect loop', {
      outcome: {
        type: 'permanent_failure',
        error: { code: 'REDIRECT_LOOP' }
      }
    }, CRAWL_OUTCOMES.REDIRECT_LOOP],
    ['network error', {
      outcome: { type: 'transient_failure', error: { message: 'DNS failed' } }
    }, CRAWL_OUTCOMES.NETWORK_ERROR],
    ['invalid feed', {
      outcome: { type: 'malformed', error: { code: 'INVALID_FEED' } }
    }, CRAWL_OUTCOMES.INVALID_FEED],
    ['malformed feed body', {
      outcome: { type: 'malformed', error: { code: 'MALFORMED_FEED_BODY' } }
    }, CRAWL_OUTCOMES.MALFORMED_BODY],
    ['unsafe XML body', {
      outcome: { type: 'malformed', error: { code: 'UNSAFE_FEED_XML' } }
    }, CRAWL_OUTCOMES.MALFORMED_BODY],
    ['invalid encoded body', {
      outcome: { type: 'malformed', error: { code: 'INVALID_FEED_ENCODING' } }
    }, CRAWL_OUTCOMES.MALFORMED_BODY],
    ['database validation', {
      outcome: { type: 'changed' },
      error: { name: 'SequelizeValidationError' }
    }, CRAWL_OUTCOMES.VALIDATION_ERROR],
    ['invalid stored item filter', {
      outcome: { type: 'changed' },
      error: { code: 'FEED_ITEM_FILTER_INVALID' }
    }, CRAWL_OUTCOMES.VALIDATION_ERROR],
    ['security rejection', {
      outcome: { type: 'security_rejected' }
    }, CRAWL_OUTCOMES.SECURITY_REJECTED],
    ['oversized response', {
      outcome: { type: 'too_large' }
    }, CRAWL_OUTCOMES.TOO_LARGE],
    ['unexpected processing failure', {
      outcome: { type: 'changed' }, error: new Error('unexpected')
    }, CRAWL_OUTCOMES.UNKNOWN_ERROR]
  ])('classifies %s deterministically', (_label, input, expected) => {
    expect(classifyCrawlOutcome(input)).toBe(expected);
  });

  it('formats one compact structured result with bounded single-line diagnostics', () => {
    const line = formatCrawlResultLine({
      category: CRAWL_OUTCOMES.RECOVERED,
      feedUrl: 'https://www.plex.tv/feed/',
      resolvedUrl: 'https://www.plex.tv/feed/atom/',
      itemCount: 10,
      newArticleCount: 4,
      filteredArticleCount: 3,
      attempts: 2,
      durationMs: 3200,
      httpStatus: 200,
      retryAfterSeconds: 120,
      errorCode: 'DETAIL',
      message: 'first line\nsecond line'
    });

    expect(line).toContain('[CRAWL] feed=www.plex.tv/feed/ status=success');
    expect(line).toContain('resolved=www.plex.tv/feed/atom/');
    expect(line).toContain('items=10 new=4 filtered=3 http=200 retryAfter=120s attempts=2');
    expect(line).toContain('code=DETAIL message="first line second line" duration=3.2s');
    expect(line).not.toContain('\n');
  });

  it('redacts query credentials from feed labels, resolved URLs, and errors', () => {
    const line = formatCrawlResultLine({
      category: CRAWL_OUTCOMES.HTTP_ERROR,
      feedUrl: 'https://feeds.example.test/rss?section=tech&api_key=input-secret',
      resolvedUrl: 'https://cdn.example.test/rss?token=resolved-secret',
      message: 'Fetch failed for https://feeds.example.test/rss?password=error-secret'
    });

    expect(line).toContain('section=tech');
    expect(line).toContain('REDACTED');
    expect(line).not.toContain('input-secret');
    expect(line).not.toContain('resolved-secret');
    expect(line).not.toContain('error-secret');
  });
});
