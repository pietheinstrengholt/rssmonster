import { randomUUID } from 'node:crypto';
import { assertInferenceEnabled } from '../../config/intelligentFeatures.js';
import {
  createInferenceCircuitBreaker,
  getInferenceCircuitConfig,
  InferenceCircuitOpenError
} from './inferenceCircuitBreaker.js';

const DEFAULT_INFERENCE_URL = 'http://127.0.0.1:3001';
const DEFAULT_TIMEOUT_MS = 30_000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const QUALIFYING_HTTP_STATUSES = new Set([502, 503, 504]);
const RECOGNIZED_INFERENCE_ERRORS = new Set(['not_ready', 'inference_queue_full']);
const SAFE_TRANSPORT_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'ETIMEDOUT'
]);
const SAFE_ERROR_NAMES = new Set([
  'AbortError',
  'Error',
  'InferenceCircuitOpenError',
  'InferenceHttpError',
  'InferenceServiceUnavailableError',
  'InferenceStreamError',
  'InferenceTimeoutError',
  'SyntaxError',
  'TypeError'
]);
const SAFE_ERROR_CODES = new Set([
  'ABORT_ERR',
  'INFERENCE_CIRCUIT_OPEN',
  'INFERENCE_HTTP_ERROR',
  'INFERENCE_STREAM_ERROR',
  'INFERENCE_TIMEOUT',
  'INFERENCE_UNAVAILABLE'
]);

const capabilityCircuitBreakers = new Map();

const resolveRequestId = requestId =>
  typeof requestId === 'string' && REQUEST_ID_PATTERN.test(requestId) ? requestId : randomUUID();

const attachRequestMetadata = (error, { requestId, inferencePath, startedAt, now = Date.now }) => {
  error.requestId = requestId;
  error.inferencePath = inferencePath;
  error.durationMs = now() - startedAt;
  return error;
};

const parseRetryAfterMs = (value, now) => {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - now()) : 0;
};

const parseInferenceErrorCode = detail => {
  try {
    const parsed = JSON.parse(detail);
    return RECOGNIZED_INFERENCE_ERRORS.has(parsed?.error) ? parsed.error : null;
  } catch {
    return null;
  }
};

export const createInferenceRequestSignal = (timeoutMs, callerSignal) => {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
};

export const getSafeInferenceErrorMessage = (error, { capability } = {}) => {
  const subject = capability ? `Inference ${capability}` : 'Inference';
  if (error?.code === 'INFERENCE_TIMEOUT') {
    const timeoutMs = Number(error.timeoutMs);
    return `${subject} request timed out` +
      (Number.isSafeInteger(timeoutMs) && timeoutMs >= 0 ? ` after ${timeoutMs}ms` : '');
  }
  if (error?.code === 'INFERENCE_UNAVAILABLE') {
    const transportCode = SAFE_TRANSPORT_CODES.has(error.transportCode)
      ? ` (${error.transportCode})`
      : '';
    const status = Number(error.status);
    const httpStatus = Number.isInteger(status) && status >= 400 && status <= 599
      ? ` (HTTP ${status})`
      : '';
    return `${subject} service unavailable${transportCode || httpStatus}`;
  }
  if (error?.code === 'INFERENCE_CIRCUIT_OPEN') {
    const retryAfterMs = Number(error.retryAfterMs);
    return `${subject} circuit is open` +
      (Number.isSafeInteger(retryAfterMs) && retryAfterMs >= 0
        ? `; retry after ${retryAfterMs}ms`
        : '');
  }
  return `${subject} request failed`;
};

export const getSafeInferenceErrorDetails = (error, options = {}) => {
  const details = {
    name: SAFE_ERROR_NAMES.has(error?.name) ? error.name : 'Error',
    message: getSafeInferenceErrorMessage(error, options)
  };
  if (SAFE_ERROR_CODES.has(error?.code)) details.code = error.code;
  if (typeof error?.requestId === 'string' && REQUEST_ID_PATTERN.test(error.requestId)) {
    details.requestId = error.requestId;
  }
  if (Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599) {
    details.status = error.status;
  }
  if (Number.isFinite(error?.durationMs) && error.durationMs >= 0) {
    details.durationMs = error.durationMs;
  }
  return Object.freeze(details);
};

