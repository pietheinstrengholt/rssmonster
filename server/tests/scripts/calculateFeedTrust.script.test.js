import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  findArticles: vi.fn(),
  findFeed: vi.fn(),
  findFeeds: vi.fn(),
  resolvePredictedAffinity: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Feed: { findByPk: mocked.findFeed, findAll: mocked.findFeeds },
    Article: { findAll: mocked.findArticles }
  }
}));

vi.mock('../../services/recommendations/predictedAffinityResolver.js', () => ({
  resolvePredictedAffinity: mocked.resolvePredictedAffinity
}));

const originalScriptPath = process.argv[1];

const createFeed = (overrides = {}) => ({
  id: 7,
  feedName: 'Example feed',
  feedTrust: 0.6,
  update: vi.fn().mockImplementation(async function update(values) {
    Object.assign(this, values);
  }),
  ...overrides
});

const createArticle = (overrides = {}) => ({
  id: 1,
  status: 'read',
  duplicateOfArticleId: null,
  favoriteInd: 0,
  negativeInd: 0,
  clickedAmount: 0,
  attentionBucket: 3,
  qualityScore: 75,
  sentimentScore: 75,
  advertisementScore: 75,
  aiAnalysisStatus: 'complete',
  ...overrides
});

const createArticles = (count, overrides = {}) =>
  Array.from({ length: count }, (_, index) => createArticle({
    id: index + 1,
    ...(typeof overrides === 'function' ? overrides(index) : overrides)
  }));

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

  const calculate = async (articles, feedOverrides = {}) => {
    const feed = createFeed(feedOverrides);
    mocked.findFeed.mockResolvedValue(feed);
    mocked.findArticles.mockResolvedValue(articles);
    const { calculateFeedTrustForFeed } = await import('../../scripts/calculateFeedTrust.js');
    return { feed, result: await calculateFeedTrustForFeed(feed.id), calculateFeedTrustForFeed };
  };

  it('returns null when the requested feed does not exist', async () => {
    mocked.findFeed.mockResolvedValue(null);
    const { calculateFeedTrustForFeed } = await import('../../scripts/calculateFeedTrust.js');

    await expect(calculateFeedTrustForFeed(404)).resolves.toBeNull();
    expect(mocked.findArticles).not.toHaveBeenCalled();
  });

  it('persists the neutral score and empty supporting metrics without evidence', async () => {
    const { feed, result } = await calculate([], { feedTrust: 0.2 });

    expect(result.trust).toBe(0.75);
    expect(result.componentConfidences).toEqual({
      quality: 0,
      engagement: 0,
      originality: 0,
      negativeFeedback: 0
    });
    expect(feed.update).toHaveBeenCalledWith(expect.objectContaining({
      feedTrust: 0.75,
      feedDuplicationRate: 0,
      feedAttentionSampleSize: 0
    }));
  });

  it('raises trust for high article quality and lowers it for low article quality', async () => {
    const high = await calculate(createArticles(8, {
      qualityScore: 95,
      sentimentScore: 95,
      advertisementScore: 95
    }));
    vi.resetModules();
    const low = await calculate(createArticles(8, {
      qualityScore: 20,
      sentimentScore: 20,
      advertisementScore: 20
    }));

    expect(high.result.averageArticleQuality).toBeCloseTo(0.95);
    expect(low.result.averageArticleQuality).toBeCloseTo(0.2);
    expect(high.result.trust).toBeGreaterThan(low.result.trust);
  });

  it('keeps article quality dominant over engagement', async () => {
    const highQualityNoEngagement = await calculate(createArticles(8, {
      qualityScore: 95,
      sentimentScore: 95,
      advertisementScore: 95,
      attentionBucket: 0
    }));
    vi.resetModules();
    const lowQualityMaxEngagement = await calculate(createArticles(8, {
      qualityScore: 20,
      sentimentScore: 20,
      advertisementScore: 20,
      attentionBucket: 4,
      favoriteInd: 1,
      clickedAmount: 1
    }));

    expect(highQualityNoEngagement.result.trust)
      .toBeGreaterThan(lowQualityMaxEngagement.result.trust);
  });

  it('allows an excellent weekly source to earn high trust without a volume reward', async () => {
    const { result } = await calculate(createArticles(4, {
      qualityScore: 95,
      sentimentScore: 95,
      advertisementScore: 95,
      attentionBucket: 4
    }));

    expect(result.componentConfidences.quality).toBe(1);
    expect(result.trust).toBeGreaterThan(0.85);
  });

  it('does not give a prolific low-quality feed an artificial volume advantage', async () => {
    const { result } = await calculate(createArticles(100, {
      status: 'unread',
      qualityScore: 20,
      sentimentScore: 20,
      advertisementScore: 20,
      attentionBucket: 0
    }));

    expect(result.trust).toBeLessThan(0.6);
    expect(result.componentConfidences.engagement).toBe(0);
  });

  it('ignores semantic event size and representative selection', async () => {
    const articles = createArticles(8, index => ({
      event: { articleCount: 100, representativeArticleId: index === 0 ? 1 : 999 }
    }));
    const withEvents = await calculate(articles);
    vi.resetModules();
    const withoutEvents = await calculate(articles.map(({ event: _event, ...article }) => article));

    expect(withEvents.result.trust).toBe(withoutEvents.result.trust);
    expect(withEvents.result.duplicationRate).toBe(0);
  });

  it('uses actual duplicate links to reduce originality', async () => {
    const original = await calculate(createArticles(8));
    vi.resetModules();
    const syndicationHeavy = await calculate(createArticles(8, index => ({
      duplicateOfArticleId: index < 4 ? 100 + index : null
    })));

    expect(syndicationHeavy.result.duplicationRate).toBe(0.5);
    expect(syndicationHeavy.result.originality).toBe(0.5);
    expect(syndicationHeavy.result.trust).toBeLessThan(original.result.trust);
  });

  it('reduces trust for negative feedback without dilution from unread volume', async () => {
    const exposed = createArticles(8, index => ({ negativeInd: index < 4 ? 1 : 0 }));
    const unread = createArticles(100, index => ({
      id: 1000 + index,
      status: 'unread',
      attentionBucket: 0
    }));
    const { result } = await calculate([...exposed, ...unread]);

    expect(result.negativeFeedbackQuality).toBe(0.5);
    expect(result.componentConfidences.negativeFeedback).toBe(1);
    expect(result.trust).toBeLessThan(0.75);
  });

  it('does not use mute history in trust', async () => {
    const articles = createArticles(8);
    const unmuted = await calculate(articles, { mutedUntil: null });
    vi.resetModules();
    const muted = await calculate(articles, { mutedUntil: new Date(Date.now() + 86400000) });

    expect(muted.result.trust).toBe(unmuted.result.trust);
  });

  it('is exactly deterministic when recalculated over unchanged data', async () => {
    const articles = createArticles(8);
    const { feed, result, calculateFeedTrustForFeed } = await calculate(articles, { feedTrust: 0.1 });
    const repeated = await calculateFeedTrustForFeed(feed.id);

    expect(repeated.trust).toBe(result.trust);
  });

  it('handles unavailable quality and duplicate evidence safely', async () => {
    const { result } = await calculate(createArticles(3, {
      duplicateOfArticleId: undefined,
      qualityScore: null,
      sentimentScore: null,
      advertisementScore: null,
      aiAnalysisStatus: 'pending',
      attentionBucket: 0,
      status: 'unread'
    }));

    expect(result.trust).toBe(0.75);
    expect(result.duplicationRate).toBe(0);
    expect(result.trust).toBeGreaterThanOrEqual(0);
    expect(result.trust).toBeLessThanOrEqual(1);
  });

  it('loads all required evidence in one bounded article query', async () => {
    await calculate(createArticles(1));

    const query = mocked.findArticles.mock.calls[0][0];
    expect(query.where.feedId).toBe(7);
    expect(Object.getOwnPropertySymbols(query.where.publishedAt)).toHaveLength(1);
    expect(query.attributes).toEqual(expect.arrayContaining([
      'duplicateOfArticleId',
      'qualityScore',
      'sentimentScore',
      'advertisementScore',
      'negativeInd',
      'attentionBucket'
    ]));
    expect(query.include).toBeUndefined();
  });

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
      where: { status: 'active', userId: 42 }
    });
    expect(result).toEqual({ feedCount: 3, updatedCount: 1, failedCount: 1 });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Feed 1 (Updated)'));
    expect(errorSpy).toHaveBeenCalledWith(
      '[FEED-TRUST] Failed for feed 3:',
      'database unavailable'
    );
  });

  it('runs the batch from the CLI entry point', async () => {
    process.argv[1] = '/tmp/calculateFeedTrust.js';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);

    await import('../../scripts/calculateFeedTrust.js');

    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(0));
    expect(logSpy).toHaveBeenCalledWith('[FEED-TRUST] Done');
  });

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
