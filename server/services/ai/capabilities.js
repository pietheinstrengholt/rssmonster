import {
  isInferenceEnabled, isAssistantEnabled, shouldSkipArticleClassification,
  shouldSkipArticleEmbeddings, shouldSkipSemanticLabeling
} from '../../config/intelligentFeatures.js';
import provider from './providers/inference.js';
import { isRecord } from './errors.js';

const names = ['embeddings', 'generation', 'classification', 'assistant'];
const states = ['starting', 'ready', 'failed', 'shutting_down'];
const validModel = value => typeof value === 'string' && value.length > 0 &&
  !/[\u0000-\u0020\u007f?#]/.test(value) && !value.includes('://');

export class InferenceContractError extends Error {
  constructor(unsupported = false) {
    super(unsupported ? 'Inference API contract version is unsupported' : 'Inference capability contract is malformed');
    this.name = 'InferenceContractError';
    this.code = unsupported ? 'INFERENCE_CONTRACT_VERSION_UNSUPPORTED' : 'INFERENCE_CONTRACT_INVALID';
  }
}

export const validateInferenceCapabilities = response => {
  const invalid = () => { throw new InferenceContractError(); };
  if (!isRecord(response) || typeof response.apiVersion !== 'string') invalid();
  if (response.apiVersion !== '1') throw new InferenceContractError(true);
  if (response.service !== 'rssmonster-inference' || typeof response.version !== 'string' ||
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(response.version) ||
      !states.includes(response.status) || !isRecord(response.capabilities)) invalid();
  const capabilities = Object.fromEntries(names.map(name => {
    const item = response.capabilities[name];
    if (!isRecord(item) || typeof item.configured !== 'boolean' || typeof item.available !== 'boolean') invalid();
    if (item.configured) {
      if (!['local', 'openai-compatible'].includes(item.provider) || !validModel(item.model)) invalid();
    } else if (item.available || item.provider !== null || item.model !== null) invalid();
    if (item.available && response.status !== 'ready') invalid();
    if (name === 'embeddings' && (item.configured
      ? !Number.isSafeInteger(item.dimensions) || item.dimensions <= 0 : item.dimensions !== null)) invalid();
    return [name, {
      configured: item.configured, available: item.available, provider: item.provider, model: item.model,
      ...(name === 'embeddings' ? { dimensions: item.dimensions } : {})
    }];
  }));
  return { service: response.service, apiVersion: response.apiVersion, version: response.version, status: response.status, capabilities };
};

export const createInferenceCapabilities = (inference = provider) => async (options = {}) =>
  validateInferenceCapabilities(await inference.getCapabilities(options));

export const getInferenceCapabilities = createInferenceCapabilities();

// Configuration describes permission to use capabilities, not remote model health.
export const getAIPermissions = (environment = process.env) => ({
  embeddings: isInferenceEnabled(environment),
  generation: isInferenceEnabled(environment),
  classification: !shouldSkipArticleClassification(environment),
  assistant: isAssistantEnabled(environment)
});

// Article skip flags do not disable administrative/taxonomy embeddings or other generation workloads.
export const getAIOperations = (environment = process.env) => ({
  articleEmbeddings: !shouldSkipArticleEmbeddings(environment),
  articleClassification: !shouldSkipArticleClassification(environment),
  semanticLabels: !shouldSkipSemanticLabeling(environment)
});