const getCapabilityCircuitBreaker = (
  circuitKey,
  { environment = process.env, logger = console } = {}
) => {
  if (!capabilityCircuitBreakers.has(circuitKey)) {
    capabilityCircuitBreakers.set(circuitKey, createInferenceCircuitBreaker({
      ...getInferenceCircuitConfig(environment),
      logger
    }));
  }
  return capabilityCircuitBreakers.get(circuitKey);
};

export class InferenceTimeoutError extends Error {
  constructor(timeoutMs, cause) {
    super(`Inference request timed out after ${timeoutMs}ms`, { cause });
    this.name = 'InferenceTimeoutError';
    this.code = 'INFERENCE_TIMEOUT';
    this.timeoutMs = timeoutMs;
  }
}

export class InferenceServiceUnavailableError extends Error {
  constructor(_baseUrl, cause) {
    const reason = cause?.cause?.code || cause?.code;
    const transportCode = SAFE_TRANSPORT_CODES.has(reason) ? reason : null;
    super(
      'Inference service unavailable. Check INFERENCE_URL and ensure the service is running.' +
      (transportCode ? ` (${transportCode})` : ''),
      { cause }
    );
    this.name = 'InferenceServiceUnavailableError';
    this.code = 'INFERENCE_UNAVAILABLE';
    this.transportCode = transportCode;
  }
}

export class InferenceHttpError extends Error {
  constructor(status, inferenceErrorCode, availabilityFailure = false) {
    super(`Inference request failed with HTTP ${status}`);
    this.name = 'InferenceHttpError';
    this.code = availabilityFailure ? 'INFERENCE_UNAVAILABLE' : 'INFERENCE_HTTP_ERROR';
    this.status = status;
    this.inferenceErrorCode = inferenceErrorCode;
  }
}

export { InferenceCircuitOpenError };

export const getInferenceRequestConfig = (options = {}) => ({
  baseUrl: options.baseUrl || process.env.INFERENCE_URL || DEFAULT_INFERENCE_URL,
  timeoutMs: Number(options.timeoutMs || process.env.INFERENCE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  fetchImplementation: options.fetchImplementation || fetch
});

export const getInferenceCircuitSnapshot = circuitKey =>
  capabilityCircuitBreakers.get(circuitKey)?.getSnapshot() || null;

export const resetInferenceCircuitBreakerForTests = () => {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('Inference circuit reset is only available in tests');
  }
  capabilityCircuitBreakers.clear();
};

