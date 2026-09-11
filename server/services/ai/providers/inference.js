import { requestInferenceJson, requestInferenceStream } from '../../inference/inferenceClient.js';

// This adapter knows only the RSSMonster inference HTTP contract, never model providers.
export const createInferenceProvider = ({ json = requestInferenceJson, stream = requestInferenceStream } = {}) => ({
  embedTexts: (texts, options = {}) => json('/api/embeddings', { texts }, { ...options, circuitKey: 'embeddings' }),
  getEmbeddingInfo: (options = {}) => json('/api/embeddings/info', undefined, {
    ...options, circuitKey: 'embeddings', method: 'GET'
  }),
  classifyArticle: (input, options = {}) => json('/api/classifications/article', input, {
    ...options, circuitKey: 'classification'
  }),
  generateSmartFolderRecommendations: (input, options = {}) => json('/api/smart-folder-recommendations', input, {
    ...options, circuitKey: 'smart-folders'
  }),
  rediscoverFeed: (input, options = {}) => json('/api/feed-rediscovery', input, {
    ...options, circuitKey: 'feed-rediscovery'
  }),
  generateSemanticLabels: (input, options = {}) => json('/api/semantic-labels', input, {
    ...options, circuitKey: 'semantic-labels'
  }),
  assistantChat: (request, options = {}) => json('/api/assistant/model', { request }, {
    ...options, circuitKey: 'assistant'
  }),
  assistantStream: (request, options = {}) => stream('/api/assistant/model/stream', { request }, options),
  getCapabilities: (options = {}) => json('/api/capabilities', undefined, {
    ...options, method: 'GET', circuitKey: 'capabilities'
  }),
  getHealth: (options = {}) => json('/health', undefined, {
    ...options, method: 'GET', circuitKey: 'health', includeHttpStatus: true
  }),
  getReadiness: (options = {}) => json('/ready', undefined, {
    ...options, method: 'GET', circuitKey: 'readiness', includeHttpStatus: true
  })
});

export default createInferenceProvider();
