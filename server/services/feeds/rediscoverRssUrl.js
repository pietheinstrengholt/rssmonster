import { rediscoverFeed } from '../ai/capabilities/generation.js';

// Requests a replacement RSS or Atom URL through the inference service.
export async function rediscoverRssUrl(input, options = {}) {
  return rediscoverFeed(input, options);
}
