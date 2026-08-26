import { requestInferenceJson } from '../inference/inferenceClient.js';

// Requests personalized Smart Folder recommendations through inference.
export async function getSmartFolderRecommendations({ insights }) {
  return requestInferenceJson('/api/smart-folder-recommendations', { insights }, {
    circuitKey: 'smart-folders'
  });
}
