import { getEmbeddingConfig } from '../../config/config.js';
import { createOpenAIEmbeddingProvider } from './openaiEmbeddingProvider.js';
import { createQwenEmbeddingProvider } from './qwenEmbeddingProvider.js';

export const createEmbeddingProvider = (environment = process.env) => {
  const { provider } = getEmbeddingConfig(environment);
  return provider === 'qwen'
    ? createQwenEmbeddingProvider({ environment })
    : createOpenAIEmbeddingProvider({ environment });
};
