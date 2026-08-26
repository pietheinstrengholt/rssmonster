import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  recordProcessingFailure: vi.fn(),
  request: vi.fn()
}));
vi.mock('../../services/inference/inferenceClient.js', () => ({
  requestInferenceJson: mocked.request
}));
vi.mock('../../services/observability/processingFailures.js', () => ({
  recordProcessingFailure: mocked.recordProcessingFailure
}));

const { default: analyzeArticleContent } = await import(
  '../../services/crawl/enrichment/analyzeArticleContent.js'
);

describe('analyzeArticleContent', () => {
  beforeEach(() => {
    mocked.recordProcessingFailure.mockReset();
    mocked.recordProcessingFailure.mockResolvedValue(undefined);
    mocked.request.mockReset();
    vi.stubEnv('SKIP_ARTICLE_CLASSIFICATION_ANALYSIS', 'false');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('delegates the unchanged article analysis input to inference', async () => {
    const input = {
      text: 'Article content',
      title: 'Article title',
      categories: ['Technology'],
      feedName: 'Feed',
      rateLimitDelayMs: 1000
    };
    const result = { qualityScore: 80 };
    mocked.request.mockResolvedValue(result);

    await expect(analyzeArticleContent(input)).resolves.toBe(result);
    expect(mocked.request).toHaveBeenCalledWith(
      '/api/classifications/article',
      input,
      { circuitKey: 'classification', signal: undefined }
    );
  });

  it('forwards the feed execution abort signal to inference', async () => {
    const controller = new AbortController();
    const input = { text: 'Article content' };
    mocked.request.mockResolvedValue({ qualityScore: 80 });

    await analyzeArticleContent(input, { signal: controller.signal });

    expect(mocked.request).toHaveBeenCalledWith(
      '/api/classifications/article',
      input,
      { circuitKey: 'classification', signal: controller.signal }
    );
  });

  it('returns local defaults without calling inference when classification is skipped', async () => {
    vi.stubEnv('SKIP_ARTICLE_CLASSIFICATION_ANALYSIS', 'true');

    await expect(analyzeArticleContent({
      text: 'Article content',
      categories: ['Machine Learning', 'machine-learning', '---']
    })).resolves.toEqual({
      contentSummaryBullets: [],
      tags: [],
      advertisementScore: 70,
      sentimentScore: 70,
      qualityScore: 70
    });
    expect(mocked.request).not.toHaveBeenCalled();
  });

  it('records queue saturation and returns default analysis without failing ingestion', async () => {
    const error = Object.assign(new Error('Inference request failed with HTTP 503'), {
      code: 'INFERENCE_UNAVAILABLE',
      inferenceErrorCode: 'inference_queue_full',
      requestId: 'classification-overload-123',
      status: 503
    });
    mocked.request.mockRejectedValue(error);
    const processingContext = {
      crawlRunId: 12,
      executionId: '63d10c01-b2c7-47c7-8cb0-cb920987457f',
      userId: 42,
      feedId: 7,
      subjectType: 'feed_entry',
      subjectId: 'article-123'
    };

    await expect(analyzeArticleContent(
      { text: 'Article content' },
      { processingContext }
    )).resolves.toEqual({
      contentSummaryBullets: [],
      tags: [],
      advertisementScore: 70,
      sentimentScore: 70,
      qualityScore: 70
    });
    expect(mocked.recordProcessingFailure).toHaveBeenCalledWith({
      ...processingContext,
      articleId: undefined,
      stage: 'article_classification',
      failureType: 'UNAVAILABLE',
      severity: 'WARNING',
      code: 'INFERENCE_QUEUE_FULL',
      error,
      message: 'Article classification skipped because the inference queue was full',
      retryable: true,
      context: {
        reason: 'inference_queue_full',
        fallback: 'default_analysis',
        requestId: 'classification-overload-123'
      }
    });
  });

  it('does not hide inference failures other than queue saturation', async () => {
    const error = Object.assign(new Error('Inference service unavailable'), {
      code: 'INFERENCE_UNAVAILABLE'
    });
    mocked.request.mockRejectedValue(error);

    await expect(analyzeArticleContent({ text: 'Article content' })).rejects.toBe(error);
    expect(mocked.recordProcessingFailure).not.toHaveBeenCalled();
  });
});
