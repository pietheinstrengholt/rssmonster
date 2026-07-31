import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  findArticles: vi.fn(),
  findFeed: vi.fn(),
  findFeeds: vi.fn(),
  resolvePredictedAffinity: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Feed: {
      findByPk: mocked.findFeed,
      findAll: mocked.findFeeds
    },
    Article: {
      findAll: mocked.findArticles
    },
    Event: {}
  }
}));

vi.mock('../../services/recommendations/predictedAffinityResolver.js', () => ({
  resolvePredictedAffinity: mocked.resolvePredictedAffinity
}));

const originalScriptPath = process.argv[1];

// This creates a feed record with overridable persisted trust metrics.
const createFeed = (overrides = {}) => ({
  id: 7,
  feedName: 'Example feed',
  feedTrust: 0.6,
  update: vi.fn().mockResolvedValue(undefined),
  ...overrides
});

describe('feed trust command', () => {
  beforeEach(() => {
    vi.resetModules();
    mocked.findArticles.mockReset().mockResolvedValue([]);
    mocked.findFeed.mockReset();
    mocked.findFeeds.mockReset().mockResolvedValue([]);
    mocked.resolvePredictedAffinity.mockReset().mockReturnValue({
      predictedAffinity: 'warm',
      confidence: 0.8
    });
    process.argv[1] = originalScriptPath;
  });

  afterEach(() => {
    process.argv[1] = originalScriptPath;
    vi.restoreAllMocks();
  });

  // A deleted feed is skipped without querying its articles.
  it('returns null when the requested feed does not exist', async () => {
    mocked.findFeed.mockResolvedValue(null);
    const { calculateFeedTrustForFeed } = await import('../../scripts/calculateFeedTrust.js');

    await expect(calculateFeedTrustForFeed(404)).resolves.toBeNull();
    expect(mocked.findArticles).not.toHaveBeenCalled();
  });

  // An inactive feed retains persisted metrics when the lookback has no articles.
  it('returns persisted defaults without updating a feed that has no recent articles', async () => {
    const feed = createFeed({
      feedTrust: null,
      feedDuplicationRate: null,
      feedAttentionAvg: null,
      feedDeepReadRatio: null,
      feedSkimRatio: null,
      feedIgnoreRatio: null,
      feedClickAvg: null,
      feedClickRatio: null,
      feedAttentionSampleSize: null
    });
    mocked.findFeed.mockResolvedValue(feed);
    mocked.resolvePredictedAffinity.mockReturnValue(undefined);
    const { calculateFeedTrustForFeed } = await import('../../scripts/calculateFeedTrust.js');

    const result = await calculateFeedTrustForFeed(feed.id);

    expect(result).toEqual({
      trust: 0.75,
      duplicationRate: 0,
      feedAttentionAvg: 0,
      feedDeepReadRatio: 0,
      feedSkimRatio: 0,
      feedIgnoreRatio: 0,
      feedClickAvg: 0,
      feedClickRatio: 0,
      feedAttentionSampleSize: 0,
      sampleConfidence: 0,
      predictedAffinity: 'cold',
      predictedConfidence: 0.25
    });
    expect(feed.update).not.toHaveBeenCalled();
    expect(mocked.resolvePredictedAffinity).toHaveBeenCalledWith({
      article: {
        attentionBucket: 0,
        status: 'unread'
      },
      feed
    });
  });

  // Recent articles exercise originality, engagement, penalties, and attention persistence.
  it('calculates and persists trust and attention metrics for a populated feed', async () => {
    const feed = createFeed({
      mutedUntil: new Date(Date.now() - 24 * 60 * 60 * 1000)
    });
    const articles = [
      {
        id: 1,
        event: { articleCount: 2, representativeArticleId: 1 },
        favoriteInd: true,
        clickedAmount: 2,
        attentionBucket: 4,
        negativeInd: 1
      },
      {
        id: 2,
        event: { articleCount: 1, representativeArticleId: 2 },
        favoriteInd: false,
        clickedAmount: 0,
        attentionBucket: 3,
        negativeInd: 0
      },
      {
        id: 3,
        event: { representativeArticleId: 99 },
        favoriteInd: false,
        clickedAmount: -3,
        attentionBucket: 2,
        negativeInd: 0
      },
      {
        id: 4,
        event: null,
        favoriteInd: false,
        clickedAmount: null,
        attentionBucket: 1,
        negativeInd: 0
      },
      {
        id: 5,
        event: null,
        favoriteInd: false,
        attentionBucket: 0,
        negativeInd: 0
      },
      ...Array.from({ length: 746 }, (_, index) => ({
        id: index + 6,
        event: null,
        favoriteInd: false,
        clickedAmount: 0,
        attentionBucket: 0,
        negativeInd: 0
      }))
    ];
    mocked.findFeed.mockResolvedValue(feed);
    mocked.findArticles.mockResolvedValue(articles);
    const { calculateFeedTrustForFeed } = await import('../../scripts/calculateFeedTrust.js');

    const result = await calculateFeedTrustForFeed(feed.id);

    expect(result.trust).toBeGreaterThan(0);
    expect(result.trust).toBeLessThan(1);
    expect(result.duplicationRate).toBeCloseTo(1 / 3);
    expect(result.feedAttentionAvg).toBeCloseTo(0.625);
    expect(result.feedDeepReadRatio).toBeCloseTo(0.5);
    expect(result.feedSkimRatio).toBeCloseTo(0.25);
    expect(result.feedIgnoreRatio).toBeCloseTo(747 / 751);
    expect(result.feedClickAvg).toBeCloseTo(2 / 751);
    expect(result.feedClickRatio).toBeCloseTo(1 / 751);
    expect(result.feedAttentionSampleSize).toBe(4);
    expect(result.sampleConfidence).toBe(1);
    expect(result.predictedAffinity).toBe('warm');
    expect(result.predictedConfidence).toBe(0.8);
    expect(feed.update).toHaveBeenCalledWith(expect.objectContaining({
      feedTrust: result.trust,
      feedDuplicationRate: 1 / 3,
      feedAttentionAvg: 0.625,
      feedDeepReadRatio: 0.5,
      feedSkimRatio: 0.25,
      feedIgnoreRatio: 747 / 751,
      feedClickAvg: 2 / 751,
      feedClickRatio: 1 / 751,
      feedAttentionSampleSize: 4,
      feedAttentionUpdatedAt: expect.any(Date)
    }));

    const articleQuery = mocked.findArticles.mock.calls[0][0];
    const publishedAtOperators = Object.getOwnPropertySymbols(articleQuery.where.publishedAt);
    expect(articleQuery.where.feedId).toBe(feed.id);
    expect(articleQuery.where.publishedAt[publishedAtOperators[0]]).toBeInstanceOf(Date);
    expect(articleQuery.include).toEqual([
      { model: {}, as: 'event' }
    ]);
  });

  // Batch processing scopes active feeds and isolates missing or failing records.
  it('reports successful, skipped, and failed feeds in a user-scoped batch', async () => {
    const feeds = [
      createFeed({ id: 1, feedName: 'Updated' }),
      createFeed({ id: 2, feedName: 'Missing' }),
      createFeed({ id: 3, feedName: 'Broken' })
    ];
    mocked.findFeeds.mockResolvedValue(feeds);
    mocked.findFeed.mockImplementation(async id => {
      if (id === 1) return feeds[0];
      if (id === 2) return null;
      throw new Error('database unavailable');
    });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { calculateFeedTrustForAllFeeds } = await import('../../scripts/calculateFeedTrust.js');

    const result = await calculateFeedTrustForAllFeeds({ userId: 42 });

    expect(mocked.findFeeds).toHaveBeenCalledWith({
      where: {
        status: 'active',
        userId: 42
      }
    });
    expect(result).toEqual({
      feedCount: 3,
      updatedCount: 1,
      failedCount: 1
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Calculating trust & attention for 3 feeds'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Feed 1 (Updated)'));
    expect(errorSpy).toHaveBeenCalledWith(
      '[FEED-TRUST] Failed for feed 3:',
      'database unavailable'
    );
  });

  // The executable command reports completion and exits successfully.
  it('runs the batch from the CLI entry point', async () => {
    process.argv[1] = '/tmp/calculateFeedTrust.js';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);

    await import('../../scripts/calculateFeedTrust.js');

    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0));
    expect(logSpy).toHaveBeenCalledWith('[FEED-TRUST] Done');
  });

  // A rejected batch is surfaced by the executable command with a failure exit.
  it('reports a CLI batch failure', async () => {
    const failure = new Error('feed query failed');
    process.argv[1] = '/tmp/calculateFeedTrust.js';
    mocked.findFeeds.mockRejectedValue(failure);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);

    await import('../../scripts/calculateFeedTrust.js');

    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(1));
    expect(errorSpy).toHaveBeenCalledWith('[FEED-TRUST] Failed:', failure);
  });
});
