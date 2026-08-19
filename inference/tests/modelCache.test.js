import { afterEach, describe, expect, it } from 'vitest';
import { env as transformersEnv } from '@huggingface/transformers';
import { access, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  configureModelCache,
  getModelCacheDirectory
} from '../src/embeddings/modelCache.js';

const inferenceDirectory = fileURLToPath(new URL('../', import.meta.url));
const originalCacheDirectory = transformersEnv.cacheDir;
const temporaryDirectories = [];

afterEach(async () => {
  transformersEnv.cacheDir = originalCacheDirectory;
  await Promise.all(temporaryDirectories.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true })
  ));
});

describe('model cache', () => {
  it('defaults to the inference project cache', () => {
    expect(getModelCacheDirectory({}))
      .toBe(path.join(inferenceDirectory, '.cache/models'));
  });

  it('resolves configured relative paths from the inference project', () => {
    expect(getModelCacheDirectory({ INFERENCE_MODEL_CACHE_DIR: 'runtime/models' }))
      .toBe(path.join(inferenceDirectory, 'runtime/models'));
  });

  it('preserves configured absolute paths', () => {
    expect(getModelCacheDirectory({ INFERENCE_MODEL_CACHE_DIR: '/var/cache/rssmonster-models' }))
      .toBe('/var/cache/rssmonster-models');
  });

  it('creates and configures the cache without loading a model', async () => {
    const parentDirectory = await mkdtemp(path.join(os.tmpdir(), 'rssmonster-inference-'));
    const cacheDirectory = path.join(parentDirectory, 'models');
    temporaryDirectories.push(parentDirectory);

    await expect(configureModelCache({ INFERENCE_MODEL_CACHE_DIR: cacheDirectory }))
      .resolves.toBe(cacheDirectory);
    await expect(access(cacheDirectory)).resolves.toBeUndefined();
    expect(transformersEnv.cacheDir).toBe(cacheDirectory);
  });
});
