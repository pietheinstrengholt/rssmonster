import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../services/inference/inferenceClient.js', () => ({
  requestInferenceJson: mocked.request
}));

const { default: analyzeArticleContent } = await import(
  '../../services/crawl/enrichment/analyzeArticleContent.js'
);

describe('analyzeArticleContent', () => {
  beforeEach(() => {
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
    expect(mocked.request).toHaveBeenCalledWith('/api/classifications/article', input);
  });

  it('returns local defaults without calling inference when classification is skipped', async () => {
    vi.stubEnv('SKIP_ARTICLE_CLASSIFICATION_ANALYSIS', 'true');

    await expect(analyzeArticleContent({
      text: 'Article content',
      categories: ['Machine Learning', 'machine-learning', '---']
    })).resolves.toEqual({
      contentSummaryBullets: [],
      tags: ['machinelearning'],
      advertisementScore: 70,
      sentimentScore: 70,
      qualityScore: 70
    });
    expect(mocked.request).not.toHaveBeenCalled();
  });
});
