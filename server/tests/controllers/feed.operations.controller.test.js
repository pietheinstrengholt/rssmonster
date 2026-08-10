import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  articleFindAll: vi.fn(),
  calculateFeedTrust: vi.fn(),
  createJob: vi.fn(),
  feedCrawlResultFindAll: vi.fn(),
  feedFindAll: vi.fn(),
  feedFindOne: vi.fn(),
  getActiveJobForUser: vi.fn(),
  getJob: vi.fn(),
  performCrawl: vi.fn(),
  publishEvent: vi.fn(),
  rediscoverRssUrl: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn()
}));

vi.mock('../../models/index.js', async () => {
  const { Sequelize } = await vi.importActual('sequelize');

  return {
    default: {
      Article: {
        findAll: mocked.articleFindAll,
        sequelize: {
          fn: vi.fn(),
          col: vi.fn()
        }
      },
      Category: {},
      Feed: {
        findAll: mocked.feedFindAll,
        findOne: mocked.feedFindOne
      },
      FeedCrawlResult: {
        findAll: mocked.feedCrawlResultFindAll
      },
      Sequelize
    }
  };
});

vi.mock('../../services/feeds/rediscoverRssUrl.js', () => ({
  rediscoverRssUrl: mocked.rediscoverRssUrl
}));

vi.mock('../../controllers/crawl.js', () => ({
  default: {
    performCrawlWithSemanticGrouping: mocked.performCrawl
  }
}));

vi.mock('../../services/crawl/index.js', () => ({
  crawlJobManager: {
    createJob: mocked.createJob,
    getActiveJobForUser: mocked.getActiveJobForUser,
    getJob: mocked.getJob,
    publishEvent: mocked.publishEvent,
    subscribe: mocked.subscribe,
    unsubscribe: mocked.unsubscribe
  }
}));

vi.mock('../../services/crawl/persistence/tags.js', () => ({
  normalizeTagList: vi.fn(value => value)
}));

vi.mock('../../services/duplicates/articleDuplicates.js', () => ({
  canonicalArticleWhere: vi.fn(() => ({
    duplicateOfArticleId: null,
    filteredInd: false
  }))
}));

vi.mock('../../scripts/calculateFeedTrust.js', () => ({
  calculateFeedTrustForAllFeeds: mocked.calculateFeedTrust
}));

vi.mock('../../services/feeds/feedManagement.js', () => ({
  addFeedSubscription: vi.fn(),
  discoverFeedSubscription: vi.fn(),
  isFeedManagementError: vi.fn(() => false),
  normalizeFeedUrl: vi.fn(value => value),
  removeFeedSubscription: vi.fn(),
  updateFeedSubscription: vi.fn()
}));

const feedController = (await import('../../controllers/feed.js')).default;

// Builds an authenticated feed request with controllable close events.
const createRequest = (overrides = {}) => {
  const req = {
    userData: { userId: 42 },
    params: { feedId: '8', jobId: 'job-1' },
    body: {},
    on: vi.fn(),
    ...overrides
  };
  return req;
};

