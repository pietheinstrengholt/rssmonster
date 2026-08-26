import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const embedTextsMock = vi.fn();
const recordProcessingFailureMock = vi.fn();

vi.mock('../../services/embeddings/embeddingService.js', () => ({
  DEFAULT_EMBEDDING_MODEL: 'text-embedding-3-small',
  embedTexts: embedTextsMock
}));

vi.mock('../../services/observability/processingFailures.js', () => ({
  recordProcessingFailure: recordProcessingFailureMock
}));

describe('embedArticle token limit guard', () => {
  beforeEach(() => {
    vi.resetModules();
    embedTextsMock.mockReset();
    recordProcessingFailureMock.mockReset().mockResolvedValue(undefined);
    vi.stubEnv('SKIP_ARTICLE_EMBEDDINGS', 'false');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('does not call the embedding provider when embeddings are skipped', async () => {
    vi.stubEnv('SKIP_ARTICLE_EMBEDDINGS', 'true');
    const { embedArticle } = await import('../../services/articles/embedArticle.js');

    await expect(embedArticle({
      title: 'Inference-free article',
      contentText: 'Enough article text to normally request an embedding vector.'
    })).resolves.toBeNull();
    expect(embedTextsMock).not.toHaveBeenCalled();
  });

  it('clips oversized event embedding text before provider call', async () => {
    const { embedArticle } = await import('../../services/articles/embedArticle.js');

    embedTextsMock.mockResolvedValue({
      model: 'text-embedding-3-small',
      embeddings: [[0.7, 0.8, 0.9]]
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
    expect(embedTextsMock).toHaveBeenCalledTimes(1);

    const input = embedTextsMock.mock.calls[0][0][0];
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

    embedTextsMock.mockResolvedValue({
      model: 'text-embedding-3-small',
      embeddings: [[0.1, 0.2, 0.3]]
    });

    const result = await embedArticle({
      title: 'Regular embedding input',
      contentText: 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron'
    });

    expect(result).not.toBeNull();
    expect(result.eventVector).toEqual([0.1, 0.2, 0.3]);
    expect(embedTextsMock).toHaveBeenCalledTimes(1);
  });

  it('can embed short event input when explicitly allowed', async () => {
    const { embedArticle } = await import('../../services/articles/embedArticle.js');

    embedTextsMock.mockResolvedValue({
      model: 'text-embedding-3-small',
      embeddings: [[0.4, 0.5, 0.6]]
    });

    const result = await embedArticle(
      {
        title: 'Short starred article',
        contentText: ''
      },
      { allowShortEventText: true }
    );

    expect(result.eventVector).toEqual([0.4, 0.5, 0.6]);
    expect(embedTextsMock).toHaveBeenCalledTimes(1);
  });

  // Reuses an existing persisted vector without requiring provider access.
  it('reuses an existing article vector', async () => {
    const { embedArticle, EMBEDDING_MODEL } = await import('../../services/articles/embedArticle.js');
    const article = {
      articleVector: [0.8, 0.9],
      embedding_model: null,
      update: vi.fn()
    };

    await expect(embedArticle(article)).resolves.toEqual({
      eventVector: [0.8, 0.9],
      topicVector: null,
      embedding_model: EMBEDDING_MODEL,
      reused: true
    });
    expect(embedTextsMock).not.toHaveBeenCalled();
    expect(article.update).not.toHaveBeenCalled();
  });

  // Rejects short event text before calling the provider by default.
  it('skips event text below the usefulness threshold', async () => {
    const { embedArticle } = await import('../../services/articles/embedArticle.js');

    await expect(embedArticle({ title: 'Too short' })).resolves.toBeNull();
    expect(embedTextsMock).not.toHaveBeenCalled();
  });

  // Persists newly generated vectors on Sequelize article instances.
  it('persists a generated event vector on an article instance', async () => {
    const { embedArticle, EMBEDDING_MODEL } = await import('../../services/articles/embedArticle.js');
    embedTextsMock.mockResolvedValue({
      model: 'text-embedding-3-small',
      embeddings: [[0.3, 0.4]]
    });
    const article = {
      title: 'A sufficiently descriptive article title for embedding',
      description: 'This summary provides enough distinct detail for the event embedding provider request.',
      contentText: '',
      articleVector: null,
      update: vi.fn().mockResolvedValue(undefined)
    };

    const result = await embedArticle(article);

    expect(article.update).toHaveBeenCalledWith({
      articleVector: [0.3, 0.4],
      embedding_model: EMBEDDING_MODEL
    });
    expect(article.articleVector).toEqual([0.3, 0.4]);
    expect(result.reused).toBe(false);
  });

  // Converts provider failures into a safe skipped result for batch processing.
  it('returns null and warns when the provider fails', async () => {
    const { embedArticle } = await import('../../services/articles/embedArticle.js');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const providerError = Object.assign(
      new Error('private article https://user:password@example.com?token=secret'), {
      requestId: 'embedding-request-123'
      }
    );
    embedTextsMock.mockRejectedValue(providerError);

    await expect(embedArticle({
      id: 18,
      userId: 7,
      feedId: 9,
      title: 'A sufficiently descriptive title for provider error handling',
      description: 'A sufficiently descriptive summary that passes the minimum embedding input threshold.'
    }, {
      processingContext: {
        crawlRunId: 41,
        executionId: '3dc8f1c7-13bc-4f22-9b47-b478158fea11'
      }
    })).resolves.toBeNull();
    expect(recordProcessingFailureMock).toHaveBeenCalledWith(expect.objectContaining({
      crawlRunId: 41,
      userId: 7,
      stage: 'embedding',
      feedId: 9,
      error: providerError,
      context: expect.objectContaining({
        requestId: 'embedding-request-123'
      })
    }));
    expect(warning).toHaveBeenCalledWith(
      '[EMBED] failed:',
      'Inference embeddings request failed requestId=embedding-request-123'
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private article');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('password');
    expect(JSON.stringify(warning.mock.calls)).not.toContain('token=secret');
  });

  it('logs only the first embedding warning for one open circuit', async () => {
    const { embedArticle } = await import('../../services/articles/embedArticle.js');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const createCircuitError = requestId => Object.assign(
      new Error('Inference circuit is open; retry after 30000ms'),
      {
        code: 'INFERENCE_CIRCUIT_OPEN',
        openedAt: 123456789,
        retryAfterMs: 30000,
        requestId
      }
    );
    embedTextsMock
      .mockRejectedValueOnce(createCircuitError('embedding-circuit-1'))
      .mockRejectedValueOnce(createCircuitError('embedding-circuit-2'));
    const article = {
      id: 18,
      userId: 7,
      feedId: 9,
      title: 'A sufficiently descriptive title for circuit error handling',
      description: 'A sufficiently descriptive summary that passes the embedding input threshold.'
    };

    await expect(embedArticle(article)).resolves.toBeNull();
    await expect(embedArticle(article)).resolves.toBeNull();

    expect(recordProcessingFailureMock).toHaveBeenCalledTimes(2);
    expect(recordProcessingFailureMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        context: expect.objectContaining({
          requestId: 'embedding-circuit-2'
        })
      })
    );
    expect(warning).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith(
      '[EMBED] failed:',
      'Inference embeddings circuit is open; retry after 30000ms ' +
      'requestId=embedding-circuit-1'
    );
  });
});
