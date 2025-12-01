import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const clamp = (n, min, max) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));

export async function analyzeContent(text) {
  const defaultResult = {
    summary: text,
    tags: [],
    advertisementScore: 50,
    sentimentScore: 50,
    qualityScore: 50,
  };

  const crawlModel = process.env.OPENAI_MODEL_CRAWL || process.env.OPENAI_MODEL_NAME;
  if (!process.env.OPENAI_API_KEY || !crawlModel) {
    return defaultResult;
  }

  try {
    const prompt = [
    "You are a concise and reliable assistant analyzing a single RSS article.",
    "",
    "Follow these rules EXACTLY:",
    "1) Summarize the article in 2–3 clear sentences. Focus on facts, avoid filler.",
    "",
    "2) Provide 5–7 SEO-friendly tags:",
    "   - lowercase",
    "   - no punctuation",
    "   - single words or short phrases",
    "   - no duplicates",
    "",
    "3) Score the article from 0–100 on:",
    "   - advertisementScore: 0 = purely editorial, 100 = heavy promotional/affiliate/spam.",
    "   - sentimentScore: 0 = extremely positive, 50 = neutral, 100 = extremely negative.",
    "   - qualityScore: 0 = excellent quality, 100 = extremely poor quality (clarity, depth, structure, accuracy).",
    "",
    "STRICT OUTPUT RULES:",
    "- Return ONLY valid JSON.",
    "- Use these exact keys: summary, tags, advertisementScore, sentimentScore, qualityScore.",
    "- Do not include commentary or additional text.",
    "- Ignore HTML, boilerplate, navigation text, or ‘read more’ fragments.",
    "",
    "Article:",
    "```",
    text,
    "```"
    ].join('\\n');

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
    } catch (e) {
      // attempt to extract JSON block if model adds prose
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : defaultResult;
    }

    const summary = typeof parsed.summary === 'string' && parsed.summary.length > 0 ? parsed.summary : text;
    const tags = Array.isArray(parsed.tags) ? parsed.tags.filter(Boolean).map(t => String(t).toLowerCase()).slice(0, 7) : [];

    return {
      summary,
      tags,
      advertisementScore: clamp(parsed.advertisementScore, 0, 100),
      sentimentScore: clamp(parsed.sentimentScore, 0, 100),
      qualityScore: clamp(parsed.qualityScore, 0, 100),
    };
  } catch (err) {
    console.error('Error analyzing content:', err.message);
    return defaultResult;
  }
}
