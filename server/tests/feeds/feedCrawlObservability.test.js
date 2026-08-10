import { describe, expect, it } from 'vitest';
import {
  CRAWL_OUTCOMES,
  classifyCrawlOutcome
} from '../../services/feeds/crawlResult.js';
import {
  resolveFeedCrawlStatus,
  resolveRecoveryErrorCategory
} from '../../services/feeds/feedCrawlObservability.js';
import { FETCH_OUTCOMES, createFetchOutcome } from '../../services/feeds/http/contracts.js';

// Builds one neutral outcome with the requested response status.
const httpOutcome = (type, status) => createFetchOutcome(type, {
  response: { status },
  error: { status, message: `HTTP ${status}` }
});

describe('feed crawl observability classification', () => {
  it.each([
    [CRAWL_OUTCOMES.SUCCESS, 'SUCCESS'],
    [CRAWL_OUTCOMES.RECOVERED, 'RECOVERED'],
    [CRAWL_OUTCOMES.EMPTY_FEED, 'SUCCESS'],
    [CRAWL_OUTCOMES.TIMEOUT, 'FAILED'],
    [CRAWL_OUTCOMES.VALIDATION_ERROR, 'FAILED']
  ])('maps %s to the durable %s status', (category, status) => {
    expect(resolveFeedCrawlStatus(category)).toBe(status);
  });

  it.each([
    [httpOutcome(FETCH_OUTCOMES.PERMANENT_FAILURE, 404), CRAWL_OUTCOMES.NOT_FOUND],
    [httpOutcome(FETCH_OUTCOMES.RATE_LIMITED, 429), CRAWL_OUTCOMES.RATE_LIMITED],
    [createFetchOutcome(FETCH_OUTCOMES.TIMED_OUT), CRAWL_OUTCOMES.TIMEOUT]
  ])('centrally classifies common terminal acquisition failures', (outcome, category) => {
    expect(classifyCrawlOutcome({ outcome })).toBe(category);
  });

  it('classifies post-parse application validation as a failed lifecycle', () => {
    expect(classifyCrawlOutcome({
      outcome: createFetchOutcome(FETCH_OUTCOMES.CHANGED),
      parsedFeed: true,
      itemCount: 1,
      error: Object.assign(new Error('Article validation failed'), {
        code: 'ARTICLE_VALIDATION_ERROR'
      })
    })).toBe(CRAWL_OUTCOMES.VALIDATION_ERROR);
  });

  it.each([
    [FETCH_OUTCOMES.TIMED_OUT, null, null, null, CRAWL_OUTCOMES.TIMEOUT],
    [FETCH_OUTCOMES.PERMANENT_FAILURE, 404, null, null, CRAWL_OUTCOMES.NOT_FOUND],
    [FETCH_OUTCOMES.PERMANENT_FAILURE, null, 'REDIRECT_LOOP', null, CRAWL_OUTCOMES.REDIRECT_LOOP],
    [null, null, null, 'MALFORMED_FEED_BODY', CRAWL_OUTCOMES.MALFORMED_BODY]
  ])('retains the recovered primary %s failure category', (
    outcomeType,
    httpStatus,
    errorCode,
    parserCode,
    expectedCategory
  ) => {
    expect(resolveRecoveryErrorCategory({
      discovery: {
        recovered: true,
        primary: {
          outcomeType,
          httpStatus,
          ...(errorCode ? { errorCode } : {}),
          ...(parserCode ? { parserFailure: { code: parserCode } } : {})
        }
      }
    })).toBe(expectedCategory);
  });

  it('does not invent a recovery category without successful recovery metadata', () => {
    expect(resolveRecoveryErrorCategory({ discovery: { recovered: false } }))
      .toBeNull();
  });
});
