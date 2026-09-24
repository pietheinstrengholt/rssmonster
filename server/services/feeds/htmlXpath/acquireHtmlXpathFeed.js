// Acquires an HTML page and converts it to the canonical parsed-feed contract.

import { throwIfExecutionExpired } from '../executionDeadline.js';
import { acquireHttp } from '../http/acquireHttp.js';
import {
  FETCH_OUTCOMES,
  createConditionalHeaders,
  createFetchOutcome
} from '../http/contracts.js';
import { normalizeHtmlXpathConfig } from './config.js';
import { parseHtmlXpathIsolated } from './isolatedHtmlXpathParser.js';

const HTML_ACCEPT_HEADER = 'text/html,application/xhtml+xml;q=0.9';

// Maps extraction failures to the same closed outcome set used by native feeds.
const extractionFailureOutcome = (error, details = {}) => {
  let type = FETCH_OUTCOMES.TRANSIENT_FAILURE;
  if (
    error?.code === 'RESPONSE_TOO_LARGE' ||
    error?.code === 'FEED_INPUT_LIMIT_EXCEEDED' ||
    error?.code === 'HTML_XPATH_TOO_MANY_ITEMS'
  ) {
    type = FETCH_OUTCOMES.TOO_LARGE;
  } else if (error?.name === 'TimeoutError') {
    type = FETCH_OUTCOMES.TIMED_OUT;
  } else if (error?.name === 'HtmlXpathError' || error?.code?.startsWith('HTML_XPATH_')) {
    type = FETCH_OUTCOMES.MALFORMED;
  }

  const failureDetails = { ...details };
  delete failureDetails.type;
  delete failureDetails.error;
  return createFetchOutcome(type, {
    ...failureDetails,
    error: {
      type,
      code: error?.code || null,
      message: error?.message || 'HTML/XPath extraction failed'
    }
  });
};

const withFeedContext = (outcome, { url, feed }) => createFetchOutcome(outcome.type, {
  ...outcome,
  url: outcome.response?.url || url,
  feed
});

// Fetches one saved HTML/XPath source without running RSS endpoint discovery.
export const acquireHtmlXpathFeed = async ({
  url,
  feed,
  authentication = null,
  deadlineAt = null,
  signal = null,
  execution: suppliedExecution = null
}, {
  acquire = acquireHttp,
  parse = parseHtmlXpathIsolated
} = {}) => {
  const execution = suppliedExecution || { deadlineAt, signal };
  throwIfExecutionExpired(execution);

  let config;
  try {
    config = normalizeHtmlXpathConfig(feed?.sourceConfig);
  } catch (error) {
    return extractionFailureOutcome(error, { url, feed, attempts: 0 });
  }

  const outcome = await acquire({
    url,
    ...(authentication ? { authentication } : {}),
    headers: {
      accept: HTML_ACCEPT_HEADER,
      ...createConditionalHeaders(feed)
    },
    previousContentHash: feed?.contentHash || null,
    ...(execution.deadlineAt ? { deadlineAt: execution.deadlineAt } : {}),
    ...(execution.signal ? { signal: execution.signal } : {})
  });
  const contextualOutcome = withFeedContext(outcome, { url, feed });
  if (outcome.type !== FETCH_OUTCOMES.CHANGED) return contextualOutcome;

  if (!outcome.bodyText?.trim()) {
    return extractionFailureOutcome(Object.assign(
      new Error('The website returned an empty body'),
      { name: 'HtmlXpathError', code: 'HTML_XPATH_EMPTY_BODY' }
    ), contextualOutcome);
  }

  try {
    const result = await parse(outcome.bodyText, {
      url: contextualOutcome.url,
      config
    }, {
      deadlineAt: execution.deadlineAt,
      signal: execution.signal
    });
    return createFetchOutcome(FETCH_OUTCOMES.CHANGED, {
      ...contextualOutcome,
      parsedFeed: result.parsedFeed
    });
  } catch (error) {
    if (
      error?.code === 'FEED_LEASE_LOST' ||
      error?.code === 'FEED_EXECUTION_CONTEXT_INVALID'
    ) {
      throw error;
    }
    return extractionFailureOutcome(error, contextualOutcome);
  }
};

export default { acquireHtmlXpathFeed };
