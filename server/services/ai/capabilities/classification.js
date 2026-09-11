import provider from '../providers/inference.js';
import { AIValidationError, isRecord } from '../errors.js';

export const isClassificationScore = value => typeof value === 'number' &&
  Number.isFinite(value) && value >= 0 && value <= 100;

export const validateArticleClassification = result => {
  if (!isRecord(result) ||
    !Array.isArray(result.contentSummaryBullets) || !result.contentSummaryBullets.every(value => typeof value === 'string') ||
    !Array.isArray(result.tags) || !result.tags.every(value => typeof value === 'string') ||
    !['advertisementScore', 'sentimentScore', 'qualityScore'].every(field => isClassificationScore(result[field]))) {
    throw new AIValidationError('Classification', true);
  }
  return result;
};

// The inference API returns summaries/tags and scores together; keep those fields distinct.
export const createClassificationCapability = (inference = provider) => ({
  async classifyArticle(input, options = {}) {
    if (!isRecord(input) || typeof input.text !== 'string') throw new AIValidationError('Classification');
    return validateArticleClassification(await inference.classifyArticle(input, options));
  }
});

const classification = createClassificationCapability();
export const { classifyArticle } = classification;
export default classification;
