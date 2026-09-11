import packageInfo from '../package.json' with { type: 'json' };
import {
  getEmbeddingConfig, getGenerationConfig, getArticleScoringConfig, getAssistantConfig,
  getCompatibleApiKey, getCompatibleClientOptions, validateModelIdentifiers
} from './config/config.js';
import generationProvider from './generation/providers/qwenGenerationProvider.js';
import classificationProvider from './classifications/providers/modernBertArticleScoringProvider.js';

// Capture settings once, alongside service construction. Discovery never creates clients or loads models.
export const createCapabilities = ({ environment, readiness, embeddingService,
  localGeneration = generationProvider, localClassification = classificationProvider }) => {
  let invalid = false;
  const definitions = [
    ['embeddings', 'EMBEDDING', getEmbeddingConfig, () => embeddingService.getInfo().loaded],
    ['generation', 'GENERATION', getGenerationConfig, () => localGeneration.isLoaded()],
    ['classification', 'CLASSIFICATION', getArticleScoringConfig, () => localClassification.isLoaded()],
    ['assistant', 'ASSISTANT', getAssistantConfig, () => false]
  ];
  const snapshots = definitions.map(([name, capability, getConfig, isLoaded]) => {
    let config = null;
    try {
      const candidate = getConfig(environment);
      validateModelIdentifiers(capability, candidate);
      if (candidate.provider === 'local' || getCompatibleApiKey(capability, environment)?.trim()) {
        if (candidate.provider === 'openai-compatible') getCompatibleClientOptions(capability, environment);
        config = candidate;
      }
    } catch {
      invalid = true;
    }
    return { name, config, isLoaded };
  });
  return () => {
    // Never reflect invalid settings or provider exceptions in a response or log.
    if (invalid) throw new Error('Inference capability metadata is invalid');
    const status = readiness.getState();
    const capabilities = Object.fromEntries(snapshots.map(({ name, config, isLoaded }) => [name, {
      configured: Boolean(config),
      available: Boolean(config && status === 'ready' && (config.provider !== 'local' || isLoaded() === true)),
      provider: config?.provider ?? null,
      model: config?.modelId ?? null,
      ...(name === 'embeddings' ? { dimensions: config?.dimensions ?? null } : {})
    }]));
    return { service: 'rssmonster-inference', apiVersion: '1', version: packageInfo.version, status, capabilities };
  };
};
