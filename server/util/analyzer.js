import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
const client = hasApiKey
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const clamp = (n, min, max) =>
  Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));

export async function analyzeContent(text) {
  // If no API key, return input untouched (no analysis)
  if (!hasApiKey) {
    console.log('No OpenAI API key configured, skipping content analysis.');
    return text;
  }

  const defaultResult = {
    summary: text,
    tags: [],
    advertisementScore: 50,
    sentimentScore: 50,
    qualityScore: 50,
  };

  const crawlModel =
    process.env.OPENAI_MODEL_CRAWL || process.env.OPENAI_MODEL_NAME;

  if (!crawlModel) {
    return defaultResult;
  }

  try {
    const prompt = [
      "You are a concise and reliable assistant analyzing a single RSS article.",
      "",
      "Follow these rules EXACTLY:",
      "1) Summarize the article:",
      "   - If the article is short (a few paragraphs), write a concise summary of up to 5 sentences.",
      "   - If the article is long (many paragraphs), write a detailed summary of 10-20 sentences, covering all main points and nuances.",
      "   - Always focus on facts and key points, avoid filler or off-topic commentary.",
      "",
      "2) Provide 3-5 SEO-friendly tags:",
      "   - lowercase",
      "   - no punctuation",
      "   - single words or short phrases",
      "   - no duplicates",
      "",
      "3) Score the article from 0-100 on:",
      "   - advertisementScore: 0 = purely editorial, 100 = heavy commercial/promotional content.",
      "   - sentimentScore: 0 = extremely positive, 50 = neutral, 100 = extremely negative.",
      "   - qualityScore: 0 = excellent quality, 100 = extremely poor quality.",
      "",
      "STRICT OUTPUT RULES:",
      "- Return ONLY valid JSON.",
      "- Use these exact keys: summary, tags, advertisementScore, sentimentScore, qualityScore.",
      "- Do not include commentary or additional text.",
      "",
      "Article:",
      "```",
      text,
      "```",
    ].join('\n');

    const response = await client.chat.completions.create({
      model: crawlModel,
      messages: [
        { role: 'system', content: 'You produce strict JSON only. No extra commentary.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_completion_tokens: 800,
    });

    const raw = response.choices?.[0]?.message?.content || '';
    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : defaultResult;
    }

    return {
      summary:
        typeof parsed.summary === 'string' && parsed.summary.length > 0
          ? parsed.summary
          : text,
      tags: Array.isArray(parsed.tags)
        ? parsed.tags
            .filter(Boolean)
            .map(t => String(t).toLowerCase())
            .slice(0, 7)
        : [],
      advertisementScore: clamp(parsed.advertisementScore, 0, 100),
      sentimentScore: clamp(parsed.sentimentScore, 0, 100),
      qualityScore: clamp(parsed.qualityScore, 0, 100),
    };
  } catch (err) {
    console.error('Error analyzing content:', err.message);
    return defaultResult;
  }
}