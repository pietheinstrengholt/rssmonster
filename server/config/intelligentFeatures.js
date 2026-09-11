// Explicit deployment switches remain permission overrides; connection availability is resolved separately.
const isTrue = value => String(value || '').trim().toLowerCase() === 'true';

export class InferenceDisabledError extends Error {
  constructor() {
    super('Inference features are disabled');
    this.name = 'InferenceDisabledError';
    this.code = 'INFERENCE_DISABLED';
  }
}

// Returns whether this server process may contact the inference service.
export const isInferenceEnabled = (environment = process.env) =>
  environment.INFERENCE_AI_ENABLED === undefined || environment.INFERENCE_AI_ENABLED === '' || isTrue(environment.INFERENCE_AI_ENABLED);

// Reports server permission; only inference discovery establishes assistant availability.
export const isAssistantEnabled = (environment = process.env) =>
  isInferenceEnabled(environment) && (environment.INFERENCE_ASSISTANT_ENABLED === undefined ||
    environment.INFERENCE_ASSISTANT_ENABLED === '' || isTrue(environment.INFERENCE_ASSISTANT_ENABLED));

// Rejects inference calls when the server-wide capability switch is disabled.
export const assertInferenceEnabled = (environment = process.env) => {
  if (!isInferenceEnabled(environment)) throw new InferenceDisabledError();
};

// Returns whether article classification should use local defaults instead of inference.
export const shouldSkipArticleClassification = (environment = process.env) =>
  !isInferenceEnabled(environment) ||
  isTrue(environment.SKIP_ARTICLE_CLASSIFICATION_ANALYSIS);

// Returns whether article vector generation is disabled for this server process.
export const shouldSkipArticleEmbeddings = (environment = process.env) =>
  !isInferenceEnabled(environment) || isTrue(environment.SKIP_ARTICLE_EMBEDDINGS);

// Returns whether event, topic, and island display-label generation is disabled.
export const shouldSkipSemanticLabeling = (environment = process.env) =>
  !isInferenceEnabled(environment) || isTrue(environment.SKIP_SEMANTIC_LABELING);

// Resolves processing defaults for feeds created by this server process.
export const getDefaultFeedIntelligentFeatures = (environment = process.env) => ({
  applyAiAnalysis: !shouldSkipArticleClassification(environment),
  generateEmbeddings: !shouldSkipArticleEmbeddings(environment)
});

export default {
  assertInferenceEnabled,
  getDefaultFeedIntelligentFeatures,
  isAssistantEnabled,
  isInferenceEnabled,
  shouldSkipArticleClassification,
  shouldSkipArticleEmbeddings,
  shouldSkipSemanticLabeling
};
