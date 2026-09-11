import provider from '../providers/inference.js';
import { AIValidationError, getSafeInferenceErrorMessage } from '../errors.js';

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
    typeof payload.model !== 'string' || !payload.model.trim() ||
    !Number.isSafeInteger(payload.dimensions) || payload.dimensions <= 0 ||
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

export const createEmbeddingCapability = (inference = provider) => {
  async function getEmbeddingInfo(options = {}) {
    let payload;
    try {
      payload = await inference.getEmbeddingInfo(options);
    } catch (error) {
      rethrowEmbeddingRequestError(error, { info: true });
    }
    if (!payload || typeof payload.model !== 'string' || !payload.model.trim() ||
      !Number.isSafeInteger(payload.dimensions) || payload.dimensions <= 0) {
      throw new Error('Inference embeddings info response is malformed');
    }

    return payload;
  }

  async function embedTexts(texts, options = {}) {
    if (!Array.isArray(texts) || !texts.length || texts.some(text => typeof text !== 'string' || !text.trim())) {
      throw new AIValidationError('Embedding');
    }
    let payload;
    try {
      payload = await inference.embedTexts(texts, options);
    } catch (error) {
      rethrowEmbeddingRequestError(error);
    }
    return validateResponse(payload, texts.length);
  }

  return Object.freeze({ embed: embedTexts, embedTexts, getEmbeddingInfo });
};

const embedding = createEmbeddingCapability();
export const { embedTexts, getEmbeddingInfo } = embedding;
export default embedding;
