import { generateSmartFolderRecommendations } from '../ai/capabilities/generation.js';

// Requests personalized Smart Folder recommendations through inference.
export async function getSmartFolderRecommendations({ insights }, options = {}) {
  return generateSmartFolderRecommendations({ insights }, options);
}
