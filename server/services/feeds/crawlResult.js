// Defines stable operational crawl results independently from fetch scheduling outcomes.

import { FETCH_OUTCOMES } from './http/contracts.js';
import {
  redactFeedLogText,
  redactFeedUrlCredentials
} from './feedLogging.js';

export const CRAWL_OUTCOMES = Object.freeze({
  SUCCESS: 'SUCCESS',
  RECOVERED: 'RECOVERED',
  TIMEOUT: 'TIMEOUT',
  HTTP_ERROR: 'HTTP_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  NOT_FOUND: 'NOT_FOUND',
  REDIRECT_LOOP: 'REDIRECT_LOOP',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INVALID_FEED: 'INVALID_FEED',
  MALFORMED_BODY: 'MALFORMED_BODY',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  EMPTY_FEED: 'EMPTY_FEED',
  SECURITY_REJECTED: 'SECURITY_REJECTED',
  TOO_LARGE: 'TOO_LARGE',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
});

const SUCCESS_CRAWL_OUTCOMES = new Set([
  CRAWL_OUTCOMES.SUCCESS,
  CRAWL_OUTCOMES.RECOVERED,
  CRAWL_OUTCOMES.EMPTY_FEED
]);
const SUCCESS_FETCH_OUTCOMES = new Set([
  FETCH_OUTCOMES.CHANGED,
  FETCH_OUTCOMES.UNCHANGED,
  FETCH_OUTCOMES.NOT_MODIFIED
]);
const MALFORMED_BODY_CODES = new Set([
  'MALFORMED_FEED_BODY',
  'UNSAFE_FEED_XML',
  'INVALID_FEED_ENCODING',
  'UNSUPPORTED_FEED_CHARSET'
]);

// Reports whether an application error represents post-parse validation or persistence failure.
const isValidationError = error => {
  const name = String(error?.name || '');
  const code = String(error?.code || '');
  return name.includes('ValidationError') ||
    name === 'SequelizeUniqueConstraintError' ||
    code === 'FEED_VALIDATION_ERROR' ||
    code === 'FEED_ITEM_FILTER_INVALID' ||
    code === 'ARTICLE_VALIDATION_ERROR';
};

// Returns the HTTP status retained by a neutral acquisition result.
const outcomeHttpStatus = outcome => outcome?.response?.status ?? outcome?.error?.status ?? null;

// Classifies one terminal feed execution without changing its persisted fetch outcome.
export const classifyCrawlOutcome = ({
  outcome = null,
  error = null,
  parsedFeed = false,
  itemCount = null
} = {}) => {
  if (error && isValidationError(error)) return CRAWL_OUTCOMES.VALIDATION_ERROR;

  if (!error && SUCCESS_FETCH_OUTCOMES.has(outcome?.type)) {
    if (parsedFeed && itemCount === 0) return CRAWL_OUTCOMES.EMPTY_FEED;
    return outcome?.discovery?.recovered
      ? CRAWL_OUTCOMES.RECOVERED
      : CRAWL_OUTCOMES.SUCCESS;
  }

  if (outcome?.error?.code === 'REDIRECT_LOOP') {
    return CRAWL_OUTCOMES.REDIRECT_LOOP;
  }
  if (
    outcome?.type === FETCH_OUTCOMES.TIMED_OUT ||
    error?.name === 'TimeoutError' ||
    error?.code === 'FEED_EXECUTION_TIMEOUT'
  ) {
    return CRAWL_OUTCOMES.TIMEOUT;
  }
  if (outcome?.type === FETCH_OUTCOMES.RATE_LIMITED) {
    return CRAWL_OUTCOMES.RATE_LIMITED;
  }

  const status = outcomeHttpStatus(outcome);
  if (status === 404) return CRAWL_OUTCOMES.NOT_FOUND;
  if (status !== null && status >= 400) return CRAWL_OUTCOMES.HTTP_ERROR;
  if (outcome?.type === FETCH_OUTCOMES.SECURITY_REJECTED) {
    return CRAWL_OUTCOMES.SECURITY_REJECTED;
  }
  if (outcome?.type === FETCH_OUTCOMES.TOO_LARGE) {
    return CRAWL_OUTCOMES.TOO_LARGE;
  }
  if (outcome?.type === FETCH_OUTCOMES.MALFORMED) {
    return (
      MALFORMED_BODY_CODES.has(outcome?.error?.code) ||
      ['empty_body', 'unsafe_xml'].includes(outcome?.error?.reason)
    )
      ? CRAWL_OUTCOMES.MALFORMED_BODY
      : CRAWL_OUTCOMES.INVALID_FEED;
  }
  if (
    outcome?.type === FETCH_OUTCOMES.TRANSIENT_FAILURE ||
    outcome?.type === FETCH_OUTCOMES.PERMANENT_FAILURE
  ) {
    return CRAWL_OUTCOMES.NETWORK_ERROR;
  }
  return CRAWL_OUTCOMES.UNKNOWN_ERROR;
};

