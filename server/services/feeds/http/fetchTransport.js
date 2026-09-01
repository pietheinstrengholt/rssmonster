// Adapts native Fetch and Undici behavior into neutral feed HTTP contracts.

import { fetchWithOutboundRequestSafeguard } from '../../../utils/outboundRequestSafeguard.js';
import {
  createHttpBodyStream,
  createHttpError,
  createHttpRedirect,
  createHttpResponse
} from './contracts.js';
import { originRequestPolicy } from './requestCoordination.js';
import {
  remainingDeadlineMs,
  resolveDeadlineAt
} from '../executionDeadline.js';

export const RSSMONSTER_USER_AGENT =
  'RSSMonster/2.0.0 (+https://github.com/pietheinstrengholt/rssmonster)';

// Waits for a retry backoff interval.
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Finds a stable application or network code through nested client causes.
const findErrorCode = error => {
  let current = error;
  while (current) {
    if (current.code) return current.code;
    current = current.cause;
  }
  return null;
};

// Detects raw transport failures that may succeed on a later attempt.
const isRetryableTransportError = error => {
  const message = String(error?.message || '').toLowerCase();
  const code = findErrorCode(error);
  return (
    error?.name === 'AbortError' ||
    error?.name === 'TimeoutError' ||
    ['ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(code) ||
    message.includes('socket hang up') ||
    message.includes('fetch failed')
  );
};

// Maps client-specific connection codes into a small transport-neutral diagnostic set.
const neutralTransportCode = (code, message) => {
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'DNS_ERROR';
  if (code === 'ECONNRESET') return 'CONNECTION_RESET';
  if (code === 'ECONNREFUSED') return 'CONNECTION_REFUSED';
  if (
    String(code || '').includes('TLS') ||
    String(code || '').includes('CERT') ||
    String(message || '').toLowerCase().includes('certificate')
  ) {
    return 'TLS_ERROR';
  }
  return 'NETWORK_ERROR';
};

// Translates all raw client exceptions into deterministic neutral errors.
export const translateTransportError = error => {
  const message = String(error?.message || 'HTTP transport failed');
  const lowerMessage = message.toLowerCase();
  const code = findErrorCode(error);

  if (code === 'SSRF_BLOCKED') {
    const malformed = lowerMessage.includes('url is invalid');
    return createHttpError({
      type: malformed ? 'malformed' : 'security_rejected',
      message
    });
  }

  if (code === 'REDIRECT_LIMIT_EXCEEDED') {
    return createHttpError({
      type: 'permanent_failure',
      message,
      code: 'REDIRECT_LOOP'
    });
  }

  if (
    error?.name === 'TimeoutError' ||
    error?.name === 'AbortError' ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT'
  ) {
    return createHttpError({
      type: 'timed_out',
      message: code === 'UND_ERR_CONNECT_TIMEOUT'
        ? 'The connection attempt timed out'
        : 'The fetch operation timed out',
      code: code === 'UND_ERR_CONNECT_TIMEOUT'
        ? 'CONNECT_TIMEOUT'
        : 'REQUEST_TIMEOUT'
    });
  }

  return createHttpError({
    type: isRetryableTransportError(error)
      ? 'transient_failure'
      : 'permanent_failure',
    message,
    code: neutralTransportCode(code, message)
  });
};

// Reports whether a neutral transport failure is eligible for another bounded attempt.
const isRetryableTranslatedError = (error, request) =>
  !request.signal?.aborted && (
    error.type === 'transient_failure' ||
    error.type === 'timed_out'
  );

// Converts Fetch headers into a neutral lower-case string map.
const toNeutralHeaders = headers => Object.fromEntries(headers.entries());

// Wraps a Fetch body reader and request abort controller behind the neutral stream contract.
const toNeutralBodyStream = (response, responseController, release) => {
  if (!response.body) {
    release();
    return null;
  }

  let reader;
  try {
    reader = response.body.getReader();
  } catch (error) {
    release();
    throw error;
  }
  return createHttpBodyStream({
    // Pulls one decoded transport chunk without exposing ReadableStream results.
    read: async () => {
      try {
        const { done, value } = await reader.read();
        if (done) release();
        return { done, chunk: value || null };
      } catch (error) {
        release();
        return { error: translateTransportError(error) };
      }
    },
    // Cancels both the response reader and its underlying request.
    cancel: async reason => {
      let cancellation;
      try {
        cancellation = reader.cancel(reason);
      } finally {
        responseController.abort(reason);
        release();
      }
      await cancellation;
    }
  });
};

// Executes one neutral request within a single deadline and returns no raw client types.
export const executeHttpRequest = async (
  request,
  fetchImplementation,
  { requestPolicy = originRequestPolicy } = {}
) => {
  const deadline = resolveDeadlineAt(
    request.deadlineAt,
    request.connectTimeoutMs + request.bodyTimeoutMs
  );

  // Performs guarded attempts and retries eligible transient failures and timeouts.
  const attemptFetch = async attempt => {
    const remainingMs = remainingDeadlineMs(deadline);
    if (remainingMs <= 0) {
      return {
        error: createHttpError({
          type: 'timed_out',
          message: 'The fetch operation timed out',
          code: 'REQUEST_TIMEOUT'
        }),
        attempts: attempt
      };
    }

    const responseController = new AbortController();
    const deadlineSignal = AbortSignal.timeout(Math.max(1, Math.ceil(remainingMs)));
    const signals = [
      deadlineSignal,
      responseController.signal,
      request.signal
    ].filter(Boolean);
    const signal = AbortSignal.any(signals);
    const redirects = [];
    let finalRelease = null;

    try {
      const response = await fetchWithOutboundRequestSafeguard(
        request.url,
        {
          signal,
          // Prevents Fetch from synthesizing Cache-Control: no-cache for validators.
          cache: 'force-cache',
          headers: {
            'User-Agent': RSSMONSTER_USER_AGENT,
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,application/atom+xml,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            ...request.headers
          }
        },
        undefined,
        fetchImplementation,
        redirect => redirects.push(createHttpRedirect(redirect)),
        {
          connectTimeoutMs: request.connectTimeoutMs,
          // Holds a separate permit for every redirect hop's actual origin.
          beforeRequest: url => requestPolicy.acquire(url, {
            deadlineAt: deadline,
            signal
          }),
          // Releases discarded redirect responses after their bodies are cancelled.
          afterRequest: release => release?.(),
          // Transfers the final hop permit to the neutral body lifetime wrapper.
          finalResponse: release => {
            finalRelease = release;
          }
        }
      );
      const release = finalRelease || (() => {});

      return {
        response: createHttpResponse({
          status: response.status,
          url: response.url || request.url,
          headers: toNeutralHeaders(response.headers),
          redirects,
          body: toNeutralBodyStream(response, responseController, release)
        }),
        attempts: attempt + 1
      };
    } catch (error) {
      finalRelease?.();
      const translated = translateTransportError(error);
      if (
        isRetryableTranslatedError(translated, request) &&
        !deadlineSignal.aborted &&
        attempt < request.retries
      ) {
        const remainingAfterFailureMs = remainingDeadlineMs(deadline);
        const waitTime = Math.min(
          100 * (attempt + 1),
          Math.floor(remainingAfterFailureMs / 2)
        );
        if (waitTime > 0) {
          await delay(waitTime);
          if (
            !request.signal?.aborted &&
            remainingDeadlineMs(deadline) > 0
          ) {
            return attemptFetch(attempt + 1);
          }
        }
      }

      return { error: translated, attempts: attempt + 1 };
    }
  };

  return attemptFetch(0);
};

export default { executeHttpRequest, translateTransportError };
