import { describe, expect, it, vi } from 'vitest';
import {
  getEmbeddingConfig, getGenerationConfig, getArticleScoringConfig, getAssistantConfig,
  getCompatibleClientOptions, validateProviderConfiguration
} from '../src/config/config.js';

const local = {
  EMBEDDING_PROVIDER: 'local', GENERATION_PROVIDER: 'local', CLASSIFICATION_PROVIDER: 'local'
};
const logger = () => ({ log: vi.fn(), warn: vi.fn() });
const remote = capability => ({
  [`${capability}_PROVIDER`]: 'openai-compatible',
  [`${capability}_BASE_URL`]: `http://${capability.toLowerCase()}.example/v1`,
  [`${capability}_API_KEY`]: `${capability}-secret`,
  [`${capability}_MODEL`]: `${capability}-model`
});

describe('capability configuration', () => {
  it('keeps fully local deployment usable with no assistant credentials', () => {
    const configs = validateProviderConfiguration(local, logger());
    expect(configs.EMBEDDING).toMatchObject({ provider: 'local', dimensions: 1024 });
    expect(configs.GENERATION).toMatchObject({ provider: 'local', dtype: 'q4', queueMaxPending: 4 });
    expect(configs.CLASSIFICATION).toMatchObject({ provider: 'local', dtype: 'q8', queueMaxPending: 4 });
  });

  it.each([
    ['EMBEDDING', getEmbeddingConfig], ['GENERATION', getGenerationConfig],
    ['CLASSIFICATION', getArticleScoringConfig], ['ASSISTANT', getAssistantConfig]
  ])('configures independent remote %s models and credentials', (capability, getConfig) => {
    const environment = { ...local, ...remote(capability) };
    expect(getConfig(environment)).toMatchObject({ provider: 'openai-compatible', modelId: `${capability}-model` });
    expect(getCompatibleClientOptions(capability, environment)).toEqual({
      apiKey: `${capability}-secret`, baseURL: `http://${capability.toLowerCase()}.example/v1`
    });
    expect(() => validateProviderConfiguration(environment, logger())).not.toThrow();
  });

  it.each(['EMBEDDING', 'GENERATION', 'CLASSIFICATION', 'ASSISTANT'])(
    'rejects missing endpoint or key for explicit remote %s at startup', capability => {
      const environment = { ...local, ...remote(capability) };
      delete environment[`${capability}_BASE_URL`];
      expect(() => validateProviderConfiguration(environment, logger())).toThrow(`${capability}_BASE_URL is required`);
      Object.assign(environment, remote(capability));
      delete environment[`${capability}_API_KEY`];
      expect(() => validateProviderConfiguration(environment, logger())).toThrow(`${capability}_API_KEY is required`);
    }
  );

  it.each(['EMBEDDING', 'GENERATION', 'CLASSIFICATION', 'ASSISTANT'])(
    'rejects unsupported %s providers without echoing input', capability => {
      expect(() => validateProviderConfiguration({ ...local, [`${capability}_PROVIDER`]: 'secret-invalid' }, logger()))
        .toThrow(`${capability}_PROVIDER must be`);
      try { validateProviderConfiguration({ ...local, [`${capability}_PROVIDER`]: 'secret-invalid' }, logger()); } catch (error) { expect(error.message).not.toContain('secret-invalid'); }
    }
  );

  it.each(['0', '-1', '1.5', 'NaN', 'Infinity', '9007199254740992'])(
    'rejects invalid external dimensions %s', dimensions => {
      expect(() => getEmbeddingConfig({ ...remote('EMBEDDING'), EMBEDDING_DIMENSIONS: dimensions }))
        .toThrow('EMBEDDING_DIMENSIONS must be a positive integer');
    }
  );

  it('checks local dimensions and uses capability model settings', () => {
    expect(() => getEmbeddingConfig({ ...local, EMBEDDING_DIMENSIONS: '1536' })).toThrow('must be 1024');
    expect(getEmbeddingConfig({ ...local, EMBEDDING_MODEL: 'custom/embedding' }).modelId).toBe('custom/embedding');
    expect(getGenerationConfig({ ...local, GENERATION_MODEL: 'custom/generation' }).modelId).toBe('custom/generation');
    expect(getArticleScoringConfig({ ...local, CLASSIFICATION_MODEL: 'custom/classifier', MODERNBERT_MODEL: 'legacy/model' }).modelId)
      .toBe('custom/classifier');
  });

  it('uses the generation model across workloads and accepts explicit overrides', () => {
    const environment = { ...remote('GENERATION'), OPENAI_MODEL_CRAWL: 'old-article', OPENAI_MODEL_SMART_FOLDERS: 'old-folders' };
    expect(getGenerationConfig(environment)).toMatchObject({
      modelId: 'GENERATION-model', articleModel: 'GENERATION-model',
      smartFolderModel: 'GENERATION-model', feedRediscoveryModel: 'GENERATION-model'
    });
    expect(getGenerationConfig({ ...environment, GENERATION_SMART_FOLDER_MODEL: 'folder-override' }).smartFolderModel)
      .toBe('folder-override');
    expect(getGenerationConfig({ GENERATION_PROVIDER: 'openai-compatible' })).toMatchObject({
      articleModel: 'gpt-4o-mini', smartFolderModel: 'gpt-4o-mini', feedRediscoveryModel: 'gpt-4o-mini'
    });
  });

  it('preserves legacy remote models despite stale local model and dimension settings', () => {
    const environment = {
      EMBEDDING_PROVIDER: 'openai', EMBEDDING_MODEL: 'local/model', EMBEDDING_DIMENSIONS: '1024',
      OPENAI_EMBEDDING_MODEL: 'old-embedding', OPENAI_EMBEDDING_DIMENSIONS: '1536',
      GENERATION_PROVIDER: 'openai', GENERATION_MODEL: 'local/generation',
      OPENAI_MODEL_CRAWL: 'old-article', OPENAI_MODEL_SMART_FOLDERS: 'old-folders',
      OPENAI_MODEL_FEED_REDISCOVERY: 'old-feed', OPENAI_API_KEY: 'legacy-secret'
    };
    expect(getEmbeddingConfig(environment)).toMatchObject({ modelId: 'old-embedding', dimensions: 1536 });
    expect(getGenerationConfig(environment)).toMatchObject({ modelId: 'old-article', smartFolderModel: 'old-folders', feedRediscoveryModel: 'old-feed' });
    const output = logger();
    validateProviderConfiguration(environment, output);
    expect(output.warn).toHaveBeenCalledWith(expect.stringContaining('Deprecated configuration'));
    expect(JSON.stringify(output.warn.mock.calls)).not.toContain('legacy-secret');
  });

  it('uses capability credentials ahead of legacy aliases without leaking settings', () => {
    const environment = { ...local, ...remote('ASSISTANT'), OPENAI_API_KEY: 'legacy-secret', OPENAI_BASE_URL: 'http://legacy/v1?token=private' };
    expect(getCompatibleClientOptions('ASSISTANT', environment)).toEqual({ apiKey: 'ASSISTANT-secret', baseURL: 'http://assistant.example/v1' });
    const output = logger();
    validateProviderConfiguration(environment, output);
    expect(JSON.stringify([...output.log.mock.calls, ...output.warn.mock.calls])).not.toMatch(/secret|private|http:/);
  });

  it.each(['not a url?token=secret', 'ftp://host/secret', 'https://user:secret@host/v1', 'https://host/v1#secret'])(
    'rejects malformed endpoints without disclosing their values', baseURL => {
      const environment = { ...local, ...remote('ASSISTANT'), ASSISTANT_BASE_URL: baseURL };
      expect(() => validateProviderConfiguration(environment, logger())).toThrow('ASSISTANT_BASE_URL must be an HTTP(S) URL');
      try { validateProviderConfiguration(environment, logger()); } catch (error) { expect(error.message).not.toContain('secret'); }
    }
  );

  it('rejects model URLs and log injection before logging any models', () => {
    const output = logger();
    expect(() => validateProviderConfiguration({ ...local, GENERATION_MODEL: 'https://host/model?token=secret' }, output))
      .toThrow('GENERATION_MODEL and workload overrides must be model identifiers');
    expect(output.log).not.toHaveBeenCalled();
  });

  it('treats blank Compose forwarding as unset and chooses defaults by provider', () => {
    const blanks = { EMBEDDING_MODEL: '', EMBEDDING_DIMENSIONS: '', OPENAI_EMBEDDING_DIMENSIONS: '' };
    expect(getEmbeddingConfig({ ...local, ...blanks }).dimensions).toBe(1024);
    expect(getEmbeddingConfig({ ...remote('EMBEDDING'), ...blanks }).dimensions).toBe(1536);
    expect(getEmbeddingConfig({ EMBEDDING_PROVIDER: 'openai', ...blanks }).dimensions).toBe(1536);
    expect(getCompatibleClientOptions('ASSISTANT', {
      ASSISTANT_API_KEY: '', ASSISTANT_BASE_URL: '', OPENAI_API_KEY: 'legacy', OPENAI_BASE_URL: 'http://legacy/v1'
    })).toEqual({ apiKey: 'legacy', baseURL: 'http://legacy/v1' });
  });


  it('preserves implicit legacy provider model selection', () => {
    expect(getEmbeddingConfig({ EMBEDDING_MODEL: 'stale/local', EMBEDDING_DIMENSIONS: '1024' }))
      .toMatchObject({ modelId: 'text-embedding-3-small', dimensions: 1536 });
    expect(getGenerationConfig({ GENERATION_MODEL: 'stale/local' }))
      .toMatchObject({ modelId: 'gpt-4o-mini', smartFolderModel: 'gpt-4.1-mini' });
  });

});
