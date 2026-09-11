const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;
const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';
const DEFAULT_OPENAI_EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_LOCAL_EMBEDDING_MODEL = 'onnx-community/Qwen3-Embedding-0.6B-ONNX';
const DEFAULT_LOCAL_EMBEDDING_DIMENSIONS = 1024;
const DEFAULT_EMBEDDING_MAX_BATCH_SIZE = 8;
const DEFAULT_EMBEDDING_QUEUE_MAX_PENDING = 4;
const DEFAULT_ASSISTANT_MODEL = 'gpt-4o-mini';
const DEFAULT_OPENAI_CRAWL_MODEL = 'gpt-4o-mini';
const DEFAULT_OPENAI_SMART_FOLDER_MODEL = 'gpt-4.1-mini';
const DEFAULT_OPENAI_FEED_REDISCOVERY_MODEL = 'gpt-4.1-mini';
const DEFAULT_MODERNBERT_MODEL = 'onnx-community/ModernBERT-base-nli-ONNX';
const DEFAULT_MODERNBERT_DTYPE = 'q8';
const DEFAULT_MODERNBERT_QUEUE_MAX_PENDING = 4;
const DEFAULT_GENERATION_MODEL = 'onnx-community/Qwen3.5-0.8B-ONNX';
const DEFAULT_GENERATION_DTYPE = 'q4';
const DEFAULT_GENERATION_QUEUE_MAX_PENDING = 4;

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

const getProviderSetting = (capability, env) => env[`${capability}_PROVIDER`] ||
  (capability === 'CLASSIFICATION' ? env.ARTICLE_SCORING_PROVIDER : '') || 'openai';

const getProvider = (capability, env) => {
  const value = getProviderSetting(capability, env);
  const aliases = capability === 'ASSISTANT'
    ? { openai: 'openai-compatible' }
    : { openai: 'openai-compatible', [capability === 'CLASSIFICATION' ? 'modernbert' : 'qwen']: 'local' };
  const provider = aliases[value] || value;
  const supported = capability === 'ASSISTANT' ? ['openai-compatible'] : ['local', 'openai-compatible'];
  if (!supported.includes(provider)) {
    throw new Error(`${capability}_PROVIDER must be ${supported.join(' or ')}`);
  }
  return provider;
};

// Legacy credentials are fallback aliases only; no capability borrows another capability's settings.
export const getCompatibleApiKey = (capability, env = process.env) =>
  env[`${capability}_API_KEY`] || env.OPENAI_API_KEY;

export const getCompatibleClientOptions = (capability, env = process.env) => {
  const apiKey = getCompatibleApiKey(capability, env);
  const baseURL = env[`${capability}_BASE_URL`] || env.OPENAI_BASE_URL;
  const explicitCompatible = getProviderSetting(capability, env) === 'openai-compatible';
  if (!apiKey?.trim()) throw new Error(`${capability}_API_KEY is required (legacy alias: OPENAI_API_KEY)`);
  if (!baseURL?.trim() && explicitCompatible) {
    throw new Error(`${capability}_BASE_URL is required for openai-compatible`);
  }
  if (baseURL) {
    let url;
    try { url = new URL(baseURL); } catch { /* Report only the setting name, never its value. */ }
    if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) {
      throw new Error(`${capability}_BASE_URL must be an HTTP(S) URL without user info or a fragment`);
    }
  }
  return { apiKey, ...(baseURL ? { baseURL } : {}) };
};

export const getOpenAIOmitTemperature = (env = process.env) =>
  String(env.OPENAI_OMIT_TEMPERATURE || '').toLowerCase() === 'true';

