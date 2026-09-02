import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  articleFindOne: vi.fn(),
  crawlFindAll: vi.fn(),
  crawlFindOne: vi.fn(),
  feedFindOne: vi.fn(),
  getDialect: vi.fn()
}));

const ERROR_CATEGORIES = [
  'TIMEOUT', 'NOT_FOUND', 'RATE_LIMITED', 'HTTP_ERROR', 'REDIRECT_LOOP',
  'NETWORK_ERROR', 'INVALID_FEED', 'MALFORMED_BODY', 'VALIDATION_ERROR',
  'EMPTY_FEED', 'SECURITY_REJECTED', 'TOO_LARGE', 'UNKNOWN_ERROR'
];

vi.mock('../../models/index.js', async () => {
  const { Sequelize } = await vi.importActual('sequelize');
  return {
    default: {
      Article: {
        findOne: mocked.articleFindOne,
        sequelize: { getDialect: mocked.getDialect }
      },
      Feed: { findOne: mocked.feedFindOne },
      FeedCrawlResult: {
        findAll: mocked.crawlFindAll,
        findOne: mocked.crawlFindOne,
        getAttributes: vi.fn(() => ({
          errorCategory: { values: ERROR_CATEGORIES }
        }))
      },
      Sequelize
    }
  };
});

vi.mock('../../services/duplicates/articleDuplicates.js', () => ({
  canonicalArticleWhere: vi.fn(() => ({
    duplicateOfArticleId: null,
    filteredInd: false
  }))
}));

const controller = (await import('../../controllers/feedObservability.js')).default;

// Builds one representative owned feed with cached crawl health state.
const ownedFeed = (overrides = {}) => {
  const data = {
    id: 8,
    userId: 42,
    feedName: 'Example Feed',
    url: 'https://example.com/feed.xml',
    feedType: 'rss',
    status: 'active',
    feedDuplicationRate: 0.125,
    feedTrust: 0.8,
    lastCrawlAt: new Date('2026-08-10T10:00:00.000Z'),
    lastCrawlStatus: 'RECOVERED',
    lastCrawlErrorCategory: null,
    lastSuccessfulCrawlAt: new Date('2026-08-10T10:00:00.000Z'),
    consecutiveFailures: 0,
    ...overrides
  };
  return { ...data, toJSON: vi.fn(() => data) };
};

// Builds the authenticated controller request contract.
const createRequest = (overrides = {}) => ({
  userData: { userId: 42 },
  params: { feedId: '8', crawlResultId: '90' },
  ...overrides
});

// Builds a chainable response recorder.
const createResponse = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

// Provides aggregate and list results in observability query order.
const mockObservabilityQueries = ({
  summary = {
    totalCrawls: '4', successful: '2', recovered: '1', failed: '1',
    averageDurationMs: '1250.4'
  },
  failures = [
    { errorCategory: 'TIMEOUT', count: '2' },
    { errorCategory: 'RATE_LIMITED', count: '1' }
  ],
  health = [
    { date: '2026-08-09', success: '1', recovered: '0', failed: '1' },
    { date: '2026-08-10', success: '1', recovered: '1', failed: '0' }
  ],
  recent = [
    { id: 92, status: 'RECOVERED', completedAt: new Date('2026-08-10T10:00:00.000Z') },
    { id: 91, status: 'SUCCESS', completedAt: new Date('2026-08-09T10:00:00.000Z') }
  ]
} = {}) => {
  mocked.crawlFindOne.mockResolvedValueOnce(summary);
  mocked.crawlFindAll
    .mockResolvedValueOnce(failures)
    .mockResolvedValueOnce(health)
    .mockResolvedValueOnce(recent);
  mocked.articleFindOne.mockResolvedValue({
    articleCount: '60',
    articleCount30Days: '45',
    lastArticleAt: new Date('2026-08-10T09:00:00.000Z')
  });
};

