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

// Default analysis result when no API key is present
const defaultAnalysis = text => ({
  summary: text,
  contentSummaryBullets: [],
  tags: [],
  advertisementScore: 70,
  sentimentScore: 70,
  qualityScore: 70
});

// Truncate content to fit within LLM token limits while preserving head and tail
const truncateContentForLLM = (text, maxChars = 3500) => {
  if (!text || text.length <= maxChars) return text;

  const head = text.slice(0, 3000);
  const tail = text.slice(-500);

  return `${head}\n...\n${tail}`;
};

async function analyzeArticleContent(contentStripped, title, categoryNames, feedName, RATE_LIMIT_DELAY_MS) {
  // Start with default analysis
  let analysis = defaultAnalysis(contentStripped);

  // Skip analysis for very short content
  if (!contentStripped || contentStripped.trim().length < 200) {
    return analysis;
  }

  // If no API key, skip analysis
  if (!hasApiKey) {
    return analysis;
  }

  // Determine OpenAI model to use
  const model = process.env.OPENAI_MODEL_CRAWL || process.env.OPENAI_MODEL_NAME;

  // If no model specified, skip analysis
  if (!model) return analysis;

  // Skip analysis for very short content without categories
  if (
    typeof contentStripped === 'string' &&
    contentStripped.length < 500 &&
    (!Array.isArray(categoryNames) || categoryNames.length === 0)
  ) {
    return analysis;
  }

  // Helper to bucket scores to nearest 10
  const bucketScore = n =>
    [0,10,20,30,40,50,60,70,80,90,100]
      .reduce((prev, curr) =>
        Math.abs(curr - n) < Math.abs(prev - n) ? curr : prev
      );

  // Normalize category names
  const normalizeTag = t =>
    String(t)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 32);

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
      "   - EXACTLY one word per tag (no spaces)",
      "   - lowercase only",
      "   - no punctuation or symbols",
      "   - no duplicates",
      "",
      "   TAG SPECIFICITY RULES (CRITICAL):",
      "   - Tags MUST be specific and content-descriptive.",
      "   - DO NOT use generic umbrella tags such as:",
      "       • news",
      "       • politics",
      "       • economy",
      "       • business",
      "       • technology",
      "       • finance",
      "       • world",
      "   - If a tag could apply to thousands of unrelated articles, it is TOO GENERIC and MUST be replaced.",
      "",
      "   SINGLE-WORD NORMALIZATION RULES:",
      "   - Convert multi-word concepts into a single meaningful token.",
      "   - Prefer semantic compression over generic abstraction.",
      "   - Examples:",
      "       • 'interest rate hike' → 'ratehike'",
      "       • 'export controls' → 'exportcontrols'",
      "       • 'artificial intelligence' → 'ai'",
      "       • 'open ai' → 'openai'",
      "       • 'european central bank' → 'ecb'",
      "       • 'antitrust investigation' → 'antitrust'",
      "",
      "   TAG SELECTION PRIORITY (in order):",
      "   1) Named entities (companies, organizations, institutions, products, laws)",
      "   2) Specific events, policies, or mechanisms described in the article",
      "   3) Narrow domain concepts with a clear qualifier",
      "",
      "   CATEGORY USAGE RULES:",
      "   - Article Categories are ONLY a starting signal.",
      "   - Use a category ONLY if it can be transformed into a specific single-word tag.",
      "   - Discard categories that remain broad or vague after normalization.",
      "",
      "   DIVERSITY REQUIREMENT:",
      "   - At least 2 tags must refer to concrete entities or mechanisms.",
      "   - Avoid multiple tags that represent the same concept with minor wording changes.",
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
      "           ◦ all-caps words or excessive punctuation (!!!, ???, etc.)",
      "           ◦ inflammatory language (words like 'destroy', 'chaos', 'collapse', 'horrifying', 'outrageous')",
      "           ◦ false urgency or artificial scarcity ('only today', 'urgent', 'act now')",
      "           ◦ polarizing or divisive language ('us vs them', loaded adjectives)",
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
      `Feed Name: ${feedName || 'unknown'}`,
      `Article Title: ${title}`,
      `Article Categories: ${categoryNames.join(', ')}`,
      "Article Content:",
      "```",
      truncateContentForLLM(contentStripped),
      "```"
    ].join('\n');

        const response = await client.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: 'You produce strict JSON only.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2,
          max_completion_tokens: 350 // ~500 words
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
            ? [...new Set(parsed.tags.map(normalizeTag).filter(Boolean))].slice(0, 5)
            : [],
          advertisementScore: bucketScore(parsed.advertisementScore),
          sentimentScore: bucketScore(parsed.sentimentScore),
          qualityScore: bucketScore(parsed.qualityScore)
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