export const requestInferenceJson = async (path, payload, options = {}) => {
  const requestId = resolveRequestId(options.requestId);
  const method = String(options.method || 'POST').toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD' && payload !== undefined;
  const now = options.now || Date.now;
  const startedAt = now();
  try {
    assertInferenceEnabled();
  } catch (error) {
    throw attachRequestMetadata(error, { requestId, inferencePath: path, startedAt, now });
  }
  const { baseUrl, timeoutMs, fetchImplementation } = getInferenceRequestConfig(options);
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  const circuitKey = options.circuitKey || path;
  const circuitBreaker = options.circuitBreaker || getCapabilityCircuitBreaker(circuitKey, {
    environment: options.environment,
    logger: options.logger
  });
  let admission;
  try {
    admission = circuitBreaker.beforeRequest({ requestId, inferencePath: path });
  } catch (error) {
    throw attachRequestMetadata(error, { requestId, inferencePath: path, startedAt, now });
  }
  let body;
  if (hasBody) {
    try {
      body = JSON.stringify(payload);
    } catch (error) {
      circuitBreaker.recordFailure(admission, {
        qualifies: false,
        requestId,
        inferencePath: path,
        category: 'caller_payload'
      });
      throw attachRequestMetadata(error, { requestId, inferencePath: path, startedAt, now });
    }
  }

  let response;
  const requestSignal = createInferenceRequestSignal(timeoutMs, options.signal);
  const callerAbortedRequest = () => Boolean(
    options.signal?.aborted &&
    requestSignal.aborted &&
    requestSignal.reason === options.signal.reason
  );
  const throwResponseReadFailure = error => {
    if (callerAbortedRequest()) {
      circuitBreaker.recordFailure(admission, {
        qualifies: false,
        requestId,
        inferencePath: path,
        category: 'caller_aborted'
      });
      throw attachRequestMetadata(error, { requestId, inferencePath: path, startedAt, now });
    }
    if (requestSignal.aborted) {
      const timeoutError = attachRequestMetadata(new InferenceTimeoutError(timeoutMs, error), {
        requestId, inferencePath: path, startedAt, now
      });
      circuitBreaker.recordFailure(admission, {
        qualifies: true,
        requestId,
        inferencePath: path,
        category: 'timeout'
      });
      throw timeoutError;
    }

    const unavailableError = attachRequestMetadata(
      new InferenceServiceUnavailableError(normalizedBaseUrl, error),
      { requestId, inferencePath: path, startedAt, now }
    );
    circuitBreaker.recordFailure(admission, {
      qualifies: true,
      requestId,
      inferencePath: path,
      category: 'response_body_unavailable'
    });
    throw unavailableError;
  };
  try {
    response = await fetchImplementation(`${normalizedBaseUrl}${path}`, {
      method,
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        'X-Request-ID': requestId
      },
      ...(hasBody ? { body } : {}),
      signal: requestSignal
    });
  } catch (error) {
    if (callerAbortedRequest()) {
      circuitBreaker.recordFailure(admission, {
        qualifies: false,
        requestId,
        inferencePath: path,
        category: 'caller_aborted'
      });
      throw attachRequestMetadata(error, { requestId, inferencePath: path, startedAt, now });
    }
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      const timeoutError = attachRequestMetadata(new InferenceTimeoutError(timeoutMs, error), {
        requestId, inferencePath: path, startedAt, now
      });
      circuitBreaker.recordFailure(admission, {
        qualifies: true,
        requestId,
        inferencePath: path,
        category: 'timeout'
      });
      throw timeoutError;
    }
    const unavailableError = attachRequestMetadata(
      new InferenceServiceUnavailableError(normalizedBaseUrl, error),
      { requestId, inferencePath: path, startedAt, now }
    );
    circuitBreaker.recordFailure(admission, {
      qualifies: true,
      requestId,
      inferencePath: path,
      category: 'transport_unavailable'
    });
    throw unavailableError;
  }

  if (!response.ok) {
    let detail;
    try {
      detail = await response.text();
    } catch (error) {
      throwResponseReadFailure(error);
    }
    const inferenceErrorCode = parseInferenceErrorCode(detail);
    const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'), now);
    const availabilityFailure = QUALIFYING_HTTP_STATUSES.has(response.status) ||
      RECOGNIZED_INFERENCE_ERRORS.has(inferenceErrorCode);
    const qualifiesForCircuit = availabilityFailure &&
      inferenceErrorCode !== 'inference_queue_full';
    const httpError = attachRequestMetadata(
      new InferenceHttpError(
        response.status,
        inferenceErrorCode,
        availabilityFailure
      ),
      { requestId, inferencePath: path, startedAt, now }
    );
    if (qualifiesForCircuit) {
      circuitBreaker.recordFailure(admission, {
        qualifies: true,
        requestId,
        inferencePath: path,
        category: inferenceErrorCode || `http_${response.status}`,
        retryAfterMs
      });
    } else {
      circuitBreaker.recordSuccess(admission, { requestId, inferencePath: path });
    }
    throw httpError;
  }

  let result;
  try {
    result = await response.json();
  } catch (error) {
    if (callerAbortedRequest() || requestSignal.aborted || error?.name !== 'SyntaxError') {
      throwResponseReadFailure(error);
    }
    circuitBreaker.recordFailure(admission, {
      qualifies: false,
      requestId,
      inferencePath: path,
      category: 'invalid_response'
    });
    throw attachRequestMetadata(new Error('Inference response is not valid JSON'), {
      requestId, inferencePath: path, startedAt, now
    });
  }
  if (!result) {
    circuitBreaker.recordFailure(admission, {
      qualifies: false,
      requestId,
      inferencePath: path,
      category: 'invalid_response'
    });
    throw attachRequestMetadata(new Error('Inference response is not valid JSON'), {
      requestId, inferencePath: path, startedAt, now
    });
  }
  circuitBreaker.recordSuccess(admission, { requestId, inferencePath: path });
  return result;
};

export default {
  createInferenceRequestSignal,
  getSafeInferenceErrorDetails,
  getSafeInferenceErrorMessage,
  getInferenceRequestConfig,
  getInferenceCircuitSnapshot,
  requestInferenceJson
};
