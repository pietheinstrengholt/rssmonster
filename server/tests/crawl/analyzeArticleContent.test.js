import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const completionsCreate = vi.fn();
const OpenAIMock = vi.fn(function MockOpenAI() {
  this.chat = {
    completions: {
      create: completionsCreate
    }
  };
});

vi.mock('openai', () => ({
  default: OpenAIMock
}));

describe('analyzeArticleContent response validation', () => {
  beforeEach(() => {
    vi.resetModules();
    completionsCreate.mockReset();
    OpenAIMock.mockClear();
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_MODEL_CRAWL', 'test-model');
    vi.stubEnv('SKIP_OPENAI_ANALYSIS', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('normalizes invalid categories and falls back for non-numeric scores', async () => {
    completionsCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            contentSummaryBullets: [],
            tags: [],
            sentimentScore: 'invalid',
            qualityScore: 86
          })
        }
      }]
    });

    const { default: analyzeArticleContent } = await import(
      '../../services/crawl/enrichment/analyzeArticleContent.js'
    );
    const content = 'Article content '.repeat(40);
    const result = await analyzeArticleContent({
      text: content,
      title: 'Validation test',
      categories: 'not-an-array',
      feedName: 'Test feed',
      rateLimitDelayMs: 0
    });

    expect(result).not.toHaveProperty('summary');
    expect(result.advertisementScore).toBe(70);
    expect(result.sentimentScore).toBe(70);
    expect(result.qualityScore).toBe(90);

    const prompt = completionsCreate.mock.calls[0][0].messages[1].content;
    expect(prompt).toContain('Article Categories: \n');
    expect(prompt).not.toContain('not-an-array');
    expect(prompt).not.toContain('paragraph summary');
  });

  it('preserves Unicode letters and numbers in generated tags', async () => {
    completionsCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            contentSummaryBullets: [],
            tags: ['日本-経済', 'الذكاء الاصطناعي', 'Квантовые-технологии'],
            advertisementScore: 70,
            sentimentScore: 70,
            qualityScore: 70
          })
        }
      }]
    });

    const { default: analyzeArticleContent } = await import(
      '../../services/crawl/enrichment/analyzeArticleContent.js'
    );
    const result = await analyzeArticleContent({
      text: 'Multilingual article content '.repeat(30),
      title: 'Multilingual tags',
      categories: [],
      feedName: 'Test feed',
      rateLimitDelayMs: 0
    });

    expect(result.tags).toEqual([
      '日本経済',
      'الذكاءالاصطناعي',
      'квантовыетехнологии'
    ]);
  });

  // Uses normalized feed categories without calling OpenAI when analysis is disabled.
  it('returns category tags when OpenAI analysis is skipped', async () => {
    vi.stubEnv('SKIP_OPENAI_ANALYSIS', '1');
    const { default: analyzeArticleContent } = await import(
      '../../services/crawl/enrichment/analyzeArticleContent.js'
    );

    const result = await analyzeArticleContent({
      text: 'Long article content '.repeat(40),
      title: 'Skipped analysis',
      categories: ['Machine Learning', 'machine-learning', '---'],
      feedName: 'Test feed'
    });

    expect(result.tags).toEqual(['machinelearning']);
    expect(result.contentSummaryBullets).toEqual([]);
    expect(completionsCreate).not.toHaveBeenCalled();
  });

  // Avoids remote analysis for absent, short, or medium-length source text.
  it.each([
    [undefined, 'test-model'],
    ['Short text', 'test-model'],
    ['Medium article text '.repeat(16), 'test-model'],
    ['Long article text '.repeat(40), '']
  ])('uses defaults for locally ineligible content %#', async (text, model) => {
    vi.stubEnv('OPENAI_MODEL_CRAWL', model);
    vi.stubEnv('OPENAI_MODEL_NAME', '');
    const { default: analyzeArticleContent } = await import(
      '../../services/crawl/enrichment/analyzeArticleContent.js'
    );

    const result = await analyzeArticleContent({
      text,
      title: 'Local fallback',
      categories: [],
      feedName: ''
    });

    expect(result).toMatchObject({
      tags: [],
      advertisementScore: 70,
      sentimentScore: 70,
      qualityScore: 70
    });
    expect(completionsCreate).not.toHaveBeenCalled();
  });

  // Uses local defaults when no API key was configured at module initialization.
  it('does not create an OpenAI client without an API key', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    const { default: analyzeArticleContent } = await import(
      '../../services/crawl/enrichment/analyzeArticleContent.js'
    );

    const result = await analyzeArticleContent({
      text: 'Long article content '.repeat(40),
      title: 'No API key',
      categories: []
    });

    expect(result.qualityScore).toBe(70);
    expect(OpenAIMock).not.toHaveBeenCalled();
  });

  // Recovers a JSON object embedded in surrounding model text and filters invalid bullets.
  it('recovers wrapped JSON and validates response collections', async () => {
    completionsCreate.mockResolvedValue({
      choices: [{
        message: {
          content: 'Result: {"contentSummaryBullets":[" Useful fact ","",7],"tags":"invalid","advertisementScore":25,"sentimentScore":74,"qualityScore":100} done'
        }
      }]
    });
    const { default: analyzeArticleContent } = await import(
      '../../services/crawl/enrichment/analyzeArticleContent.js'
    );

    const result = await analyzeArticleContent({
      text: 'Long article content '.repeat(40),
      title: 'Wrapped JSON',
      categories: ['Existing category']
    });

    expect(result).toMatchObject({
      contentSummaryBullets: ['Useful fact'],
      tags: ['existingcategory'],
      advertisementScore: 20,
      sentimentScore: 70,
      qualityScore: 100
    });
  });

  // Treats a non-JSON model response as an empty response object.
  it('falls back safely when the model response contains no JSON object', async () => {
    completionsCreate.mockResolvedValue({ choices: [] });
    const { default: analyzeArticleContent } = await import(
      '../../services/crawl/enrichment/analyzeArticleContent.js'
    );

    const result = await analyzeArticleContent({
      text: 'Long article content '.repeat(40),
      title: 'Empty response',
      categories: []
    });

    expect(result).toMatchObject({
      contentSummaryBullets: [],
      tags: [],
      advertisementScore: 70,
      sentimentScore: 70,
      qualityScore: 70
    });
  });

  // Enables a subsequent delay after a rate-limit error while preserving default analysis.
  it('handles rate limits and delays the next queued request', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    completionsCreate
      .mockRejectedValueOnce(new Error('429 rate limit'))
      .mockResolvedValueOnce({ choices: [{ message: { content: '{}' } }] });
    const { default: analyzeArticleContent } = await import(
      '../../services/crawl/enrichment/analyzeArticleContent.js'
    );
    const input = {
      text: 'Long article content '.repeat(40),
      title: 'Rate limited',
      categories: [],
      rateLimitDelayMs: 1
    };

    await expect(analyzeArticleContent(input)).resolves.toMatchObject({ qualityScore: 70 });
    await expect(analyzeArticleContent(input)).resolves.toMatchObject({ qualityScore: 70 });
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(completionsCreate).toHaveBeenCalledTimes(2);

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
