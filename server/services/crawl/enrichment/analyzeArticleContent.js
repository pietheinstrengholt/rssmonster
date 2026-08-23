// server/services/crawl/enrichment/analyzeArticleContent.js
import { requestInferenceJson } from '../../inference/inferenceClient.js';
import { shouldSkipArticleClassification } from '../../../config/intelligentFeatures.js';

/* ======================================================
   Article analysis through the inference service
   ------------------------------------------------------
   Generates:
   - summary bullets
   - tags
   - advertisement score
   - sentiment score
   - quality score
====================================================== */

// This function analyzes canonical visible article text through inference.
async function analyzeArticleContent(input) {
  if (shouldSkipArticleClassification()) {
    const categories = Array.isArray(input?.categories) ? input.categories : [];
    const tags = [...new Set(categories
      .map(category => String(category || '').trim().toLowerCase()
        .replace(/[^\p{L}\p{N}]/gu, '').slice(0, 32))
      .filter(Boolean))].slice(0, 5);

    return {
      contentSummaryBullets: [],
      tags,
      advertisementScore: 70,
      sentimentScore: 70,
      qualityScore: 70
    };
  }

  return requestInferenceJson('/api/classifications/article', input);
}

export default analyzeArticleContent;
