import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

/* ======================================================
   OpenAI analysis (rate limited)
   ------------------------------------------------------
   Generates:
   - summary
   - tags
   - advertisement score
   - sentiment score
   - quality score
====================================================== */

// OpenAI client
const hasApiKey = Boolean(process.env.OPENAI_API_KEY);
const client = hasApiKey
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Mutex for sequential OpenAI API calls
let openAIQueue = Promise.resolve();
let rateLimitDelay = 0;

// Helpers
const clamp = (n, min, max) =>
  Math.max(min, Math.min(max, Number.isFinite(n) ? n : min));

const defaultAnalysis = text => ({
  summary: text,
  tags: [],
  advertisementScore: 50,
  sentimentScore: 50,
  qualityScore: 50
});

async function analyzeArticleContent(contentStripped, title, categoryNames, RATE_LIMIT_DELAY_MS) {
  let analysis = defaultAnalysis(contentStripped);

  // If no API key, skip analysis
  if (!hasApiKey) {
    return analysis;
  }

  const model = process.env.OPENAI_MODEL_CRAWL || process.env.OPENAI_MODEL_NAME;

  if (!model) return analysis;

  // Queue execution to respect rate limits
  await new Promise(resolve => {
    openAIQueue = openAIQueue.then(async () => {
      try {
        if (rateLimitDelay > 0) {
          await new Promise(r => setTimeout(r, rateLimitDelay));
        }

        const prompt = [
          "You are a concise and reliable assistant analyzing a single RSS article.",
          "",
          "Follow these rules EXACTLY:",
          "",
          "1) Summarize the article:",
          "   - If the article is short (a few paragraphs), write a concise summary of up to 5 sentences.",
          "   - If the article is long (many paragraphs), write a detailed summary of 10-20 sentences.",
          "   - Always focus on facts and key points, avoid filler.",
          "",
          "2) Provide 3-5 SEO-friendly tags:",
          "   - lowercase",
          "   - no punctuation",
          "   - single words or short phrases",
          "   - no duplicates",
          "",
          "   TAG SELECTION RULES (IMPORTANT):",
          "   - Article Categories are the PRIMARY signal for tag generation.",
          "   - Prefer categories that clearly describe the article topic.",
          "   - Validate categories against the article content:",
          "       • If a category matches the content, use it as a tag (or a close normalized variant).",
          "       • If a category is vague, misleading, irrelevant, or inconsistent with the content, discard it.",
          "   - If categories are missing, insufficient, or unreliable, derive tags from the article content instead.",
          "   - Tags must accurately reflect what the article is actually about, not just how it is labeled.",
          "",
          "3) Score the article from 0-100 on:",
          "   - advertisementScore (0 = editorial, 100 = promotional)",
          "   - sentimentScore (0 = positive, 50 = neutral, 100 = negative)",
          "   - qualityScore (0 = excellent, 100 = very poor)",
          "",
          "STRICT OUTPUT RULES:",
          "- Return ONLY valid JSON",
          "- Use keys: summary, tags, advertisementScore, sentimentScore, qualityScore",
          "",
          `Article Title: ${title}`,
          `Article Categories: ${categoryNames.join(', ')}`,
          "Article Content:",
          "```",
          contentStripped,
          "```"
        ].join('\n');

        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: 'You produce strict JSON only.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2,
          max_completion_tokens: 800
        });

        const raw = response.choices?.[0]?.message?.content || '';
        let parsed;

        try {
          parsed = JSON.parse(raw);
        } catch {
          const match = raw.match(/\{[\s\S]*\}/);
          parsed = match ? JSON.parse(match[0]) : {};
        }

        analysis = {
          summary:
            typeof parsed.summary === 'string' && parsed.summary.length > 0
              ? parsed.summary
              : contentStripped,
          tags: Array.isArray(parsed.tags)
            ? parsed.tags
                .filter(Boolean)
                .map(t => String(t).toLowerCase())
                .slice(0, 7)
            : [],
          advertisementScore: clamp(parsed.advertisementScore, 0, 100),
          sentimentScore: clamp(parsed.sentimentScore, 0, 100),
          qualityScore: clamp(parsed.qualityScore, 0, 100)
        };

        console.log(`[OpenAI LLM] Analysis completed for "${title}"`);
      } catch (err) {
        if (
          err.message?.includes('429') ||
          err.message?.toLowerCase().includes('rate limit')
        ) {
          rateLimitDelay = RATE_LIMIT_DELAY_MS;
          console.warn('[OpenAI LLM] Rate limit hit, enabling delay for subsequent requests');
        }
        console.error('Error analyzing content:', err.message);
      }

      resolve();
    });
  });

  return analysis;
}

export default analyzeArticleContent;