export const getEmbeddingConfig = (env = process.env) => {
  const provider = getProvider('EMBEDDING', env);
  const maxBatchSize = Number(env.EMBEDDING_MAX_BATCH_SIZE ?? DEFAULT_EMBEDDING_MAX_BATCH_SIZE);
  const queueMaxPending = Number(
    env.EMBEDDING_QUEUE_MAX_PENDING ?? DEFAULT_EMBEDDING_QUEUE_MAX_PENDING
  );

  if (!Number.isInteger(maxBatchSize) || maxBatchSize < 1) {
    throw new Error('EMBEDDING_MAX_BATCH_SIZE must be a positive integer');
  }
  if (!Number.isSafeInteger(queueMaxPending) || queueMaxPending <= 0) {
    throw new Error('EMBEDDING_QUEUE_MAX_PENDING must be a positive integer');
  }

  if (provider === 'openai-compatible') {
    // Legacy openai ignored local model settings, which may still be present in older .env files.
    const legacy = getProviderSetting('EMBEDDING', env) === 'openai';
    const modelId = (legacy ? env.OPENAI_EMBEDDING_MODEL : env.EMBEDDING_MODEL || env.OPENAI_EMBEDDING_MODEL) ||
      DEFAULT_OPENAI_EMBEDDING_MODEL;
    const dimensions = Number((legacy ? env.OPENAI_EMBEDDING_DIMENSIONS :
      env.EMBEDDING_DIMENSIONS || env.OPENAI_EMBEDDING_DIMENSIONS) || DEFAULT_OPENAI_EMBEDDING_DIMENSIONS);
    if (!Number.isSafeInteger(dimensions) || dimensions <= 0) {
      throw new Error('EMBEDDING_DIMENSIONS must be a positive integer');
    }
    return {
      provider,
      modelId,
      dimensions,
      maxBatchSize,
      queueMaxPending
    };
  }

  const dimensions = Number(env.EMBEDDING_DIMENSIONS || DEFAULT_LOCAL_EMBEDDING_DIMENSIONS);
  if (dimensions !== DEFAULT_LOCAL_EMBEDDING_DIMENSIONS) {
    throw new Error('EMBEDDING_DIMENSIONS must be 1024; dimension reduction is not supported');
  }

  return {
    provider,
    modelId: env.EMBEDDING_MODEL || DEFAULT_LOCAL_EMBEDDING_MODEL,
    dimensions,
    maxBatchSize,
    queueMaxPending
  };
};

export const getGenerationConfig = (env = process.env) => {
  const provider = getProvider('GENERATION', env);
  const model = getProviderSetting('GENERATION', env) === 'openai' ? undefined : env.GENERATION_MODEL;
  const remoteDefault = env.GENERATION_PROVIDER === 'openai-compatible'
    ? env.OPENAI_MODEL_CRAWL || DEFAULT_OPENAI_CRAWL_MODEL : undefined;
  const queueMaxPending = Number(
    env.GENERATION_QUEUE_MAX_PENDING ?? DEFAULT_GENERATION_QUEUE_MAX_PENDING
  );
  if (!Number.isSafeInteger(queueMaxPending) || queueMaxPending <= 0) {
    throw new Error('GENERATION_QUEUE_MAX_PENDING must be a positive integer');
  }

  return {
    provider,
    queueMaxPending,
    modelId: provider === 'local'
      ? env.GENERATION_MODEL || DEFAULT_GENERATION_MODEL
      : model || env.OPENAI_MODEL_CRAWL || DEFAULT_OPENAI_CRAWL_MODEL,
    dtype: provider === 'local'
      ? env.GENERATION_DTYPE || DEFAULT_GENERATION_DTYPE
      : undefined,
    articleModel: env.GENERATION_ARTICLE_MODEL || model ||
      env.OPENAI_MODEL_CRAWL || DEFAULT_OPENAI_CRAWL_MODEL,
    smartFolderModel: env.GENERATION_SMART_FOLDER_MODEL || model ||
      env.OPENAI_MODEL_SMART_FOLDERS || remoteDefault || DEFAULT_OPENAI_SMART_FOLDER_MODEL,
    feedRediscoveryModel: env.GENERATION_FEED_REDISCOVERY_MODEL || model || env.OPENAI_MODEL_FEED_REDISCOVERY ||
      remoteDefault || DEFAULT_OPENAI_FEED_REDISCOVERY_MODEL
  };
};

