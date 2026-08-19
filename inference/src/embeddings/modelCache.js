// Shared model lifecycle and caching will live here when models are added.
import { env as transformersEnv } from '@huggingface/transformers';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const inferenceDirectory = fileURLToPath(new URL('../../', import.meta.url));
const DEFAULT_MODEL_CACHE_DIR = '.cache/models';

export const getModelCacheDirectory = (environment = process.env) => {
  const configuredDirectory = environment.INFERENCE_MODEL_CACHE_DIR || DEFAULT_MODEL_CACHE_DIR;
  return path.resolve(inferenceDirectory, configuredDirectory);
};

export const configureModelCache = async (environment = process.env) => {
  const cacheDirectory = getModelCacheDirectory(environment);

  await mkdir(cacheDirectory, { recursive: true });
  transformersEnv.cacheDir = cacheDirectory;

  return cacheDirectory;
};
