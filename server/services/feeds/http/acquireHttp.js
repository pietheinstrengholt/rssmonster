// Classifies neutral HTTP responses into the closed feed-fetch outcome set.

import {
  FETCH_OUTCOMES,
  createHttpBodyContent,
  createHttpError,
  createFetchOutcome,
  createHttpRequest
} from './contracts.js';
import { executeHttpRequest } from './fetchTransport.js';
import { cancelResponseBody, readResponseText } from './responseBody.js';
import { parseResponsePolicy } from './responsePolicy.js';
import {
  canonicalizeRequestUrl,
  requestCoalescer
} from './requestCoordination.js';
import { resolveDeadlineAt } from '../executionDeadline.js';

const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 500, 502, 503, 504]);

// Creates a failure outcome from a neutral transport error.
const outcomeFromError = (
  request,
  error,
  response,
  policy = undefined,
  attempts = 1
) => createFetchOutcome(
  error.type,
  { request, response, policy, error, attempts }
);

// Builds a coalescing key without merging requests with different validators.
const requestIdentity = request => JSON.stringify({
  url: canonicalizeRequestUrl(request.url),
  headers: request.headers,
  previousContentHash: request.previousContentHash,
  retries: request.retries,
  timeoutMs: request.timeoutMs
});

// Cancels a policy-discarded body without exposing transport-specific behavior.
const cancelDiscardedBody = (response, type) => cancelResponseBody(
  response,
  createHttpError({
    type,
    message: `The HTTP ${response.status} response body is not consumed`
  })
);

// Acquires one already-normalized request and returns one neutral outcome.
const acquireRequest = async (request, transport) => {
  const transportResult = await transport(request);
  if (transportResult.error) {
    return outcomeFromError(
      request,
      transportResult.error,
      null,
      undefined,
      transportResult.attempts
    );
  }

  const { response } = transportResult;
  const attempts = transportResult.attempts ?? 1;
  const policy = parseResponsePolicy(response.headers);

  if (response.status === 304) {
    cancelDiscardedBody(response, FETCH_OUTCOMES.NOT_MODIFIED);
    return createFetchOutcome(FETCH_OUTCOMES.NOT_MODIFIED, {
      request,
      response,
      policy,
      attempts
    });
  }

  if (
    response.status === 429 ||
    (response.status === 503 && policy.retryAfterAt)
  ) {
    cancelDiscardedBody(response, FETCH_OUTCOMES.RATE_LIMITED);
    return createFetchOutcome(FETCH_OUTCOMES.RATE_LIMITED, {
      request,
      response,
      policy,
      attempts,
      error: {
        type: FETCH_OUTCOMES.RATE_LIMITED,
        message: `Server rate limited the request (HTTP ${response.status})`,
        status: response.status,
        retryAfter: policy.retryAfterAt
      }
    });
  }

  if (TRANSIENT_HTTP_STATUSES.has(response.status)) {
    cancelDiscardedBody(response, FETCH_OUTCOMES.TRANSIENT_FAILURE);
    return createFetchOutcome(FETCH_OUTCOMES.TRANSIENT_FAILURE, {
      request,
      response,
      policy,
      attempts,
      error: {
        type: FETCH_OUTCOMES.TRANSIENT_FAILURE,
        message: `Server returned HTTP ${response.status}`,
        status: response.status,
        retryAfter: policy.retryAfterAt
      }
    });
  }

  if (response.status < 200 || response.status >= 300) {
    cancelDiscardedBody(response, FETCH_OUTCOMES.PERMANENT_FAILURE);
    return createFetchOutcome(FETCH_OUTCOMES.PERMANENT_FAILURE, {
      request,
      response,
      policy,
      attempts,
      error: {
        type: FETCH_OUTCOMES.PERMANENT_FAILURE,
        message: `Server returned HTTP ${response.status}`,
        status: response.status,
        retryAfter: policy.retryAfterAt
      }
    });
  }

  const bodyResult = await readResponseText(response, {
    deadlineAt: request.deadlineAt,
    signal: request.signal
  });
  if (bodyResult.error) {
    return outcomeFromError(request, bodyResult.error, response, policy, attempts);
  }

  const bodyHash = bodyResult.contentHash;
  const bodyContent = createHttpBodyContent({
    bytes: bodyResult.bytes,
    text: bodyResult.text,
    charset: bodyResult.charset,
    charsetSource: bodyResult.charsetSource,
    contentHash: bodyHash
  });
  const type = request.previousContentHash === bodyHash
    ? FETCH_OUTCOMES.UNCHANGED
    : FETCH_OUTCOMES.CHANGED;

  return createFetchOutcome(type, {
    request,
    response,
    policy,
    attempts,
    bodyContent,
    bodyText: bodyResult.text,
    bodyHash
  });
};

// Acquires one HTTP resource while sharing semantically identical in-flight work.
export const acquireHttp = async (
  requestInput,
  { transport = executeHttpRequest } = {}
) => {
  const request = createHttpRequest(requestInput);
  const callerDeadlineAt = resolveDeadlineAt(
    request.deadlineAt,
    request.timeoutMs
  );
  try {
    const sharedOutcome = await requestCoalescer.run(
      requestIdentity(request),
      sharedSignal => {
        const sharedRequest = createHttpRequest({
          ...request,
          deadlineAt: Date.now() + request.timeoutMs,
          signal: sharedSignal
        });
        return acquireRequest(sharedRequest, transport);
      },
      {
        deadlineAt: callerDeadlineAt,
        signal: request.signal
      }
    );
    const { type, ...details } = sharedOutcome;
    return createFetchOutcome(type, { ...details, request });
  } catch (error) {
    return outcomeFromError(request, createHttpError({
      type: FETCH_OUTCOMES.TIMED_OUT,
      message: error?.message || 'The fetch operation timed out',
      code: 'REQUEST_TIMEOUT'
    }), null);
  }
};

export default { acquireHttp };
