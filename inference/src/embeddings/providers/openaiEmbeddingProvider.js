import { createCompatibleClient } from '../../providers/openaiCompatible.js';
import { getEmbeddingConfig, getCompatibleApiKey } from '../../config/config.js';

const defaultDependencies = {
  createClient: (_apiKey, environment) => createCompatibleClient('EMBEDDING', environment),
  logger: console
};

export const createOpenAIEmbeddingProvider = ({
  environment = process.env,
  dependencies = defaultDependencies
} = {}) => {
  const config = getEmbeddingConfig({ ...environment, EMBEDDING_PROVIDER: environment.EMBEDDING_PROVIDER || 'openai' });
  const metadata = Object.freeze({
    provider: 'openai',
    modelId: config.modelId,
    dimensions: config.dimensions
  });
  let client;

  const initialize = async () => {
    if (client) return;
    const apiKey = getCompatibleApiKey('EMBEDDING', environment);
    if (!apiKey) throw new Error('EMBEDDING_API_KEY is required (legacy alias: OPENAI_API_KEY)');
    client = dependencies.createClient(apiKey, environment);
    dependencies.logger.log(`[INFERENCE] Initialized OpenAI embedding provider ${config.modelId}`);
  };

  const embed = async texts => {
    await initialize();
    const response = await client.embeddings.create({
      model: config.modelId,
      input: texts
    });
    return response.data.map(item => item.embedding);
  };

  return Object.freeze({
    initialize,
    embed,
    getMetadata: () => metadata,
    isLoaded: () => Boolean(client)
  });
};
