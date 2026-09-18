import { getInferenceEnvironment } from '../inference/runtimeConfiguration.js';
import provider from './providers/inference.js';
import { createEmbeddingCapability } from './capabilities/embedding.js';
import { createGenerationCapability } from './capabilities/generation.js';
import { createClassificationCapability } from './capabilities/classification.js';
import { createAssistantCapability } from './capabilities/assistant.js';
import { getAIPermissions, getAIOperations, createInferenceCapabilities } from './capabilities.js';
import { createAIHealth } from './health.js';

// One provider, explicit dependencies, and no runtime plugin registration.
export const createAI = ({ inference = provider, environment = process.env } = {}) => Object.freeze({
  embedding: createEmbeddingCapability(inference),
  generation: createGenerationCapability(inference),
  classification: createClassificationCapability(inference),
  assistant: createAssistantCapability(inference),
  getCapabilities: createInferenceCapabilities(inference),
  getPermissions: async () => getAIPermissions(await getInferenceEnvironment(environment)),
  getOperations: async () => getAIOperations(await getInferenceEnvironment(environment)),
  getHealth: createAIHealth(inference, environment)
});

export default createAI();
