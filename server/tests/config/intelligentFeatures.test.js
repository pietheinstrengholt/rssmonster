import { describe, expect, it } from 'vitest';
import {
  InferenceDisabledError,
  assertInferenceEnabled,
  getDefaultFeedIntelligentFeatures,
  isAssistantEnabled,
  isInferenceEnabled,
  shouldSkipArticleClassification,
  shouldSkipArticleEmbeddings,
  shouldSkipSemanticLabeling
} from '../../config/intelligentFeatures.js';

describe('intelligent feature configuration', () => {
  it('permits configured connections by default while preserving an explicit kill switch', () => {
    expect(isInferenceEnabled({})).toBe(true);
    expect(isAssistantEnabled({})).toBe(true);
    expect(() => assertInferenceEnabled({ INFERENCE_AI_ENABLED: 'false' })).toThrow(InferenceDisabledError);
  });

  it('preserves intelligent feed defaults when inference is enabled', () => {
    expect(getDefaultFeedIntelligentFeatures({ INFERENCE_AI_ENABLED: 'true' })).toEqual({
      applyAiAnalysis: true,
      generateEmbeddings: true
    });
  });

  it('preserves explicit assistant and inference permission overrides', () => {
    expect(isAssistantEnabled({ INFERENCE_AI_ENABLED: 'true', INFERENCE_ASSISTANT_ENABLED: 'false' })).toBe(false);
    expect(isAssistantEnabled({
      INFERENCE_AI_ENABLED: 'true',
      INFERENCE_ASSISTANT_ENABLED: 'true'
    })).toBe(true);
    expect(isAssistantEnabled({
      INFERENCE_AI_ENABLED: 'false',
      INFERENCE_ASSISTANT_ENABLED: 'true'
    })).toBe(false);
  });

  it('disables both feed processing defaults through explicit skip flags', () => {
    const environment = {
      INFERENCE_AI_ENABLED: 'true',
      SKIP_ARTICLE_CLASSIFICATION_ANALYSIS: 'true',
      SKIP_ARTICLE_EMBEDDINGS: 'TRUE'
    };

    expect(shouldSkipArticleClassification(environment)).toBe(true);
    expect(shouldSkipArticleEmbeddings(environment)).toBe(true);
    expect(getDefaultFeedIntelligentFeatures(environment)).toEqual({
      applyAiAnalysis: false,
      generateEmbeddings: false
    });
  });

  it('skips semantic labeling independently from other inference features', () => {
    const environment = {
      INFERENCE_AI_ENABLED: 'true',
      SKIP_SEMANTIC_LABELING: 'TRUE'
    };

    expect(shouldSkipSemanticLabeling(environment)).toBe(true);
    expect(shouldSkipArticleClassification(environment)).toBe(false);
    expect(shouldSkipArticleEmbeddings(environment)).toBe(false);
    expect(shouldSkipSemanticLabeling({
      INFERENCE_AI_ENABLED: 'true',
      SKIP_SEMANTIC_LABELING: 'false'
    })).toBe(false);
  });

  it('lets the master switch override feature-specific settings', () => {
    const environment = {
      INFERENCE_AI_ENABLED: 'false',
      SKIP_ARTICLE_CLASSIFICATION_ANALYSIS: 'false',
      SKIP_ARTICLE_EMBEDDINGS: 'false'
    };

    expect(getDefaultFeedIntelligentFeatures(environment)).toEqual({
      applyAiAnalysis: false,
      generateEmbeddings: false
    });
  });
});
