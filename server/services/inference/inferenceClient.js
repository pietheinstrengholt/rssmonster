import { assertInferenceEnabled } from '../../config/intelligentFeatures.js';

const DEFAULT_INFERENCE_URL = 'http://127.0.0.1:3001';
const DEFAULT_TIMEOUT_MS = 30_000;

export class InferenceTimeoutError extends Error {
  constructor(timeoutMs, cause) {
    super(`Inference request timed out after ${timeoutMs}ms`, { cause });
    this.name = 'InferenceTimeoutError';
    this.code = 'INFERENCE_TIMEOUT';
  }
}

export class InferenceServiceUnavailableError extends Error {
  constructor(baseUrl, cause) {
    const reason = cause?.cause?.code || cause?.code;
    super(
      `Inference service unavailable at ${baseUrl}. ` +
      'Check INFERENCE_URL and ensure the inference service is running.' +
      (reason ? ` (${reason})` : ''),
      { cause }
    );
    this.name = 'InferenceServiceUnavailableError';
    this.code = 'INFERENCE_UNAVAILABLE';
  }
}

export const getInferenceRequestConfig = (options = {}) => ({
  baseUrl: options.baseUrl || process.env.INFERENCE_URL || DEFAULT_INFERENCE_URL,
  timeoutMs: Number(options.timeoutMs || process.env.INFERENCE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  fetchImplementation: options.fetchImplementation || fetch
});

export const requestInferenceJson = async (path, payload, options = {}) => {
  assertInferenceEnabled();
  const { baseUrl, timeoutMs, fetchImplementation } = getInferenceRequestConfig(options);
  const normalizedBaseUrl = baseUrl.replace(/\/$/, '');
  let response;
  try {
    response = await fetchImplementation(`${normalizedBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: options.signal || AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new InferenceTimeoutError(timeoutMs, error);
    }
    throw new InferenceServiceUnavailableError(normalizedBaseUrl, error);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Inference request failed with HTTP ${response.status}` +
      (detail ? `: ${detail.slice(0, 200)}` : ''));
  }

  const result = await response.json().catch(() => null);
  if (!result) throw new Error('Inference response is not valid JSON');
  return result;
};

export default { getInferenceRequestConfig, requestInferenceJson };
