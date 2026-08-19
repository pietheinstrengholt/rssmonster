import OpenAI from 'openai';
import { getEmbeddingConfig } from '../../config/config.js';

const defaultDependencies = {
  createClient: apiKey => new OpenAI({ apiKey }),
  logger: console
};

export const createOpenAIEmbeddingProvider = ({
  environment = process.env,
  dependencies = defaultDependencies
} = {}) => {
  const config = getEmbeddingConfig({ ...environment, EMBEDDING_PROVIDER: 'openai' });
  const metadata = Object.freeze({
    provider: 'openai',
    modelId: config.modelId,
    dimensions: config.dimensions
  });
  let client;

  const initialize = async () => {
    if (client) return;
    if (!environment.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required');
    client = dependencies.createClient(environment.OPENAI_API_KEY);
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

export default createOpenAIEmbeddingProvider();
