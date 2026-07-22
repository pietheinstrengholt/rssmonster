import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const embeddingsCreate = vi.fn();
const OpenAIMock = vi.fn(function MockOpenAI() {
  this.embeddings = {
    create: embeddingsCreate
  };
});

vi.mock('openai', () => ({
  default: OpenAIMock
}));

describe('embedArticle token limit guard', () => {
  beforeEach(() => {
    vi.resetModules();
    embeddingsCreate.mockReset();
    OpenAIMock.mockClear();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it('clips oversized event embedding text before provider call', async () => {
    const { embedArticle } = await import('../../services/articles/embedArticle.js');

    embeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.7, 0.8, 0.9] }]
    });

    const oversizedContent = Array.from(
      { length: 600 },
      (_, index) => `token${index}`
    ).join(' ');
    const result = await embedArticle({
      title: 'Breaking: Oversized event input',
      contentText: oversizedContent
    });

    expect(result.eventVector).toEqual([0.7, 0.8, 0.9]);
    expect(embeddingsCreate).toHaveBeenCalledTimes(2);

    const input = embeddingsCreate.mock.calls[0][0].input;
    expect(input.split(/\s+/)).toHaveLength(512);
    expect(input).toMatch(/^Title: Oversized event input\s+Body: token0/);
  });

  it('builds embedding text from contentText instead of contentHtml', async () => {
    const { buildArticleEventEmbeddingText } = await import('../../services/articles/embedArticle.js');

    const text = buildArticleEventEmbeddingText({
      title: 'Semantic source',
      contentText: 'Plain text article body with enough useful words to become embedding input.',
      contentHtml: '<p>Old sanitized HTML should not be used for semantic embedding.</p>'
    });

    expect(text).toContain('Plain text article body');
    expect(text).not.toContain('Old sanitized HTML');
  });

  it('builds structured event text without repeating summary sentences in the body', async () => {
    const { buildArticleEventEmbeddingText } = await import('../../services/articles/embedArticle.js');
    const repeatedSummary = 'Prince George starts at Eton College after the summer.';

    const text = buildArticleEventEmbeddingText({
      title: 'Prince George prepares for a new school',
      description: repeatedSummary,
      contentText: `${repeatedSummary}\n\nHis school choice has also attracted public criticism.`
    });

    expect(text).toContain('Title: Prince George prepares for a new school');
    expect(text).toContain(`Summary: ${repeatedSummary}`);
    expect(text).toContain('Body: His school choice has also attracted public criticism.');
    expect(text.match(/Prince George starts at Eton College/g)).toHaveLength(1);
  });

  it('omits a description that is effectively identical to the title', async () => {
    const { buildArticleEventEmbeddingText } = await import('../../services/articles/embedArticle.js');

    const text = buildArticleEventEmbeddingText({
      title: 'Prince George prepares for a new school this summer',
      description: 'Prince George prepares for a new school this summer.'
    });

    expect(text).toBe('Title: Prince George prepares for a new school this summer');
  });

  it('still calls provider for normal-sized event input', async () => {
    const { embedArticle } = await import('../../services/articles/embedArticle.js');

    embeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }]
    });

    const result = await embedArticle({
      title: 'Regular embedding input',
      contentText: 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron'
    });

    expect(result).not.toBeNull();
    expect(result.eventVector).toEqual([0.1, 0.2, 0.3]);
    expect(embeddingsCreate).toHaveBeenCalledTimes(1);
  });

  it('can embed short event input when explicitly allowed', async () => {
    const { embedArticle } = await import('../../services/articles/embedArticle.js');

    embeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.4, 0.5, 0.6] }]
    });

    const result = await embedArticle(
      {
        title: 'Short starred article',
        contentText: ''
      },
      { allowShortEventText: true }
    );

    expect(result.eventVector).toEqual([0.4, 0.5, 0.6]);
    expect(embeddingsCreate).toHaveBeenCalledTimes(1);
  });
});
