import { requestInferenceJson } from '../inference/inferenceClient.js';

// Requests a replacement RSS or Atom URL through the inference service.
export async function rediscoverRssUrl(input) {
  return requestInferenceJson('/api/feed-rediscovery', input);
}