// Reports whether one operational outcome represents a completed healthy feed execution.
export const isSuccessfulCrawlOutcome = category => SUCCESS_CRAWL_OUTCOMES.has(category);

// Produces a compact host-and-path feed label without losing meaningful query state.
export const formatFeedLabel = input => {
  try {
    const url = new URL(redactFeedUrlCredentials(input));
    return `${url.host}${url.pathname}${url.search}`;
  } catch {
    return String(input || 'unknown');
  }
};

// Formats durations compactly while retaining millisecond precision for short requests.
export const formatDuration = durationMs => {
  const bounded = Math.max(0, Math.round(Number(durationMs) || 0));
  if (bounded < 1000) return `${bounded}ms`;
  return `${(bounded / 1000).toFixed(1)}s`;
};

const crawlStatus = (category, httpStatus) => {
  if (httpStatus === 304) return 'not-modified';
  if (SUCCESS_CRAWL_OUTCOMES.has(category)) return 'success';
  return 'failed';
};

const crawlError = category => String(category || CRAWL_OUTCOMES.UNKNOWN_ERROR)
  .toLowerCase()
  .replaceAll('_', '-');

// Quotes one diagnostic as a safe single-line structured log value.
const quoteLogValue = value => JSON.stringify(
  redactFeedLogText(value).replace(/[\r\n]+/g, ' ').slice(0, 500)
);

// Formats one final structured crawl line for a feed.
export const formatCrawlResultLine = ({
  category,
  feedUrl,
  userId = null,
  resolvedUrl = null,
  itemCount = null,
  newArticleCount = 0,
  filteredArticleCount = 0,
  attempts = 1,
  durationMs = 0,
  httpStatus = null,
  retryAfterSeconds = null,
  errorCode = null,
  message = null
}) => {
  const status = crawlStatus(category, httpStatus);
  const fields = [
    `[CRAWL] feed=${formatFeedLabel(feedUrl)}`,
    `status=${status}`
  ];
  if (resolvedUrl && resolvedUrl !== feedUrl) {
    fields.push(`resolved=${formatFeedLabel(resolvedUrl)}`);
  }
  if (itemCount !== null && status !== 'not-modified') fields.push(`items=${itemCount}`);
  if (status === 'success' && itemCount !== null) {
    fields.push(`new=${Math.max(0, Number(newArticleCount) || 0)}`);
    fields.push(`filtered=${Math.max(0, Number(filteredArticleCount) || 0)}`);
  }
  if (httpStatus !== null) fields.push(`http=${httpStatus}`);
  if (retryAfterSeconds !== null) fields.push(`retryAfter=${retryAfterSeconds}s`);
  if (status === 'failed') fields.push(`error=${crawlError(category)}`);
  if (status === 'failed' || Number(attempts) > 1) {
    fields.push(`attempts=${Math.max(0, Number(attempts) || 0)}`);
  }
  if (errorCode) fields.push(`code=${errorCode}`);
  if (message) fields.push(`message=${quoteLogValue(message)}`);
  if (userId !== null) fields.push(`user=${userId}`);
  fields.push(`duration=${formatDuration(durationMs)}`);
  return fields.join(' ');
};

export const formatCrawlCompletionLine = ({
  feeds = 0,
  newArticles = 0,
  errors = 0,
  userId = null,
  durationMs = 0
} = {}) => [
  '[CRAWL] Completed',
  `feeds=${Math.max(0, Number(feeds) || 0)}`,
  `newArticles=${Math.max(0, Number(newArticles) || 0)}`,
  `errors=${Math.max(0, Number(errors) || 0)}`,
  ...(userId === null ? [] : [`user=${userId}`]),
  `duration=${formatDuration(durationMs)}`
].join(' ');

export default {
  CRAWL_OUTCOMES,
  classifyCrawlOutcome,
  formatCrawlResultLine,
  formatCrawlCompletionLine,
  formatDuration,
  formatFeedLabel,
  isSuccessfulCrawlOutcome
};