describe('feed observability controller', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocked.getDialect.mockReturnValue('mysql');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocked.feedFindOne.mockResolvedValue(ownedFeed());
    mockObservabilityQueries();
  });

  // Verifies the full screen contract and rolling operational calculations.
  it('returns feed health, summary, failures, statistics, timeline, and recent crawls', async () => {
    const res = createResponse();

    await controller.getFeedObservability(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      feed: expect.objectContaining({
        id: 8,
        feedName: 'Example Feed',
        health: 'RECOVERED',
        lastCrawlStatus: 'RECOVERED',
        consecutiveFailures: 0
      }),
      summary: {
        totalCrawls: 4,
        successful: 2,
        recovered: 1,
        failed: 1,
        successRatePct: 75,
        recoveryRatePct: 25,
        averageDurationMs: 1250
      },
      failures: expect.objectContaining({
        TIMEOUT: 2,
        RATE_LIMITED: 1,
        NOT_FOUND: 0,
        UNKNOWN_ERROR: 0
      }),
      statistics: {
        articleCount: 60,
        articlesPerDay: 1.5,
        duplicateRatePct: 12.5,
        trustScore: 0.8,
        lastArticleAt: new Date('2026-08-10T09:00:00.000Z')
      },
      crawlHealth: [
        { date: '2026-08-09', success: 1, recovered: 0, failed: 1 },
        { date: '2026-08-10', success: 1, recovered: 1, failed: 0 }
      ],
      recentCrawls: [
        expect.objectContaining({ id: 92 }),
        expect.objectContaining({ id: 91 })
      ]
    });
    expect(res.json.mock.calls[0][0].recentCrawls[0]).not
      .toHaveProperty('attemptSummary');
  });

  // Verifies recovered results contribute both operational success and failure cause.
  it('counts recovered success and its triggering failure category', async () => {
    mocked.crawlFindOne.mockReset();
    mocked.crawlFindAll.mockReset();
    mocked.articleFindOne.mockReset();
    mockObservabilityQueries({
      summary: {
        totalCrawls: '2', successful: '1', recovered: '1', failed: '0',
        averageDurationMs: '500'
      },
      failures: [{ errorCategory: 'NOT_FOUND', count: '1' }]
    });
    const res = createResponse();

    await controller.getFeedObservability(createRequest(), res);

    expect(res.json.mock.calls[0][0]).toMatchObject({
      summary: {
        totalCrawls: 2,
        successful: 1,
        recovered: 1,
        failed: 0,
        successRatePct: 100,
        recoveryRatePct: 50,
        averageDurationMs: 500
      },
      failures: { NOT_FOUND: 1 }
    });
  });

  // Verifies every aggregate and history query is scoped and recent aggregation is bounded.
  it('uses user/feed scope, a thirty-day window, and newest-first recent results', async () => {
    const now = new Date('2026-08-10T12:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const res = createResponse();

    try {
      await controller.getFeedObservability(createRequest(), res);
    } finally {
      vi.useRealTimers();
    }

    const summaryQuery = mocked.crawlFindOne.mock.calls[0][0];
    expect(summaryQuery.where).toMatchObject({ userId: 42, feedId: 8 });
    const completedAtOperator = Reflect.ownKeys(
      summaryQuery.where.completedAt
    )[0];
    expect(summaryQuery.where.completedAt[completedAtOperator]).toEqual(
      new Date('2026-07-11T12:00:00.000Z')
    );
    const recentQuery = mocked.crawlFindAll.mock.calls[2][0];
    expect(recentQuery).toMatchObject({
      where: { userId: 42, feedId: 8 },
      order: [['completedAt', 'DESC'], ['id', 'DESC']],
      limit: 20,
      raw: true
    });
    expect(recentQuery.attributes).not.toContain('attemptSummary');
  });

  // Keeps the rolling article aggregate valid without changing the MySQL expression.
  it.each([
    [
      'mysql',
      "SUM(CASE WHEN `publishedAt` >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN 1 ELSE 0 END)"
    ],
    [
      'sqlite',
      "SUM(CASE WHEN `publishedAt` >= datetime('now', '-30 days') THEN 1 ELSE 0 END)"
    ]
  ])('uses the %s rolling article-count expression', async (dialect, expectedSql) => {
    mocked.getDialect.mockReturnValue(dialect);
    const res = createResponse();

    await controller.getFeedObservability(createRequest(), res);

    const articleQuery = mocked.articleFindOne.mock.calls[0][0];
    expect(articleQuery.attributes[1]).toEqual([
      expect.objectContaining({ val: expectedSql }),
      'articleCount30Days'
    ]);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  // Verifies untouched feeds remain new with neutral rates and statistics.
  it('returns neutral rolling metrics for a new feed without crawl history', async () => {
    mocked.feedFindOne.mockResolvedValue(ownedFeed({
      lastCrawlAt: null,
      lastCrawlStatus: null,
      lastSuccessfulCrawlAt: null
    }));
    mocked.crawlFindOne.mockReset();
    mocked.crawlFindAll.mockReset();
    mocked.articleFindOne.mockReset();
    mockObservabilityQueries({
      summary: {
        totalCrawls: '0', successful: null, recovered: null, failed: null,
        averageDurationMs: null
      },
      failures: [],
      health: [],
      recent: []
    });
    mocked.articleFindOne.mockResolvedValueOnce(null);
    const res = createResponse();

    await controller.getFeedObservability(createRequest(), res);

    expect(res.json.mock.calls[0][0]).toMatchObject({
      feed: { health: 'NEW' },
      summary: {
        totalCrawls: 0,
        successRatePct: null,
        recoveryRatePct: null,
        averageDurationMs: null
      },
      statistics: {
        articleCount: 0,
        articlesPerDay: 0,
        lastArticleAt: null
      }
    });
  });

  // Verifies missing authentication and unowned feeds reveal no observability data.
  it('returns 401 without a user and 404 for a missing or foreign feed', async () => {
    const unauthorizedRes = createResponse();
    await controller.getFeedObservability(
      createRequest({ userData: {} }),
      unauthorizedRes
    );
    expect(unauthorizedRes.status).toHaveBeenCalledWith(401);

    mocked.feedFindOne.mockResolvedValueOnce(null);
    const missingRes = createResponse();
    await controller.getFeedObservability(createRequest(), missingRes);
    expect(missingRes.status).toHaveBeenCalledWith(404);
    expect(mocked.crawlFindOne).not.toHaveBeenCalled();
  });

  // Verifies expanded crawl details include attempt diagnostics for the selected feed only.
  it('returns one owned crawl detail including attemptSummary', async () => {
    mocked.feedFindOne.mockResolvedValueOnce({ id: 8 });
    mocked.crawlFindOne.mockReset();
    mocked.crawlFindOne.mockResolvedValueOnce({
      id: 90,
      status: 'FAILED',
      errorCategory: 'TIMEOUT',
      errorCode: 'BODY_TIMEOUT',
      httpStatus: 200,
      errorMessage: 'The fetch operation timed out',
      requestedUrl: 'https://example.com/feed.xml',
      resolvedUrl: 'https://example.com/feed.xml',
      recoveryAttempted: false,
      recoverySucceeded: false,
      attemptCount: 1,
      attemptSummary: [{ outcome: 'timed_out' }],
      itemsFetched: 0,
      articlesNew: 0,
      articlesUpdated: 0,
      articlesFiltered: 0,
      articlesUnchanged: 0,
      articlesDuplicate: 0,
      durationMs: 10000,
      startedAt: new Date('2026-08-10T09:59:50.000Z'),
      completedAt: new Date('2026-08-10T10:00:00.000Z')
    });
    const res = createResponse();

    await controller.getFeedCrawlDetail(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].crawl).toMatchObject({
      id: 90,
      errorCode: 'BODY_TIMEOUT',
      attemptSummary: [{ outcome: 'timed_out' }]
    });
    expect(mocked.crawlFindOne).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: '90', feedId: 8, userId: 42 }
    }));
  });

  // Verifies a crawl from another feed or user is indistinguishable from a missing result.
  it('returns 404 when the crawl does not belong to the requested owned feed', async () => {
    mocked.feedFindOne.mockResolvedValueOnce({ id: 8 });
    mocked.crawlFindOne.mockReset();
    mocked.crawlFindOne.mockResolvedValueOnce(null);
    const res = createResponse();

    await controller.getFeedCrawlDetail(createRequest(), res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: 'Crawl result not found' });
  });
});
