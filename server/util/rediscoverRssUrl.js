// util/rediscoverRssUrl.js

// Rediscover RSS URL using OpenAI
import OpenAI from 'openai';

const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
const client = hasApiKey
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

export async function rediscoverRssUrl({
  feedName,
  websiteUrl,
  oldRssUrl
}) {
  if (!client) {
    throw new Error('OpenAI API key not configured');
  }

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

  const response = await client.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: 'You produce strict JSON only.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2,
    max_tokens: 300
  });

  const raw = response.choices?.[0]?.message?.content;
  console.log('Rediscover RSS raw response:', raw);

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON returned from OpenAI');
  }
}