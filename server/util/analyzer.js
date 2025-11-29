import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const clamp = (n, min, max) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));

export async function analyzeContent(text) {
  const defaultResult = {
    summary: text,
    tags: [],
    advertisementScore: 0,
    sentimentScore: 50,
    qualityScore: 50,
  };

  const crawlModel = process.env.OPENAI_MODEL_CRAWL || process.env.OPENAI_MODEL_NAME;
  if (!process.env.OPENAI_API_KEY || !crawlModel) {
    return defaultResult;
  }

  try {
    const prompt = `You are a helpful assistant analyzing an RSS article.\n\nTask:\n1) Summarize the content in 2-3 concise sentences.\n2) Provide 5-7 SEO-friendly tags (lowercase, no punctuation).\n3) Score the article on three metrics from 0 to 100.\n   - advertisementScore: 0 = purely editorial, 100 = heavy promotional/affiliate/spam.\n   - sentimentScore: 0 = very negative, 50 = neutral, 100 = very positive.\n   - qualityScore: depth, accuracy, structure and writing quality (0-30 poor, 70-100 excellent).\n\nReturn STRICT JSON with keys: summary, tags, advertisementScore, sentimentScore, qualityScore.\n\nArticle:\n${text}`;

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
