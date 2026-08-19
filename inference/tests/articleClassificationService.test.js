import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const completionsCreate = vi.fn();
const { modernBertScore, qwenGenerate } = vi.hoisted(() => ({
  modernBertScore: vi.fn(),
  qwenGenerate: vi.fn()
}));
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

vi.mock('../src/classifications/providers/modernBertArticleScoringProvider.js', () => ({
  default: { score: modernBertScore }
}));

vi.mock('../src/generation/providers/qwenGenerationProvider.js', () => ({
  default: { generate: qwenGenerate }
}));

describe('analyzeArticleContent response validation', () => {
  beforeEach(() => {
    vi.resetModules();
    completionsCreate.mockReset();
    OpenAIMock.mockClear();
    modernBertScore.mockReset();
    qwenGenerate.mockReset();
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubEnv('OPENAI_MODEL_CRAWL', 'test-model');
    vi.stubEnv('SKIP_ARTICLE_CLASSIFICATION_ANALYSIS', '');
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
      '../src/classifications/articleClassificationService.js'
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

    expect(completionsCreate).toHaveBeenCalledTimes(3);
    const summaryPrompt = completionsCreate.mock.calls[0][0].messages[1].content;
    const tagPrompt = completionsCreate.mock.calls[1][0].messages[1].content;
    const scoringPrompt = completionsCreate.mock.calls[2][0].messages[1].content;
    expect(summaryPrompt).toContain('contentSummaryBullets');
    expect(summaryPrompt).not.toContain('advertisementScore');
    expect(tagPrompt).toContain('Article Categories: \n');
    expect(tagPrompt).toContain('{"tags"');
    expect(tagPrompt).not.toContain('not-an-array');
    expect(scoringPrompt).toContain('advertisementScore');
    expect(scoringPrompt).toContain('qualityScore');
    expect(scoringPrompt).not.toContain('writingScore');
    expect(scoringPrompt).not.toContain('contentSummaryBullets');
  });

  it('accepts writingScore as a legacy fallback for OpenAI scoring', async () => {
    completionsCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: '{}' } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: '{}' } }] })
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: '{"advertisementScore":90,"sentimentScore":80,"writingScore":86}'
          }
        }]
      });
    const { default: analyzeArticleContent } = await import(
      '../src/classifications/articleClassificationService.js'
    );

    const result = await analyzeArticleContent({
      text: 'Long article content '.repeat(40),
      title: 'Legacy score response',
      categories: [],
      feedName: 'Test feed'
    });

    expect(result).toMatchObject({
      advertisementScore: 90,
      sentimentScore: 80,
      qualityScore: 90
    });
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
      '../src/classifications/articleClassificationService.js'
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
    vi.stubEnv('SKIP_ARTICLE_CLASSIFICATION_ANALYSIS', 'true');
    const { default: analyzeArticleContent } = await import(
      '../src/classifications/articleClassificationService.js'
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

  // Avoids remote analysis for absent source text and content below the scoring threshold.
  it.each([
    [undefined, 'test-model'],
    ['Short text', 'test-model']
  ])('uses defaults for locally ineligible content %#', async (text, model) => {
    vi.stubEnv('OPENAI_MODEL_CRAWL', model);
    vi.stubEnv('OPENAI_MODEL_NAME', '');
    const { default: analyzeArticleContent } = await import(
      '../src/classifications/articleClassificationService.js'
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
      '../src/classifications/articleClassificationService.js'
    );

    const result = await analyzeArticleContent({
      text: 'Long article content '.repeat(40),
      title: 'No API key',
      categories: []
    });

    expect(result.qualityScore).toBe(70);
    expect(OpenAIMock).not.toHaveBeenCalled();
  });

  it('scores content from 200 characters without generating summaries or tags', async () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('ARTICLE_SCORING_PROVIDER', 'modernbert');
    modernBertScore.mockResolvedValue({
      advertisementScore: 90,
      sentimentScore: 80,
      qualityScore: 70
    });
    const { default: analyzeArticleContent } = await import(
      '../src/classifications/articleClassificationService.js'
    );

    const result = await analyzeArticleContent({
      text: 'Medium article text '.repeat(16),
      title: 'Locally scored',
      categories: ['Technology'],
      feedName: 'Test feed'
    });

    expect(result).toMatchObject({
      contentSummaryBullets: [],
      tags: ['technology'],
      advertisementScore: 90,
      sentimentScore: 80,
      qualityScore: 70
    });
    expect(modernBertScore).toHaveBeenCalledOnce();
    expect(modernBertScore).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Medium article text '.repeat(16)
    }));
    expect(completionsCreate).not.toHaveBeenCalled();
  });

  it('routes Qwen generation and OpenAI article scoring independently', async () => {
    vi.stubEnv('GENERATION_PROVIDER', 'qwen');
    vi.stubEnv('ARTICLE_SCORING_PROVIDER', 'openai');
    qwenGenerate
      .mockResolvedValueOnce('{"contentSummaryBullets":["Generated locally"]}')
      .mockResolvedValueOnce('{"tags":["local"]}');
    completionsCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: '{"advertisementScore":90,"sentimentScore":80,"qualityScore":70}'
        }
      }]
    });
    const { default: analyzeArticleContent } = await import(
      '../src/classifications/articleClassificationService.js'
    );

    const result = await analyzeArticleContent({
      text: 'Long article content '.repeat(40),
      title: 'Mixed providers',
      categories: [],
      feedName: 'Test feed'
    });

    expect(result).toMatchObject({
      contentSummaryBullets: ['Generated locally'],
      tags: ['local'],
      advertisementScore: 90,
      sentimentScore: 80,
      qualityScore: 70
    });
    expect(qwenGenerate).toHaveBeenCalledTimes(2);
    expect(completionsCreate).toHaveBeenCalledOnce();
    expect(completionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'test-model'
    }));
  });

  it('routes OpenAI generation and ModernBERT article scoring independently', async () => {
    vi.stubEnv('GENERATION_PROVIDER', 'openai');
    vi.stubEnv('ARTICLE_SCORING_PROVIDER', 'modernbert');
    completionsCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"contentSummaryBullets":["Generated remotely"]}' } }]
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{"tags":["remote"]}' } }]
      });
    modernBertScore.mockResolvedValue({
      advertisementScore: 80,
      sentimentScore: 70,
      qualityScore: 90
    });
    const { default: analyzeArticleContent } = await import(
      '../src/classifications/articleClassificationService.js'
    );

    const result = await analyzeArticleContent({
      text: 'Long article content '.repeat(40),
      title: 'Inverse mixed providers',
      categories: [],
      feedName: 'Test feed'
    });

    expect(result).toMatchObject({
      contentSummaryBullets: ['Generated remotely'],
      tags: ['remote'],
      advertisementScore: 80,
      sentimentScore: 70,
      qualityScore: 90
    });
    expect(completionsCreate).toHaveBeenCalledTimes(2);
    expect(modernBertScore).toHaveBeenCalledOnce();
    expect(qwenGenerate).not.toHaveBeenCalled();
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
      '../src/classifications/articleClassificationService.js'
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
      '../src/classifications/articleClassificationService.js'
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
      .mockResolvedValue({ choices: [{ message: { content: '{}' } }] });
    const { default: analyzeArticleContent } = await import(
      '../src/classifications/articleClassificationService.js'
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
    expect(completionsCreate).toHaveBeenCalledTimes(6);

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
