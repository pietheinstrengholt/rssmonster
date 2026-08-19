const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;
const DEFAULT_EMBEDDING_PROVIDER = 'openai';
const DEFAULT_GENERATION_PROVIDER = 'openai';
const DEFAULT_ASSISTANT_PROVIDER = 'openai';
const DEFAULT_ARTICLE_SCORING_PROVIDER = 'openai';
const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_OPENAI_EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_LOCAL_EMBEDDING_MODEL = 'onnx-community/Qwen3-Embedding-0.6B-ONNX';
const DEFAULT_LOCAL_EMBEDDING_DIMENSIONS = 1024;
const DEFAULT_EMBEDDING_MAX_BATCH_SIZE = 8;
const DEFAULT_ASSISTANT_MODEL = 'gpt-4o-mini';
const DEFAULT_OPENAI_CRAWL_MODEL = 'gpt-4o-mini';
const DEFAULT_OPENAI_SMART_FOLDER_MODEL = 'gpt-4.1-mini';
const DEFAULT_OPENAI_FEED_REDISCOVERY_MODEL = 'gpt-4.1-mini';
const DEFAULT_MODERNBERT_MODEL = 'onnx-community/ModernBERT-base-nli-ONNX';
const DEFAULT_MODERNBERT_DTYPE = 'q8';
const DEFAULT_GENERATION_MODEL = 'onnx-community/Qwen3.5-0.8B-ONNX';
const DEFAULT_GENERATION_DTYPE = 'q4';

const parsePort = value => {
  const port = Number(value ?? DEFAULT_PORT);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('INFERENCE_PORT must be an integer between 1 and 65535');
  }

  return port;
};

export const getConfig = (env = process.env) => ({
  host: env.INFERENCE_HOST || DEFAULT_HOST,
  port: parsePort(env.INFERENCE_PORT)
});

export const getEmbeddingConfig = (env = process.env) => {
  const provider = env.EMBEDDING_PROVIDER || DEFAULT_EMBEDDING_PROVIDER;
  const maxBatchSize = Number(env.EMBEDDING_MAX_BATCH_SIZE ?? DEFAULT_EMBEDDING_MAX_BATCH_SIZE);

  if (!['openai', 'qwen'].includes(provider)) {
    throw new Error('EMBEDDING_PROVIDER must be openai or qwen');
  }

  if (!Number.isInteger(maxBatchSize) || maxBatchSize < 1) {
    throw new Error('EMBEDDING_MAX_BATCH_SIZE must be a positive integer');
  }

  if (provider === 'openai') {
    return {
      provider,
      modelId: env.OPENAI_EMBEDDING_MODEL || DEFAULT_OPENAI_EMBEDDING_MODEL,
      dimensions: Number(env.OPENAI_EMBEDDING_DIMENSIONS ?? DEFAULT_OPENAI_EMBEDDING_DIMENSIONS),
      maxBatchSize
    };
  }

  const dimensions = Number(env.EMBEDDING_DIMENSIONS ?? DEFAULT_LOCAL_EMBEDDING_DIMENSIONS);
  if (dimensions !== DEFAULT_LOCAL_EMBEDDING_DIMENSIONS) {
    throw new Error('EMBEDDING_DIMENSIONS must be 1024; dimension reduction is not supported');
  }

  return {
    provider,
    modelId: env.EMBEDDING_MODEL || DEFAULT_LOCAL_EMBEDDING_MODEL,
    dimensions,
    maxBatchSize
  };
};

export const getGenerationConfig = (env = process.env) => {
  const provider = env.GENERATION_PROVIDER || DEFAULT_GENERATION_PROVIDER;
  if (!['openai', 'qwen'].includes(provider)) {
    throw new Error('GENERATION_PROVIDER must be openai or qwen');
  }

  return {
    provider,
    modelId: provider === 'qwen'
      ? env.GENERATION_MODEL || DEFAULT_GENERATION_MODEL
      : env.OPENAI_MODEL_CRAWL || DEFAULT_OPENAI_CRAWL_MODEL,
    dtype: provider === 'qwen'
      ? env.GENERATION_DTYPE || DEFAULT_GENERATION_DTYPE
      : undefined,
    articleModel: env.OPENAI_MODEL_CRAWL || DEFAULT_OPENAI_CRAWL_MODEL,
    smartFolderModel: env.OPENAI_MODEL_SMART_FOLDERS || DEFAULT_OPENAI_SMART_FOLDER_MODEL,
    feedRediscoveryModel: env.OPENAI_MODEL_FEED_REDISCOVERY ||
      DEFAULT_OPENAI_FEED_REDISCOVERY_MODEL
  };
};

export const getAssistantConfig = (env = process.env) => {
  const provider = env.ASSISTANT_PROVIDER || DEFAULT_ASSISTANT_PROVIDER;
  if (provider !== 'openai') {
    throw new Error('ASSISTANT_PROVIDER must be openai');
  }
  return {
    provider,
    modelId: env.ASSISTANT_MODEL || DEFAULT_ASSISTANT_MODEL
  };
};

export const getArticleScoringConfig = (env = process.env) => {
  const provider = env.ARTICLE_SCORING_PROVIDER || DEFAULT_ARTICLE_SCORING_PROVIDER;
  if (!['openai', 'modernbert'].includes(provider)) {
    throw new Error('ARTICLE_SCORING_PROVIDER must be openai or modernbert');
  }

  return {
    provider,
    modelId: provider === 'modernbert'
      ? env.MODERNBERT_MODEL || DEFAULT_MODERNBERT_MODEL
      : env.OPENAI_MODEL_CRAWL || DEFAULT_OPENAI_CRAWL_MODEL,
    dtype: provider === 'modernbert'
      ? env.MODERNBERT_DTYPE || DEFAULT_MODERNBERT_DTYPE
      : undefined
  };
};
