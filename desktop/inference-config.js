import path from 'node:path';

export const localInferenceEnvironment = (userData, environment = process.env) => ({
  ...environment,
  INFERENCE_HOST: '127.0.0.1',
  INFERENCE_PORT: '3001',
  INFERENCE_MODEL_CACHE_DIR: path.join(userData, 'models'),
  EMBEDDING_PROVIDER: 'local',
  EMBEDDING_MODEL: 'onnx-community/Qwen3-Embedding-0.6B-ONNX',
  EMBEDDING_DIMENSIONS: '1024',
  CLASSIFICATION_PROVIDER: 'local',
  CLASSIFICATION_MODEL: 'onnx-community/ModernBERT-base-nli-ONNX',
  MODERNBERT_DTYPE: 'q8',
  GENERATION_PROVIDER: 'local',
  GENERATION_MODEL: 'onnx-community/Qwen3.5-0.8B-ONNX',
  GENERATION_DTYPE: 'q4',
  // An unconfigured assistant has no advertised capability and requires no API key.
  ASSISTANT_PROVIDER: '', ASSISTANT_BASE_URL: '', ASSISTANT_MODEL: '', ASSISTANT_API_KEY: '',
  OPENAI_API_KEY: '', OPENAI_BASE_URL: '',
  INFERENCE_AI_ENABLED: 'true', INFERENCE_ASSISTANT_ENABLED: 'false'
});
