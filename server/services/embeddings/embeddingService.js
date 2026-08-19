const DEFAULT_INFERENCE_URL = 'http://127.0.0.1:3001';
const DEFAULT_TIMEOUT_MS = 30_000;

export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

const validateResponse = (payload, expectedCount) => {
  if (
    !payload ||
    typeof payload.model !== 'string' ||
    !Number.isInteger(payload.dimensions) ||
    !Array.isArray(payload.embeddings)
  ) {
    throw new Error('Inference embeddings response is malformed');
  }

  if (payload.embeddings.length !== expectedCount || payload.count !== expectedCount) {
    throw new Error(
      `Inference embeddings count mismatch: requested ${expectedCount}, received ${payload.embeddings.length}`
    );
  }

  if (payload.embeddings.some(vector => (
    !Array.isArray(vector) ||
    vector.length !== payload.dimensions ||
    vector.some(value => !Number.isFinite(value))
  ))) {
    throw new Error('Inference embeddings response contains an invalid vector');
  }

  return payload;
};

const requestOptions = (options = {}) => ({
  baseUrl: options.baseUrl || process.env.INFERENCE_URL || DEFAULT_INFERENCE_URL,
  timeoutMs: Number(options.timeoutMs || process.env.INFERENCE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  fetchImplementation: options.fetchImplementation || fetch
});

export async function getEmbeddingInfo(options = {}) {
  const { baseUrl, timeoutMs, fetchImplementation } = requestOptions(options);
  let response;

  try {
    response = await fetchImplementation(`${baseUrl.replace(/\/$/, '')}/api/embeddings/info`, {
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw new Error(`Inference embeddings service is unavailable: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Inference embeddings info request failed with HTTP ${response.status}`);
  }

  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload.model !== 'string' || !Number.isInteger(payload.dimensions)) {
    throw new Error('Inference embeddings info response is malformed');
  }

  return payload;
}

export async function embedTexts(texts, options = {}) {
  const { baseUrl, timeoutMs, fetchImplementation } = requestOptions(options);
  let response;

  try {
    response = await fetchImplementation(`${baseUrl.replace(/\/$/, '')}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts }),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new Error(`Inference embeddings request timed out after ${timeoutMs}ms`);
    }
    throw new Error(`Inference embeddings service is unavailable: ${error.message}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `Inference embeddings request failed with HTTP ${response.status}` +
      (detail ? `: ${detail.slice(0, 200)}` : '')
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error('Inference embeddings response is not valid JSON');
  }

  return validateResponse(payload, texts.length);
}

export default { embedTexts, getEmbeddingInfo };