// Builds the HTTP and event-stream response contract used by feed handlers.
const createResponse = () => {
  const res = {
    headersSent: false,
    status: vi.fn(),
    json: vi.fn(),
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn()
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  res.end.mockReturnValue(res);
  return res;
};

describe('feed operational controllers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked.performCrawl.mockResolvedValue(undefined);
    mocked.feedCrawlResultFindAll.mockResolvedValue([]);
    mocked.subscribe.mockReturnValue(true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns feed article, event, and ingestion metrics', async () => {
    mocked.feedFindAll.mockResolvedValue([
      {
        id: 8,
        toJSON: vi.fn().mockReturnValue({
          id: 8,
          feedName: 'Security'
        })
      },
      {
        id: 9,
        toJSON: vi.fn().mockReturnValue({
          id: 9,
          feedName: 'Empty'
        })
      }
    ]);
    mocked.articleFindAll
      .mockResolvedValueOnce([
        {
          feedId: 8,
          articleCount: '20',
          eventArticleCount: '15'
        }
      ])
      .mockResolvedValueOnce([
        {
          feedId: 8,
          articleCount30Days: '45'
        }
      ]);
    const res = createResponse();

    await feedController.getFeeds(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      feeds: [
        {
          id: 8,
          feedName: 'Security',
          articleCount: 20,
          articlesPerDay: 1.5,
          eventArticleCount: 15,
          eventCoveragePct: 75,
          health: 'HEALTHY',
          reliabilityPct: null,
          lastCrawlAt: null,
          lastCrawlStatus: null,
          lastCrawlErrorCategory: null,
          lastSuccessfulCrawlAt: null,
          consecutiveFailures: 0
        },
        {
          id: 9,
          feedName: 'Empty',
          articleCount: 0,
          articlesPerDay: 0,
          eventArticleCount: 0,
          eventCoveragePct: 0,
          health: 'HEALTHY',
          reliabilityPct: null,
          lastCrawlAt: null,
          lastCrawlStatus: null,
          lastCrawlErrorCategory: null,
          lastSuccessfulCrawlAt: null,
          consecutiveFailures: 0
        }
      ]
    });
    expect(mocked.feedCrawlResultFindAll).toHaveBeenCalledOnce();
    expect(mocked.feedCrawlResultFindAll).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 42 }),
        group: ['feedId'],
        raw: true
      })
    );
  });

  it('merges one user-scoped crawl reliability aggregate into feed health', async () => {
    const lastCrawlAt = new Date('2026-08-10T10:00:00.000Z');
    mocked.feedFindAll.mockResolvedValue([
      {
        id: 8,
        toJSON: vi.fn().mockReturnValue({
          id: 8,
          status: 'active',
          lastCrawlAt,
          lastCrawlStatus: 'RECOVERED',
          lastCrawlErrorCategory: null,
          lastSuccessfulCrawlAt: lastCrawlAt,
          consecutiveFailures: 0
        })
      }
    ]);
    mocked.articleFindAll.mockResolvedValue([]);
    mocked.feedCrawlResultFindAll.mockResolvedValue([
      { feedId: 8, totalCount: '10', successfulCount: '9' }
    ]);
    const res = createResponse();

    await feedController.getFeeds(createRequest(), res);

    expect(res.json).toHaveBeenCalledWith({
      feeds: [expect.objectContaining({
        id: 8,
        health: 'RECOVERED',
        reliabilityPct: 90,
        lastCrawlAt,
        lastCrawlStatus: 'RECOVERED',
        lastCrawlErrorCategory: null,
        lastSuccessfulCrawlAt: lastCrawlAt,
        consecutiveFailures: 0
      })]
    });
    expect(mocked.feedCrawlResultFindAll).toHaveBeenCalledOnce();
    const crawlQuery = mocked.feedCrawlResultFindAll.mock.calls[0][0];
    expect(crawlQuery.where.userId).toBe(42);
    expect(crawlQuery.attributes[2][0].args[0].val).toContain(
      "IN ('SUCCESS', 'RECOVERED')"
    );
  });

  it('validates feed list authentication and reports aggregation errors', async () => {
    const unauthorizedRes = createResponse();
    await feedController.getFeeds(
      createRequest({ userData: {} }),
      unauthorizedRes
    );
    expect(unauthorizedRes.status).toHaveBeenCalledWith(401);

    mocked.feedFindAll.mockRejectedValue(new Error('feed list failed'));
    const failureRes = createResponse();
    await feedController.getFeeds(createRequest(), failureRes);
    expect(failureRes.status).toHaveBeenCalledWith(500);
    expect(failureRes.json).toHaveBeenCalledWith({
      error: 'feed list failed'
    });
  });

  it('rediscovers a replacement RSS URL for an owned feed', async () => {
    mocked.feedFindOne.mockResolvedValue({
      id: 8,
      feedName: 'Example',
      url: 'https://example.com'
    });
    mocked.rediscoverRssUrl.mockResolvedValue({
      url: 'https://example.com/feed.xml',
      confidence: 'high',
      reason: 'feed link'
    });
    const res = createResponse();

    await feedController.rediscoverFeedRss(createRequest(), res);

    expect(mocked.rediscoverRssUrl).toHaveBeenCalledWith({
      feedName: 'Example',
      websiteUrl: 'https://example.com',
      oldRssUrl: 'https://example.com'
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      suggestedUrl: 'https://example.com/feed.xml',
      confidence: 'high',
      reason: 'feed link'
    });
  });

  it('handles missing feeds and unsuccessful RSS rediscovery', async () => {
    mocked.feedFindOne.mockResolvedValueOnce(null);
    const missingRes = createResponse();
    await feedController.rediscoverFeedRss(createRequest(), missingRes);
    expect(missingRes.status).toHaveBeenCalledWith(404);

    mocked.feedFindOne.mockResolvedValueOnce({
      id: 8,
      feedName: 'Example',
      url: 'https://example.com'
    });
    mocked.rediscoverRssUrl.mockResolvedValue({
      url: null,
      confidence: 'low',
      reason: 'no feed link'
    });
    const noResultRes = createResponse();
    await feedController.rediscoverFeedRss(createRequest(), noResultRes);
    expect(noResultRes.status).toHaveBeenCalledWith(404);
    expect(noResultRes.json).toHaveBeenCalledWith({
      error: 'No RSS feed found',
      confidence: 'low',
      reason: 'no feed link'
    });
  });

  it('validates rediscovery authentication and errors', async () => {
    const unauthorizedRes = createResponse();
    await feedController.rediscoverFeedRss(
      createRequest({ userData: {} }),
      unauthorizedRes
    );
    expect(unauthorizedRes.status).toHaveBeenCalledWith(401);

    mocked.feedFindOne.mockRejectedValue(new Error('rediscovery failed'));
    const failureRes = createResponse();
    await feedController.rediscoverFeedRss(createRequest(), failureRes);
    expect(failureRes.status).toHaveBeenCalledWith(500);
  });

  it('mutes an owned feed until the requested time', async () => {
    const feed = {
      update: vi.fn().mockResolvedValue(undefined)
    };
    mocked.feedFindOne.mockResolvedValue(feed);
    const res = createResponse();

    await feedController.muteFeed(
      createRequest({
        body: { mutedUntil: '2026-08-01T10:00:00.000Z' }
      }),
      res
    );

    expect(feed.update).toHaveBeenCalledWith({
      mutedUntil: new Date('2026-08-01T10:00:00.000Z')
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('validates mute requests and owned feed existence', async () => {
    const unauthorizedRes = createResponse();
    await feedController.muteFeed(
      createRequest({ userData: {} }),
      unauthorizedRes
    );
    expect(unauthorizedRes.status).toHaveBeenCalledWith(401);

    const missingIdRes = createResponse();
    await feedController.muteFeed(
      createRequest({ params: {}, body: {} }),
      missingIdRes
    );
    expect(missingIdRes.status).toHaveBeenCalledWith(400);

    const missingDateRes = createResponse();
    await feedController.muteFeed(createRequest(), missingDateRes);
    expect(missingDateRes.status).toHaveBeenCalledWith(400);

    mocked.feedFindOne.mockResolvedValue(null);
    const missingFeedRes = createResponse();
    await feedController.muteFeed(
      createRequest({ body: { mutedUntil: '2026-08-01' } }),
      missingFeedRes
    );
    expect(missingFeedRes.status).toHaveBeenCalledWith(404);
  });

  it('reports feed persistence failures while muting', async () => {
    mocked.feedFindOne.mockRejectedValue(new Error('mute failed'));
    const res = createResponse();

    await feedController.muteFeed(
      createRequest({ body: { mutedUntil: '2026-08-01' } }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'mute failed' });
  });

  it('reuses active refresh jobs and starts new jobs', async () => {
    mocked.getActiveJobForUser.mockReturnValueOnce({ id: 'active-job' });
    const reusedRes = createResponse();
    await feedController.startRefresh(createRequest(), reusedRes);
    expect(reusedRes.json).toHaveBeenCalledWith({
      jobId: 'active-job',
      reused: true
    });

    mocked.getActiveJobForUser.mockReturnValueOnce(null);
    mocked.createJob.mockReturnValue('new-job');
    const startedRes = createResponse();
    await feedController.startRefresh(createRequest(), startedRes);

    expect(mocked.publishEvent).toHaveBeenCalledWith('new-job', {
      type: 'progress',
      stage: 'queued',
      message: 'Refresh job queued'
    });
    expect(mocked.performCrawl).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ triggerType: 'api' })
    );
    expect(startedRes.json).toHaveBeenCalledWith({ jobId: 'new-job' });
  });

  it('forwards crawl progress and publishes asynchronous crawl failures', async () => {
    mocked.createJob.mockReturnValue('new-job');
    mocked.performCrawl.mockRejectedValue(new Error('crawl failed'));
    const res = createResponse();

    await feedController.startRefresh(createRequest(), res);
    const crawlOptions = mocked.performCrawl.mock.calls[0][1];
    crawlOptions.onProgress({ type: 'progress', stage: 'fetching' });

    expect(mocked.publishEvent).toHaveBeenCalledWith('new-job', {
      type: 'progress',
      stage: 'fetching'
    });
    await vi.waitFor(() => {
      expect(mocked.publishEvent).toHaveBeenCalledWith('new-job', {
        type: 'error',
        message: 'crawl failed'
      });
    });
  });

  it('validates refresh authentication and reports setup failures', async () => {
    const unauthorizedRes = createResponse();
    await feedController.startRefresh(
      createRequest({ userData: {} }),
      unauthorizedRes
    );
    expect(unauthorizedRes.status).toHaveBeenCalledWith(401);

    mocked.getActiveJobForUser.mockImplementation(() => {
      throw new Error('job manager failed');
    });
    const failureRes = createResponse();
    await feedController.startRefresh(createRequest(), failureRes);
    expect(failureRes.status).toHaveBeenCalledWith(500);
  });

  it('recalculates feed trust for the authenticated user', async () => {
    mocked.calculateFeedTrust.mockResolvedValue({
      feedsUpdated: 4
    });
    const res = createResponse();

    await feedController.recalculateFeedTrust(createRequest(), res);

    expect(mocked.calculateFeedTrust).toHaveBeenCalledWith({ userId: 42 });
    expect(res.json).toHaveBeenCalledWith({
      message: 'Feed trust recalculated',
      feedsUpdated: 4
    });
  });

  it('validates trust recalculation and handles failures', async () => {
    const unauthorizedRes = createResponse();
    await feedController.recalculateFeedTrust(
      createRequest({ userData: {} }),
      unauthorizedRes
    );
    expect(unauthorizedRes.status).toHaveBeenCalledWith(401);

    mocked.calculateFeedTrust.mockRejectedValue(new Error('trust failed'));
    const failureRes = createResponse();
    await feedController.recalculateFeedTrust(createRequest(), failureRes);
    expect(failureRes.status).toHaveBeenCalledWith(500);
  });

  it('streams refresh events only for the job owner', async () => {
    vi.useFakeTimers();
    mocked.getJob.mockReturnValue({ id: 'job-1', userId: 42 });
    const req = createRequest();
    const res = createResponse();

    await feedController.streamRefreshEvents(req, res);

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/event-stream'
    );
    expect(res.write).toHaveBeenCalledWith(': connected\n\n');
    expect(mocked.subscribe).toHaveBeenCalledWith('job-1', req, res);

    const closeHandler = req.on.mock.calls.find(
      ([event]) => event === 'close'
    )[1];
    closeHandler();
    expect(mocked.unsubscribe).toHaveBeenCalledWith('job-1', res);
    vi.useRealTimers();
  });

  it('rejects missing, foreign, and unauthenticated refresh streams', async () => {
    const unauthorizedRes = createResponse();
    await feedController.streamRefreshEvents(
      createRequest({ userData: {} }),
      unauthorizedRes
    );
    expect(unauthorizedRes.status).toHaveBeenCalledWith(401);

    mocked.getJob.mockReturnValueOnce(null);
    const missingRes = createResponse();
    await feedController.streamRefreshEvents(createRequest(), missingRes);
    expect(missingRes.status).toHaveBeenCalledWith(404);

    mocked.getJob.mockReturnValueOnce({ id: 'job-1', userId: 99 });
    const foreignRes = createResponse();
    await feedController.streamRefreshEvents(createRequest(), foreignRes);
    expect(foreignRes.status).toHaveBeenCalledWith(404);
  });

  it('cleans up refresh streams when subscription or heartbeat delivery fails', async () => {
    vi.useFakeTimers();
    mocked.getJob.mockReturnValue({ id: 'job-1', userId: 42 });
    mocked.subscribe.mockReturnValueOnce(false);
    const unsubscribedRes = createResponse();

    await feedController.streamRefreshEvents(createRequest(), unsubscribedRes);

    expect(mocked.unsubscribe).toHaveBeenCalledWith('job-1', unsubscribedRes);

    mocked.subscribe.mockReturnValueOnce(true);
    const heartbeatRes = createResponse();
    heartbeatRes.write
      .mockImplementationOnce(() => true)
      .mockImplementationOnce(() => {
        throw new Error('connection closed');
      });

    await feedController.streamRefreshEvents(createRequest(), heartbeatRes);
    await vi.advanceTimersByTimeAsync(15_000);

    expect(mocked.unsubscribe).toHaveBeenCalledWith('job-1', heartbeatRes);
    expect(heartbeatRes.end).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('uses the appropriate refresh stream error response after headers are sent', async () => {
    mocked.getJob.mockImplementation(() => {
      throw new Error('stream failed');
    });
    const regularRes = createResponse();
    await feedController.streamRefreshEvents(createRequest(), regularRes);
    expect(regularRes.status).toHaveBeenCalledWith(500);

    const streamingRes = createResponse();
    streamingRes.headersSent = true;
    await feedController.streamRefreshEvents(createRequest(), streamingRes);
    expect(streamingRes.status).not.toHaveBeenCalled();
    expect(streamingRes.end).toHaveBeenCalled();
  });
});
