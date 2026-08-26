import {
  getSafeInferenceErrorMessage,
  requestInferenceJson
} from '../inference/inferenceClient.js';

export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

const rethrowEmbeddingRequestError = (error, { info = false } = {}) => {
  if (error?.code === 'INFERENCE_CIRCUIT_OPEN' || error?.code === 'FEED_EXECUTION_TIMEOUT') {
    throw error;
  }
  if (error?.status) {
    error.message = error.message.replace(
      /^Inference request/,
      info ? 'Inference embeddings info request' : 'Inference embeddings request'
    );
    throw error;
  }
  if (error?.code === 'INFERENCE_TIMEOUT') {
    error.message = getSafeInferenceErrorMessage(error, {
      capability: info ? 'embeddings info' : 'embeddings'
    });
    throw error;
  }
  if (error?.code === 'INFERENCE_UNAVAILABLE') {
    error.message = getSafeInferenceErrorMessage(error, {
      capability: info ? 'embeddings info' : 'embeddings'
    });
    throw error;
  }
  if (error?.message === 'Inference response is not valid JSON') {
    error.message = info
      ? 'Inference embeddings info response is malformed'
      : 'Inference embeddings response is not valid JSON';
  }
  throw error;
};

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

export async function getEmbeddingInfo(options = {}) {
  let payload;
  try {
    payload = await requestInferenceJson('/api/embeddings/info', undefined, {
      ...options,
      circuitKey: 'embeddings',
      method: 'GET'
    });
  } catch (error) {
    rethrowEmbeddingRequestError(error, { info: true });
  }
  if (!payload || typeof payload.model !== 'string' || !Number.isInteger(payload.dimensions)) {
    throw new Error('Inference embeddings info response is malformed');
  }

  return payload;
}

export async function embedTexts(texts, options = {}) {
  let payload;
  try {
    payload = await requestInferenceJson('/api/embeddings', { texts }, {
      ...options,
      circuitKey: 'embeddings'
    });
  } catch (error) {
    rethrowEmbeddingRequestError(error);
  }
  return validateResponse(payload, texts.length);
}

export default { embedTexts, getEmbeddingInfo };
