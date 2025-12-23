import { analyzeContent } from '../../util/analyzer.js';

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

// Mutex for sequential OpenAI API calls when rate limited
let openAIQueue = Promise.resolve();
let rateLimitDelay = 0;

async function analyzeArticleContent(strippedContent, title, RATE_LIMIT_DELAY_MS) {
  let analysis = {
    summary: strippedContent,
    tags: [],
    advertisementScore: 0,
    sentimentScore: 50,
    qualityScore: 50
  };

  // Only analyze content if OpenAI API key is configured
  if (!process.env.OPENAI_API_KEY) return analysis;

  // Use a queue to ensure sequential API calls and respect rate limits
  await new Promise(resolve => {
    openAIQueue = openAIQueue.then(async () => {
      try {
        // Apply rate limit delay if we hit a rate limit previously
        if (rateLimitDelay > 0) {
          await new Promise(r => setTimeout(r, rateLimitDelay));
        }

        analysis = await analyzeContent(strippedContent);
        console.log(`[OpenAI LLM] Analysis completed for "${title}"`);
      } catch (err) {
        if (
          err.message?.includes('429') ||
          err.message?.toLowerCase().includes('rate limit')
        ) {
          rateLimitDelay = RATE_LIMIT_DELAY_MS;
          console.warn(
            `[OpenAI LLM] Rate limit hit, enabling delay for subsequent requests`
          );
        }
        console.error('Error analyzing content:', err.message);
      }
      resolve();
    });
  });

  return analysis;
}

export default analyzeArticleContent;
