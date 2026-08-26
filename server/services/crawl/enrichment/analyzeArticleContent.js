// server/services/crawl/enrichment/analyzeArticleContent.js
import { requestInferenceJson } from '../../inference/inferenceClient.js';
import { shouldSkipArticleClassification } from '../../../config/intelligentFeatures.js';
import { recordProcessingFailure } from '../../observability/processingFailures.js';
import { createDefaultArticleAnalysis } from './articleAnalysis.js';

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
const isInferenceQueueFullError = error =>
  error?.code === 'INFERENCE_UNAVAILABLE' &&
  error?.inferenceErrorCode === 'inference_queue_full';

const recordSkippedClassification = async (error, processingContext = {}) => {
  const {
    crawlRunId,
    executionId,
    userId,
    feedId,
    articleId,
    subjectType,
    subjectId
  } = processingContext;

  await recordProcessingFailure({
    crawlRunId,
    executionId,
    userId,
    stage: 'article_classification',
    failureType: 'UNAVAILABLE',
    severity: 'WARNING',
    code: 'INFERENCE_QUEUE_FULL',
    error,
    message: 'Article classification skipped because the inference queue was full',
    subjectType,
    subjectId,
    feedId,
    articleId,
    retryable: true,
    context: {
      reason: 'inference_queue_full',
      fallback: 'default_analysis',
      ...(error?.requestId ? { requestId: error.requestId } : {})
    }
  });
};

async function analyzeArticleContent(input, { signal, processingContext } = {}) {
  if (shouldSkipArticleClassification()) {
    return createDefaultArticleAnalysis();
  }

  try {
    return await requestInferenceJson('/api/classifications/article', input, {
      circuitKey: 'classification',
      signal
    });
  } catch (error) {
    if (!isInferenceQueueFullError(error)) throw error;
    await recordSkippedClassification(error, processingContext);
    return createDefaultArticleAnalysis();
  }
}

export default analyzeArticleContent;
