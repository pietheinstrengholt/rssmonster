import { acquireHttp } from '../http/acquireHttp.js';
import {
  FETCH_OUTCOMES,
  createFetchOutcome,
  isSuccessfulFetchOutcome
} from '../http/contracts.js';
import { parseFeedSourceIsolated } from './isolatedFeedParser.js';
import { parseFeedSourceSync } from './parseFeedSync.js';
import { isFeedTimeoutError } from '../executionDeadline.js';

// Preserves synchronous parsing only for compatibility and isolated worker use.
export const parseFeedSource = source => parseFeedSourceSync(source);

// Acquires and parses one feed while preserving the neutral fetch outcome.
export const acquireFeedSource = async (feedUrl, requestState = {}) => {
  if (!feedUrl) {
    return createFetchOutcome(FETCH_OUTCOMES.MALFORMED, {
      error: {
        type: FETCH_OUTCOMES.MALFORMED,
        reason: 'invalid_url',
        message: 'Missing feed URL'
      }
    });
  }

  const outcome = await acquireHttp({ url: feedUrl, ...requestState });
  if (
    outcome.type === FETCH_OUTCOMES.UNCHANGED ||
    outcome.type === FETCH_OUTCOMES.NOT_MODIFIED
  ) {
    return outcome;
  }
  if (!isSuccessfulFetchOutcome(outcome)) return outcome;

  if (!outcome.bodyText) {
    return createFetchOutcome(FETCH_OUTCOMES.MALFORMED, {
      request: outcome.request,
      response: outcome.response,
      policy: outcome.policy,
      error: {
        type: FETCH_OUTCOMES.MALFORMED,
        reason: 'empty_body',
        message: 'Empty feed response'
      }
    });
  }

  try {
    return createFetchOutcome(outcome.type, {
      ...outcome,
      parsedFeed: await parseFeedSourceIsolated(outcome.bodyText, requestState)
    });
  } catch (error) {
    const type = isFeedTimeoutError(error)
      ? FETCH_OUTCOMES.TIMED_OUT
      : error?.code === 'FEED_INPUT_LIMIT_EXCEEDED'
        ? FETCH_OUTCOMES.TOO_LARGE
        : FETCH_OUTCOMES.MALFORMED;
    return createFetchOutcome(type, {
      request: outcome.request,
      response: outcome.response,
      policy: outcome.policy,
      error: {
        type,
        ...(error?.code ? { code: error.code } : {}),
        reason: error?.code === 'UNSAFE_FEED_XML'
          ? 'unsafe_xml'
          : error?.code === 'FEED_INPUT_LIMIT_EXCEEDED'
            ? 'input_limit'
            : isFeedTimeoutError(error)
              ? 'parser_timeout'
              : 'invalid_feed',
        message: (
          isFeedTimeoutError(error) ||
          error?.code === 'UNSAFE_FEED_XML' ||
          error?.code === 'FEED_INPUT_LIMIT_EXCEEDED'
        )
          ? error.message
          : 'Invalid or unsupported feed format'
      }
    });
  }
};

// Preserves the legacy parser API while adapting neutral outcomes to stable errors.
export const process = async feedUrl => {
  const outcome = await acquireFeedSource(feedUrl);
  if (isSuccessfulFetchOutcome(outcome)) return outcome.parsedFeed;

  const error = new Error(outcome.error?.message || 'Feed parsing failed');
  if (outcome.type === FETCH_OUTCOMES.TOO_LARGE) {
    error.code = 'RESPONSE_TOO_LARGE';
  } else if (outcome.type === FETCH_OUTCOMES.SECURITY_REJECTED) {
    error.code = 'SSRF_BLOCKED';
  } else if (outcome.type === FETCH_OUTCOMES.MALFORMED) {
    error.code = outcome.error?.reason === 'invalid_url'
      ? 'INVALID_FEED_URL'
      : outcome.error?.reason === 'empty_body'
        ? 'EMPTY_FEED_RESPONSE'
        : 'INVALID_FEED';
  } else if (outcome.response?.status) {
    error.code = 'FEED_FETCH_ERROR';
    error.message = `Feed fetch failed (HTTP ${outcome.response.status})`;
  } else {
    error.code = 'FEED_PARSE_ERROR';
  }

  throw error;
};

export default { acquireFeedSource, parseFeedSource, process };
