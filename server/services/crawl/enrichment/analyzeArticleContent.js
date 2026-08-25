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
    return {
      contentSummaryBullets: [],
      // Provider categories are persisted independently and must not be duplicated as inferred tags.
      tags: [],
      advertisementScore: 70,
      sentimentScore: 70,
      qualityScore: 70
    };
  }

  return requestInferenceJson('/api/classifications/article', input);
}

export default analyzeArticleContent;