export const getAssistantConfig = (env = process.env) => {
  const provider = getProvider('ASSISTANT', env);
  return {
    provider,
    modelId: env.ASSISTANT_MODEL || DEFAULT_ASSISTANT_MODEL
  };
};

export const getArticleScoringConfig = (env = process.env) => {
  const provider = getProvider('CLASSIFICATION', env);
  const queueMaxPending = Number(
    env.MODERNBERT_QUEUE_MAX_PENDING ?? DEFAULT_MODERNBERT_QUEUE_MAX_PENDING
  );
  if (!Number.isSafeInteger(queueMaxPending) || queueMaxPending <= 0) {
    throw new Error('MODERNBERT_QUEUE_MAX_PENDING must be a positive integer');
  }

  return {
    provider,
    queueMaxPending,
    modelId: provider === 'local'
      ? env.CLASSIFICATION_MODEL || env.MODERNBERT_MODEL || DEFAULT_MODERNBERT_MODEL
      : env.CLASSIFICATION_MODEL || env.OPENAI_MODEL_CRAWL || DEFAULT_OPENAI_CRAWL_MODEL,
    dtype: provider === 'local'
      ? env.MODERNBERT_DTYPE || DEFAULT_MODERNBERT_DTYPE
      : undefined
  };
};

// Shared by startup validation and the descriptive runtime snapshot.
export const validateModelIdentifiers = (capability, config) => {
  const models = [config.modelId, config.articleModel, config.smartFolderModel, config.feedRediscoveryModel];
  for (const model of models.filter(value => value !== undefined)) {
    if (typeof model !== 'string' || !model || /[\u0000-\u0020\u007f?#]/.test(model) || model.includes('://')) {
      throw new Error(`${capability}_MODEL and workload overrides must be model identifiers, not URLs or free text`);
    }
  }
};

export const validateProviderConfiguration = (env = process.env, logger = console) => {
  const configs = {
    EMBEDDING: getEmbeddingConfig(env),
    GENERATION: getGenerationConfig(env),
    CLASSIFICATION: getArticleScoringConfig(env),
    ASSISTANT: getAssistantConfig(env)
  };
  for (const [capability, config] of Object.entries(configs)) {
    // The assistant has always been optional for local deployments. Explicit configuration is required.
    const optionalAssistant = capability === 'ASSISTANT' && !env.ASSISTANT_PROVIDER &&
      !env.ASSISTANT_BASE_URL && !env.ASSISTANT_MODEL && !getCompatibleApiKey(capability, env);
    if (config.provider === 'openai-compatible' && !optionalAssistant) {
      getCompatibleClientOptions(capability, env);
    }
    validateModelIdentifiers(capability, config);
  }
  const legacyKeys = ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_EMBEDDING_MODEL',
    'OPENAI_EMBEDDING_DIMENSIONS', 'OPENAI_MODEL_CRAWL', 'OPENAI_MODEL_SMART_FOLDERS',
    'OPENAI_MODEL_FEED_REDISCOVERY', 'ARTICLE_SCORING_PROVIDER', 'MODERNBERT_MODEL'];
  const deprecated = legacyKeys.filter(key => env[key]);
  for (const capability of Object.keys(configs)) {
    if (['openai', 'qwen', 'modernbert'].includes(env[`${capability}_PROVIDER`])) {
      deprecated.push(`${capability}_PROVIDER`);
    }
  }
  if (deprecated.length) {
    logger.warn?.(`[INFERENCE] Deprecated configuration: ${deprecated.join(', ')}. ` +
      'Migrate to capability PROVIDER=local|openai-compatible and capability BASE_URL/API_KEY/MODEL settings; ' +
      'aliases are retained for one release.');
  }
  for (const [capability, config] of Object.entries(configs)) {
    const optionalAssistant = capability === 'ASSISTANT' && !getCompatibleApiKey(capability, env);
    logger.log(`[INFERENCE] ${capability} provider=${config.provider} model=${config.modelId}${optionalAssistant ? ' unavailable (not configured)' : ''}`);
  }
  return configs;
};
