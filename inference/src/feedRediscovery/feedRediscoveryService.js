// Uses OpenAI to suggest a replacement RSS or Atom URL when an existing feed stops working.
// The response is expected to be strict JSON with a URL, confidence score, and user-facing reason.
import OpenAI from 'openai';
import { getGenerationConfig } from '../config/config.js';
import qwenGenerationProvider from '../generation/providers/qwenGenerationProvider.js';
import { logInferenceDebug } from '../debug.js';
import { getInferenceRequestId } from '../middleware/requestLifecycle.js';

// Coerces the has api key into the representation required for this service.
const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
// Selects the client based on whether has api key is available.
const client = hasApiKey
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;
const generationConfig = getGenerationConfig();

// Asks the LLM for the most likely replacement feed URL for a broken feed.
export async function rediscoverRssUrl({
  feedName,
  websiteUrl,
  oldRssUrl
}, context = {}) {
  const startedAt = Date.now();
  logInferenceDebug(
    `calling feed-rediscovery provider=${generationConfig.provider}`
  );
  // Rejects processing when client is unavailable.
  if (generationConfig.provider === 'openai' && !client) {
    throw new Error('OpenAI API key not configured');
  }

  // Derives the prompt required while performing rediscover rss url.
  const prompt = `
  You are an expert in RSS and Atom feeds.

  The previously used RSS feed URL is no longer valid and cannot be processed.
  Your task is to discover and suggest the most likely *replacement* RSS or Atom feed URL
  for the same website or publisher.

  Return ONLY valid JSON.

  Rules:
  - Assume oldRssUrl is broken and MUST NOT be reused
  - Prefer official RSS or Atom feeds published by the website
  - Do not invent domains or URLs
  - The suggested feed must belong to the same site as websiteUrl
  - If no reliable replacement can be found, return null
  - Validate that the URL looks like a feed (rss, atom, feed, xml)
  - Write the reason for end users (non-technical)
  - Avoid generic or AI-style explanations

  Input:
  {
    "feedName": "${feedName}",
    "websiteUrl": "${websiteUrl}",
    "oldRssUrl": "${oldRssUrl}"
  }

  Output format:
  {
    "url": string | null,
    "confidence": number,
    "reason": string
  }

  Reason guidelines:
  - One short, clear sentence
  - Explain why this is a good *replacement* feed
  - Be specific and concrete
  - Example: "This is the website’s official RSS feed that replaces the previously broken feed."
  `;

  // Performs the create operation while performing rediscover rss url.
  const raw = generationConfig.provider === 'qwen'
    ? await qwenGenerationProvider.generate({
      systemPrompt: 'You produce strict JSON only.',
      prompt,
      maxNewTokens: 300,
      requestId: context.requestId || getInferenceRequestId(),
      signal: context.signal,
      operation: 'feed-rediscovery'
    })
    : (await client.chat.completions.create({
      model: generationConfig.feedRediscoveryModel,
      messages: [
        { role: 'system', content: 'You produce strict JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 300
    })).choices?.[0]?.message?.content;
  try {
    const result = JSON.parse(raw);
    logInferenceDebug(
      `completed feed-rediscovery provider=${generationConfig.provider} ` +
      `found=${Boolean(result?.url)} durationMs=${Date.now() - startedAt}`
    );
    return result;
  } catch {
    const providerName = generationConfig.provider === 'openai' ? 'OpenAI' : 'Qwen';
    throw new Error(`Invalid JSON returned from ${providerName}`);
  }
}
