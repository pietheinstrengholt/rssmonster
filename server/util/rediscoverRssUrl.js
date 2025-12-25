// util/rediscoverRssUrl.js
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

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
- Prefer official RSS or Atom feeds
- Do not invent domains
- If unsure, return null
- Validate that the URL looks like a feed (rss, atom, feed, xml)

Input:
{
  "feedName": "${feedName}",
  "websiteUrl": "${websiteUrl}",
  "oldRssUrl": "${oldRssUrl}"
}

Output format:
{
  "rssUrl": string | null,
  "confidence": number,
  "reason": string
}
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

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Invalid JSON returned from OpenAI');
  }
}