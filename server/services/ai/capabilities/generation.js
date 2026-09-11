import provider from '../providers/inference.js';
import { AIValidationError, isRecord } from '../errors.js';

const labelTypes = ['event', 'topic', 'island'];

// These workloads have distinct domain contracts; there is no generic prompt endpoint.
export const createGenerationCapability = (inference = provider) => ({
  async generateSmartFolderRecommendations(input, options = {}) {
    if (!isRecord(input) || !isRecord(input.insights)) throw new AIValidationError('Smart Folder recommendations');
    const result = await inference.generateSmartFolderRecommendations(input, options);
    if (!isRecord(result) || !Array.isArray(result.smartFolders) || result.smartFolders.some(folder =>
      !isRecord(folder) || !['name', 'query', 'reason'].every(field => typeof folder[field] === 'string'))) {
      throw new AIValidationError('Smart Folder recommendations', true);
    }
    return result;
  },
  async rediscoverFeed(input, options = {}) {
    if (!isRecord(input) || !['feedName', 'websiteUrl', 'oldRssUrl'].every(field => typeof input[field] === 'string')) {
      throw new AIValidationError('Feed rediscovery');
    }
    const result = await inference.rediscoverFeed(input, options);
    // A result with url:null is a valid no-match response.
    if (!isRecord(result) || (result.url !== null && typeof result.url !== 'string') ||
      (result.confidence !== undefined && typeof result.confidence !== 'string' && !Number.isFinite(result.confidence)) ||
      (result.reason !== undefined && typeof result.reason !== 'string')) {
      throw new AIValidationError('Feed rediscovery', true);
    }
    return result;
  },
  async generateSemanticLabels(input, options = {}) {
    if (!isRecord(input) || labelTypes.some(type => input[type] !== undefined && typeof input[type] !== 'boolean')) {
      throw new AIValidationError('Semantic labels');
    }
    const requested = labelTypes.filter(type => input[type] === true);
    let context;
    try {
      context = typeof input.context === 'string' ? input.context.trim()
        : input.context && typeof input.context === 'object' ? JSON.stringify(input.context) : '';
    } catch { throw new AIValidationError('Semantic labels'); }
    if (!requested.length || !context || context.length > 6000) throw new AIValidationError('Semantic labels');
    const result = await inference.generateSemanticLabels(input, options);
    if (!isRecord(result) || requested.some(type => result[type] !== null && typeof result[type] !== 'string')) {
      throw new AIValidationError('Semantic labels', true);
    }
    return result;
  }
});

const generation = createGenerationCapability();
export const { generateSmartFolderRecommendations, rediscoverFeed, generateSemanticLabels } = generation;
export default generation;
