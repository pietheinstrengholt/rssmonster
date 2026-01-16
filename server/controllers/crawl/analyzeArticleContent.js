// server/controllers/crawl/analyzeArticleContent.js

import OpenAI from 'openai';

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
  contentSummaryBullets: [],
  tags: [],
  advertisementScore: 70,
  sentimentScore: 70,
  qualityScore: 70
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
      "You are a precise, neutral, and reliable assistant analyzing a single RSS article.",
      "",
      "Follow these rules EXACTLY:",
      "",
      "1) Write a paragraph summary:",
      "   - Short articles: up to 5 sentences",
      "   - Long articles: 10-20 sentences",
      "   - Focus strictly on factual information and key points",
      "   - No opinions, speculation, or exaggeration",
      "",
      "2) Write 3-6 bullet point summaries (contentSummaryBullets):",
      "   - Each bullet expresses ONE clear fact or takeaway",
      "   - No filler, no commentary, no subjective language",
      "   - Each bullet must stand on its own",
      "",
      "3) Provide 3-5 SEO-friendly tags:",
      "   - lowercase",
      "   - no punctuation",
      "   - single words or short phrases",
      "   - no duplicates",
      "",
      "   TAG SELECTION RULES (IMPORTANT):",
      "   - Article Categories are the PRIMARY signal for tag generation.",
      "   - Prefer categories that clearly and accurately describe the topic.",
      "   - Validate categories against the actual content:",
      "       • If a category matches the article, use it (or a normalized variant).",
      "       • If a category is vague, misleading, or irrelevant, discard it.",
      "   - If categories are missing or unreliable, derive tags from the article content.",
      "",
      "4) Score the article from 0-100 using the following definitions:",
      "",
      "   SCORING CONSTRAINTS (MANDATORY):",
      "   - Scores MUST be one of: 0,10,20,30,40,50,60,70,80,90,100",
      "   - 70 represents an average RSS article.",
      "   - 100 should be rare.",
      "   - Scores below 40 must be used when clear deficiencies are present.",
      "   - Internally compare the article to both the next higher and next lower bucket before selecting a score.",
      "",
      "   - advertisementScore (absence of promotion):",
      "       • 90-100 = purely editorial and informational; no marketing or promotion",
      "       • 70-80  = mixed editorial and promotional content",
      "       • 0-60   = strongly promotional or marketing-driven",
      "       • Decrease the score for:",
      "           ◦ affiliate or referral links",
      "           ◦ repeated brand, product, or service promotion",
      "           ◦ calls to action encouraging purchase, signup, or conversion",
      "",
      "   - sentimentScore (emotional neutrality and tone quality):",
      "       • 90-100 = neutral, calm, factual, or constructively positive tone",
      "       • 70-80  = mildly opinionated or emotionally charged but controlled",
      "       • 0-60   = strongly negative, alarmist, inflammatory, or fear-driven tone",
      "       • Decrease the score for:",
      "           ◦ sensationalism or outrage framing",
      "           ◦ exaggerated threats or catastrophizing language",
      "           ◦ emotionally manipulative phrasing",
      "",
      "   - qualityScore (overall writing and informational quality):",
      "       • 90-100 = excellent clarity, strong structure, concise but complete",
      "       • 70-80  = average quality; readable but unremarkable or uneven",
      "       • 0-60   = poor quality; shallow, bloated, confusing, or misleading",
      "       • Decrease the score for:",
      "           ◦ clickbait or misleading headlines",
      "           ◦ thin content with little original substance",
      "           ◦ excessive length without added informational value",
      "           ◦ poor relevance to the feed's topic or intended audience",
      "           ◦ low likelihood of holding reader attention",
      "",
      "STRICT OUTPUT RULES:",
      "- Return ONLY valid JSON",
      "- Use EXACTLY these keys:",
      "  summary, contentSummaryBullets, tags, advertisementScore, sentimentScore, qualityScore",
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
          contentSummaryBullets: Array.isArray(parsed.contentSummaryBullets)
            ? parsed.contentSummaryBullets
                .filter(b => typeof b === 'string' && b.trim().length > 0)
                .map(b => b.trim())
                .slice(0, 7)
            : [],
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