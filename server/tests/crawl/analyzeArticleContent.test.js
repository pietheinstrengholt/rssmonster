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
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL_CRAWL = 'test-model';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL_CRAWL;
  });

  it('normalizes invalid categories and falls back for non-numeric scores', async () => {
    completionsCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            summary: 'Validated summary',
            contentSummaryBullets: [],
            tags: [],
            sentimentScore: 'invalid',
            qualityScore: 86
          })
        }
      }]
    });

    const { default: analyzeArticleContent } = await import(
      '../../services/crawl/analyzeArticleContent.js'
    );
    const content = 'Article content '.repeat(40);
    const result = await analyzeArticleContent(
      content,
      'Validation test',
      'not-an-array',
      'Test feed',
      0
    );

    expect(result.advertisementScore).toBe(70);
    expect(result.sentimentScore).toBe(70);
    expect(result.qualityScore).toBe(90);

    const prompt = completionsCreate.mock.calls[0][0].messages[1].content;
    expect(prompt).toContain('Article Categories: \n');
    expect(prompt).not.toContain('not-an-array');
  });
});
