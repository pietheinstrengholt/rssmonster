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

  Given the following feed information, determine the most likely current RSS or Atom feed URL.
  Return ONLY valid JSON.

  Rules:
  - Prefer official RSS or Atom feeds published by the site
  - Do not invent domains or URLs
  - If unsure, return null
  - Validate that the URL looks like a feed (rss, atom, feed, xml)
  - The reason MUST be written for end users (non-technical)
  - Avoid generic phrases like "common pattern" or "context match"
  - Explain *why this specific URL* is likely correct in clear, simple language

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
  - One short sentence
  - Concrete and specific
  - No AI/meta explanations
  - Example: "This is the site's official RSS feed, available at /feed/."
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