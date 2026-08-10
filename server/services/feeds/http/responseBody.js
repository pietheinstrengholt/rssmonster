// Reads neutral HTTP body streams while retaining bounded bytes for deterministic decoding.

import { createHash } from 'node:crypto';

import { createHttpError } from './contracts.js';
import { decodeResponseBytes } from './bodyDecoding.js';
import {
  remainingDeadlineMs,
  throwIfExecutionExpired
} from '../executionDeadline.js';

export const DEFAULT_FEED_RESPONSE_MAX_BYTES = 10 * 1024 * 1024;

// Resolves the shared feed and discovery response limit from configuration.
export const getFeedResponseMaxBytes = () => {
  const configured = Number.parseInt(
    process.env.FEED_RESPONSE_MAX_BYTES || '',
    10
  );

  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_FEED_RESPONSE_MAX_BYTES;
};

// Cancels an unused neutral body without letting cancellation failure mask policy.
export const cancelResponseBody = (response, reason) => {
  try {
    void Promise.resolve(response?.body?.cancel(reason)).catch(() => {});
  } catch {
    // Cancellation remains best effort for an already discarded response.
  }
};

// Cancels an oversized body and returns the stable neutral size error.
const rejectOversizedResponse = (response, maxBytes) => {
  const error = createHttpError({
    type: 'too_large',
    message: `Response body exceeds the configured limit of ${maxBytes} bytes`
  });

  cancelResponseBody(response, error);

  return { error };
};

// Reads one neutral response once while enforcing both raw and decoded byte limits.
export const readResponseText = async (
  response,
  {
    maxBytes = getFeedResponseMaxBytes(),
    deadlineAt = null,
    signal = null
  } = {}
) => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    return {
      error: createHttpError({
        type: 'permanent_failure',
        message: 'maxBytes must be a positive safe integer'
      })
    };
  }

  const normalizedContentLength = String(
    response?.headers?.['content-length'] || ''
  ).trim();
  if (/^\d+$/.test(normalizedContentLength)) {
    const contentLength = BigInt(normalizedContentLength);
    if (contentLength > BigInt(maxBytes)) {
      return rejectOversizedResponse(response, maxBytes);
    }
  }

  if (!response?.body) {
    return {
      bytes: new Uint8Array(),
      text: '',
      charset: 'utf-8',
      charsetSource: 'default'
    };
  }

  const contentHasher = createHash('sha256');
  const byteChunks = [];
  let rawBytes = 0;

  while (true) {
    try {
      throwIfExecutionExpired({ deadlineAt, signal });
    } catch {
      void Promise.resolve(response.body.cancel(createHttpError({
        type: 'timed_out',
        message: 'The fetch operation timed out',
        code: 'BODY_TIMEOUT'
      }))).catch(() => {});
      return {
        error: createHttpError({
          type: 'timed_out',
          message: 'The fetch operation timed out',
          code: 'BODY_TIMEOUT'
        })
      };
    }

    let timeoutId;
    let abortBody;
    const readPromise = Promise.resolve().then(() => response.body.read());
    const deadlinePromise = new Promise(resolve => {
      const resolveTimeout = () => resolve({ deadlineExpired: true });
      if (signal) {
        abortBody = resolveTimeout;
        signal.addEventListener('abort', abortBody, { once: true });
      }
      if (
        deadlineAt !== null &&
        deadlineAt !== undefined &&
        Number.isFinite(Number(deadlineAt)) &&
        Number(deadlineAt) > 0
      ) {
        timeoutId = setTimeout(
          resolveTimeout,
          Math.max(1, remainingDeadlineMs(deadlineAt))
        );
      }
    });
    const result = await Promise.race([readPromise, deadlinePromise]);
    clearTimeout(timeoutId);
    if (abortBody) signal.removeEventListener('abort', abortBody);
    if (result.deadlineExpired) {
      void readPromise.catch(() => {});
      const error = createHttpError({
        type: 'timed_out',
        message: 'The fetch operation timed out',
        code: 'BODY_TIMEOUT'
      });
      void Promise.resolve(response.body.cancel(error)).catch(() => {});
      return { error };
    }
    if (result.error?.type === 'timed_out') {
      return {
        error: createHttpError({
          type: 'timed_out',
          message: result.error.message || 'The fetch operation timed out',
          code: 'BODY_TIMEOUT'
        })
      };
    }
    if (result.error) return { error: result.error };
    if (result.done) break;

    rawBytes += result.chunk.byteLength;
    if (rawBytes > maxBytes) {
      return rejectOversizedResponse(response, maxBytes);
    }

    contentHasher.update(result.chunk);
    byteChunks.push(result.chunk);
  }

  const bytes = new Uint8Array(rawBytes);
  let offset = 0;
  for (const chunk of byteChunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let decoded;
  try {
    decoded = decodeResponseBytes(bytes, response.headers);
  } catch (error) {
    return {
      error: createHttpError({
        type: 'malformed',
        message: error?.message || 'Feed body encoding is invalid',
        code: error?.code || 'INVALID_FEED_ENCODING'
      })
    };
  }
  if (Buffer.byteLength(decoded.text, 'utf8') > maxBytes) {
    return rejectOversizedResponse(response, maxBytes);
  }

  return {
    bytes,
    text: decoded.text,
    charset: decoded.charset,
    charsetSource: decoded.charsetSource,
    contentHash: contentHasher.digest('hex')
  };
};

export default { cancelResponseBody, getFeedResponseMaxBytes, readResponseText };
