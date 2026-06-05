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

  it('skips provider call when event embedding text exceeds token limit', async () => {
    const { embedArticle } = await import('../services/articles/embedArticle.js');

    const oversizedContent = Array.from({ length: 193 }, (_, index) => `token${index}`).join(' ');
    const result = await embedArticle({
      title: 'Breaking: Oversized event input',
      contentStripped: oversizedContent
    });

    expect(result).toBeNull();
    expect(embeddingsCreate).not.toHaveBeenCalled();
  });

  it('still calls provider for normal-sized event input', async () => {
    const { embedArticle } = await import('../services/articles/embedArticle.js');

    embeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.1, 0.2, 0.3] }]
    });

    const result = await embedArticle({
      title: 'Regular embedding input',
      contentStripped: 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron'
    });

    expect(result).not.toBeNull();
    expect(result.eventVector).toEqual([0.1, 0.2, 0.3]);
    expect(embeddingsCreate).toHaveBeenCalledTimes(1);
  });

  it('can embed short event input when explicitly allowed', async () => {
    const { embedArticle } = await import('../services/articles/embedArticle.js');

    embeddingsCreate.mockResolvedValue({
      data: [{ embedding: [0.4, 0.5, 0.6] }]
    });

    const result = await embedArticle(
      {
        title: 'Short starred article',
        contentStripped: ''
      },
      { allowShortEventText: true }
    );

    expect(result.eventVector).toEqual([0.4, 0.5, 0.6]);
    expect(embeddingsCreate).toHaveBeenCalledTimes(1);
  });
});
