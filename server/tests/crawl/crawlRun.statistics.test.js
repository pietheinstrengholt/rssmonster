import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';

const mocked = vi.hoisted(() => ({
  acquireFeed: vi.fn(),
  createHotlinkBatcher: vi.fn(),
  hotlinkBatchFlush: vi.fn(),
  hotArticleCutoffDate: vi.fn(),
  processArticle: vi.fn(),
  runHotArticleReconciliation: vi.fn(),
  runPostCrawlSemanticPipeline: vi.fn()
}));

vi.mock('../../services/feeds/feedAcquisition.js', () => ({
  acquireFeed: mocked.acquireFeed
}));

vi.mock('../../services/crawl/runtime/hotlinkBatcher.js', () => ({
  default: mocked.createHotlinkBatcher
}));

vi.mock('../../services/crawl/index.js', () => ({
  hotArticleCutoffDate: mocked.hotArticleCutoffDate,
  processArticle: mocked.processArticle,
  runHotArticleReconciliation: mocked.runHotArticleReconciliation,
  runPostCrawlSemanticPipeline: mocked.runPostCrawlSemanticPipeline
}));

const { CrawlRun, FeedCrawlResult, User, Category, Feed } = db;
let crawlController;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// This function creates one user with one due feed for crawl statistics tests.
async function createUserFeed(prefix) {
  const username = uniqueName(prefix);
  const user = await User.create({
    username,
    password: 'secret',
    feverCredentialHash: uniqueName(`${prefix}hash`),
    role: 'user'
  });
  const category = await Category.create({
    userId: user.id,
    name: 'Statistics Category',
    categoryOrder: 0
  });
  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: 'Statistics Feed',
    url: `https://example.com/${username}.xml`
  });

  return { user, category, feed };
}

describe('crawl run article statistics', () => {
  beforeAll(async () => {
    ({ default: crawlController } = await import('../../controllers/crawl.js'));
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    mocked.acquireFeed.mockReset().mockImplementation(async ({ feed }) => ({
      type: 'changed',
      url: feed.url,
      parsedFeed: {
        format: 'rss',
        title: feed.feedName,
        entries: [{ externalId: 'new' }, { externalId: 'updated' }]
      }
    }));
    mocked.hotlinkBatchFlush.mockReset().mockResolvedValue(undefined);
    mocked.createHotlinkBatcher.mockReset().mockReturnValue({
      flush: mocked.hotlinkBatchFlush
    });
    mocked.processArticle.mockReset();
    mocked.hotArticleCutoffDate.mockReset().mockReturnValue(
      new Date('2026-08-21T12:00:00.000Z')
    );
    mocked.runHotArticleReconciliation.mockReset().mockResolvedValue({});
    mocked.runPostCrawlSemanticPipeline.mockReset();
  });

  it('persists successful insert and update totals on completion', async () => {
    const { user } = await createUserFeed('completedcrawlstats');
    mocked.processArticle
      .mockResolvedValueOnce({ newArticles: 1, updatedArticles: 0, errors: 0 })
      .mockResolvedValueOnce({ newArticles: 0, updatedArticles: 1, errors: 0 });

    await crawlController.performCrawl(user.id);

    expect(mocked.runHotArticleReconciliation).toHaveBeenCalledWith({
      processedUserIds: [user.id],
      cutoffDate: new Date('2026-08-21T12:00:00.000Z'),
      crawlRunId: expect.any(Number),
      executionId: expect.any(String),
      source: 'crawl'
    });
    expect(mocked.hotlinkBatchFlush.mock.invocationCallOrder[0])
      .toBeLessThan(mocked.runHotArticleReconciliation.mock.invocationCallOrder[0]);

    const crawlRun = await CrawlRun.findOne({ where: { userId: user.id } });
    const feedResult = await FeedCrawlResult.findOne({ where: { crawlRunId: crawlRun.id } });

    expect(crawlRun).toMatchObject({
      status: 'completed',
      newArticles: 1,
      updatedArticles: 1,
      articleErrors: 0,
      errors: 0,
      processedFeeds: 1,
      failedFeeds: 0,
      timedOutFeeds: 0,
      triggerType: 'api',
      durationMs: expect.any(Number)
    });
    expect(feedResult).toMatchObject({
      status: 'SUCCESS',
      attemptCount: 1,
      itemsFetched: 2,
      articlesNew: 1,
      articlesUpdated: 1,
      recoveryAttempted: false,
      recoverySucceeded: false
    });
  });

  it('runs the unchanged production pipeline for only the explicitly selected feed', async () => {
    const { user, category, feed } = await createUserFeed('manualsinglefeed');
    await feed.update({ status: 'error' });
    const otherFeed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Other due feed',
      url: `https://example.com/${uniqueName('other-due')}.xml`
    });
    mocked.processArticle.mockResolvedValue({
      newArticles: 1,
      updatedArticles: 0,
      errors: 0
    });

    const result = await crawlController.performCrawl(user.id, { feedId: feed.id });

    expect(result).toMatchObject({ total: 1, processed: 1, crawlOutcomes: { SUCCESS: 1 } });
    expect(await FeedCrawlResult.count({ where: { feedId: feed.id } })).toBe(1);
    expect(await FeedCrawlResult.count({ where: { feedId: otherFeed.id } })).toBe(0);
    await feed.reload();
    expect(feed).toMatchObject({
      status: 'active',
      lastCrawlStatus: 'SUCCESS',
      consecutiveFailures: 0,
      totalCrawlSuccesses: 1
    });
  });

  it.each([
    ['timeout', 'timed_out', 'TIMEOUT'],
    ['permanent failure', 'permanent_failure', 'NOT_FOUND']
  ])('counts a success plus %s as two processed terminal results', async (
    _label,
    failureType,
    expectedCategory
  ) => {
    const { user, category, feed } = await createUserFeed(
      `mixed${failureType}crawlstats`
    );
    const failedFeed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Failed Statistics Feed',
      url: `https://example.com/${uniqueName(failureType)}.xml`
    });
    mocked.acquireFeed.mockImplementation(async ({ feed: selectedFeed }) => {
      if (selectedFeed.id === feed.id) {
        return {
          type: 'changed',
          url: selectedFeed.url,
          parsedFeed: {
            format: 'rss',
            title: selectedFeed.feedName,
            entries: [{ externalId: 'new' }]
          }
        };
      }
      return {
        type: failureType,
        response: failureType === 'permanent_failure' ? { status: 404 } : null,
        error: {
          type: failureType,
          status: failureType === 'permanent_failure' ? 404 : null,
          message: `Terminal ${failureType}`
        }
      };
    });
    mocked.processArticle.mockResolvedValue({
      newArticles: 1,
      updatedArticles: 0,
      errors: 0
    });

    const result = await crawlController.performCrawl(user.id);
    const successful = Number(result.crawlOutcomes.SUCCESS || 0) +
      Number(result.crawlOutcomes.RECOVERED || 0) +
      Number(result.crawlOutcomes.EMPTY_FEED || 0);
    const failed = Object.values(result.crawlOutcomes)
      .reduce((sum, count) => sum + count, 0) - successful;

    expect(result).toMatchObject({
      total: 2,
      processed: 2,
      crawlOutcomes: { SUCCESS: 1, [expectedCategory]: 1 }
    });
    expect(result.processed).toBe(successful + failed);
    expect(await FeedCrawlResult.count({
      where: { feedId: [feed.id, failedFeed.id] }
    })).toBe(2);
  });

  it('emits one final feed result and one compact crawl summary', async () => {
    const { user, feed } = await createUserFeed('structuredcrawlresult');
    await feed.update({ status: 'error' });
    mocked.acquireFeed.mockResolvedValue({
      type: 'changed',
      url: 'https://example.com/recovered.xml',
      discovery: {
        attempts: 2,
        recovered: true,
        resolvedUrl: 'https://example.com/recovered.xml'
      },
      parsedFeed: {
        format: 'rss',
        title: feed.feedName,
        entries: [{ externalId: 'new' }]
      }
    });
    mocked.processArticle.mockResolvedValue({
      newArticles: 1,
      updatedArticles: 0,
      errors: 0
    });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await crawlController.performCrawl(user.id, { feedId: feed.id });
    const crawlRun = await CrawlRun.findOne({ where: { userId: user.id } });
    const feedResult = await FeedCrawlResult.findOne({ where: { crawlRunId: crawlRun.id } });

    const crawlLines = log.mock.calls
      .map(([line]) => line)
      .filter(line => String(line).startsWith('[CRAWL]'));
    expect(crawlLines).toHaveLength(2);
    expect(crawlLines[0]).toBe(`[CRAWL] Started iteration user=${user.id}`);
    expect(crawlLines[1]).toContain('status=success');
    expect(crawlLines[1]).toContain('resolved=example.com/recovered.xml');
    expect(crawlLines[1]).toContain('items=1 new=1 filtered=0 attempts=2');
    expect(result.crawlOutcomes).toEqual({ RECOVERED: 1 });
    expect(feedResult).toMatchObject({
      status: 'RECOVERED',
      requestedUrl: feed.url,
      resolvedUrl: 'https://example.com/recovered.xml',
      recoveryAttempted: true,
      recoverySucceeded: true,
      attemptCount: 2
    });
    await feed.reload();
    expect(feed.status).toBe('active');
  });

  it('does not count filtered inserts as new visible articles', async () => {
    const { user } = await createUserFeed('filteredcrawlstats');
    mocked.processArticle
      .mockResolvedValueOnce({
        newArticles: 0,
        filteredArticles: 1,
        updatedArticles: 0,
        errors: 0
      })
      .mockResolvedValueOnce({ newArticles: 0, updatedArticles: 0, errors: 0 });

    await crawlController.performCrawl(user.id);

    const crawlRun = await CrawlRun.findOne({ where: { userId: user.id } });

    expect(crawlRun).toMatchObject({
      status: 'completed',
      newArticles: 0,
      updatedArticles: 0,
      articlesFiltered: 1,
      articleErrors: 0,
      errors: 0,
      processedFeeds: 1,
      failedFeeds: 0,
      timedOutFeeds: 0,
      durationMs: expect.any(Number)
    });
  });

  it('compiles a configured filter once per feed and persists filtered totals', async () => {
    const { user, feed } = await createUserFeed('configuredfilterstats');
    await feed.update({ itemFilter: 'title:/accepted/i' });
    const onProgress = vi.fn();
    mocked.processArticle
      .mockResolvedValueOnce({
        newArticles: 0,
        updatedArticles: 0,
        filteredArticles: 1,
        errors: 0
      })
      .mockResolvedValueOnce({ newArticles: 1, updatedArticles: 0, errors: 0 });

    const result = await crawlController.performCrawl(user.id, { onProgress });
    const crawlRun = await CrawlRun.findOne({ where: { userId: user.id } });
    const feedResult = await FeedCrawlResult.findOne({ where: { crawlRunId: crawlRun.id } });
    const firstCompiledFilter = mocked.processArticle.mock.calls[0][10];

    expect(firstCompiledFilter).toMatchObject({
      expression: 'title:/accepted/i',
      field: 'title',
      negated: false
    });
    expect(mocked.processArticle.mock.calls[1][10]).toBe(firstCompiledFilter);
    expect(result.totalFilteredArticles).toBe(1);
    expect(crawlRun.articlesFiltered).toBe(1);
    expect(feedResult.articlesFiltered).toBe(1);
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      type: 'done',
      filteredArticles: 1
    }));
  });

  it('fails a feed observably when its stored filter cannot compile', async () => {
    const { user, feed } = await createUserFeed('invalidstoredfilter');
    await feed.update({ itemFilter: 'title:/[unterminated/' });

    const result = await crawlController.performCrawl(user.id);
    const crawlRun = await CrawlRun.findOne({ where: { userId: user.id } });
    const feedResult = await FeedCrawlResult.findOne({ where: { crawlRunId: crawlRun.id } });

    expect(mocked.processArticle).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      processed: 1,
      errors: 1,
      crawlOutcomes: { VALIDATION_ERROR: 1 }
    });
    expect(crawlRun).toMatchObject({ status: 'completed', failedFeeds: 1 });
    expect(feedResult).toMatchObject({
      status: 'FAILED',
      errorCategory: 'VALIDATION_ERROR',
      errorCode: 'FEED_ITEM_FILTER_INVALID',
      itemsFetched: 2,
      articlesFiltered: 0
    });
    expect(feedResult.errorMessage).toContain('Invalid item filter');
  });

  it.each(['unchanged', 'not_modified'])(
    'treats %s acquisition as success without article processing',
    async type => {
      const { user, feed } = await createUserFeed(`${type}crawlstats`);
      const completedAt = new Date();
      const cacheFreshUntil = new Date(completedAt.getTime() + 300000);
      await feed.update({
        etag: '"feed-v1"',
        contentHash: 'accepted-hash',
        lastPublishedAt: new Date(),
        observedEntryIntervalMs: 10 * 60 * 1000,
        consecutiveFailures: 2
      });
      mocked.acquireFeed.mockResolvedValue({
        type,
        bodyHash: 'accepted-hash',
        policy: {
          etag: '"feed-v2"',
          lastModified: null,
          cacheFreshUntil,
          retryAfterAt: null
        }
      });

      const result = await crawlController.performCrawl(user.id);
      await feed.reload();

      expect(result).toMatchObject({ processed: 1, errors: 0 });
      expect(mocked.processArticle).not.toHaveBeenCalled();
      expect(feed.lastFetchOutcome).toBe(type);
      expect(feed.lastSuccessAt).toBeInstanceOf(Date);
      expect(feed.lastChangedAt).toBeNull();
      expect(feed.lastPublishedAt).toBeInstanceOf(Date);
      expect(Number(feed.observedEntryIntervalMs)).toBe(10 * 60 * 1000);
      expect(feed.consecutiveFailures).toBe(0);
      expect(feed.etag).toBe('"feed-v2"');
      expect(feed.nextFetchAt.getTime()).toBeGreaterThanOrEqual(
        Math.floor(cacheFreshUntil.getTime() / 1000) * 1000
      );
      expect(feed.nextFetchAt.getTime()).toBeLessThanOrEqual(
        Math.floor(cacheFreshUntil.getTime() / 1000) * 1000 + 62000
      );
    }
  );

  it('updates cadence from publisher entries regardless of insertion outcome', async () => {
    const { user, feed } = await createUserFeed('cadencecrawlstats');
    await feed.update({
      lastPublishedAt: new Date('2026-07-01T08:00:00.000Z'),
      observedEntryIntervalMs: 2 * 60 * 60 * 1000
    });
    mocked.acquireFeed.mockResolvedValue({
      type: 'changed',
      url: feed.url,
      parsedFeed: {
        format: 'rss',
        title: feed.feedName,
        entries: [
          {
            externalId: 'new',
            publishedAt: new Date('2026-07-01T10:00:00.000Z')
          },
          {
            externalId: 'updated',
            publishedAt: new Date('2026-07-01T11:00:00.000Z')
          },
          {
            externalId: 'filtered',
            publishedAt: new Date('2026-07-01T11:30:00.000Z')
          }
        ]
      }
    });
    mocked.processArticle
      .mockResolvedValueOnce({ newArticles: 1, updatedArticles: 0, errors: 0 })
      .mockResolvedValueOnce({ newArticles: 0, updatedArticles: 1, errors: 0 })
      .mockResolvedValueOnce({
        newArticles: 0,
        filteredArticles: 1,
        updatedArticles: 0,
        errors: 0
      });

    await crawlController.performCrawl(user.id);
    await feed.reload();

    expect(feed.lastPublishedAt).toEqual(
      new Date('2026-07-01T11:30:00.000Z')
    );
    expect(Number(feed.observedEntryIntervalMs)).toBe(105 * 60 * 1000);
  });

  it('records article errors without relabeling a successful fetch', async () => {
    const { user, feed } = await createUserFeed('articleerrorcrawlstats');
    const onProgress = vi.fn();
    mocked.processArticle
      .mockResolvedValueOnce({ newArticles: 0, updatedArticles: 0, errors: 1 })
      .mockResolvedValueOnce({ newArticles: 0, updatedArticles: 0, errors: 1 });

    const result = await crawlController.performCrawl(user.id, { onProgress });

    const crawlRun = await CrawlRun.findOne({ where: { userId: user.id } });
    await feed.reload();

    expect(result).toMatchObject({
      errors: 1,
      processed: 1,
      totalArticleErrors: 2
    });
    expect(crawlRun).toMatchObject({
      status: 'completed',
      newArticles: 0,
      updatedArticles: 0,
      articleErrors: 2,
      errors: 1,
      processedFeeds: 1,
      failedFeeds: 1,
      timedOutFeeds: 0,
      durationMs: expect.any(Number)
    });
    expect(feed).toMatchObject({
      lastFetchOutcome: 'changed',
      consecutiveFailures: 1,
      errorCount: 0,
      errorMessage: null,
      status: 'active'
    });
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      type: 'progress',
      status: 'error',
      articleErrors: 2
    }));
  });

  it('persists accumulated totals when the crawl fails after article writes', async () => {
    const { user, feed } = await createUserFeed('failedcrawlstats');
    const crawlError = new Error('Unable to update feed metadata');
    mocked.processArticle
      .mockResolvedValueOnce({ newArticles: 1, updatedArticles: 0, errors: 0 })
      .mockResolvedValueOnce({ newArticles: 0, updatedArticles: 1, errors: 0 });
    const originalUpdate = Feed.update;
    // Fails the owner-checked terminal write that includes feed metadata.
    vi.spyOn(Feed, 'update').mockImplementation(function (values, options) {
      if (Object.hasOwn(values, 'feedType')) {
        return Promise.reject(crawlError);
      }
      return originalUpdate.call(this, values, options);
    });

    const crawlStartedAt = Date.now();
    const result = await crawlController.performCrawl(user.id);

    const crawlRun = await CrawlRun.findOne({ where: { userId: user.id } });
    await feed.reload();

    expect(result).toMatchObject({
      totalNewArticles: 1,
      totalUpdatedArticles: 1,
      errors: 1,
      processed: 1,
      failedFeeds: 1
    });
    expect(crawlRun).toMatchObject({
      status: 'completed',
      errorMessage: null,
      newArticles: 1,
      updatedArticles: 1,
      articleErrors: 0,
      errors: 1,
      processedFeeds: 1,
      failedFeeds: 1,
      timedOutFeeds: 0,
      durationMs: expect.any(Number)
    });
    expect(feed).toMatchObject({
      lastFetchOutcome: 'transient_failure',
      consecutiveFailures: 1,
      status: 'active',
      leaseOwner: null,
      leaseUntil: null
    });
    expect(feed.nextFetchAt.getTime()).toBeGreaterThan(crawlStartedAt);
  });

  it('records scheduled crawls separately from API crawls', async () => {
    const { user } = await createUserFeed('scheduledcrawlstats');
    mocked.processArticle.mockResolvedValue({
      newArticles: 0,
      updatedArticles: 0,
      errors: 0
    });

    await crawlController.performCrawl(user.id, { triggerType: 'scheduled' });

    const crawlRun = await CrawlRun.findOne({ where: { userId: user.id } });
    expect(crawlRun.triggerType).toBe('scheduled');
  });

  it.each([
    ['transient_failure', 500, 0, 'active', true, 4 * 60 * 60 * 1000],
    ['rate_limited', 503, 0, 'active', true, 4 * 60 * 60 * 1000],
    ['permanent_failure', 404, 0, 'active', true, 24 * 60 * 60 * 1000],
    ['permanent_failure', 410, 1, 'active', true, 24 * 60 * 60 * 1000],
    ['malformed', null, 0, 'active', true, 6 * 60 * 60 * 1000],
    ['malformed', null, 2, 'error', false, null],
    ['security_rejected', null, 0, 'error', false, null]
  ])('persists one atomic terminal transition for %s', async (
    outcomeType,
    statusCode,
    priorFailures,
    expectedStatus,
    retryable,
    minimumDelayMs
  ) => {
    const { user, feed } = await createUserFeed(`terminal${outcomeType}`);
    await feed.update({ consecutiveFailures: priorFailures });
    const retryAfterAt = outcomeType === 'rate_limited'
      ? new Date(Date.now() + minimumDelayMs)
      : null;
    mocked.acquireFeed.mockResolvedValue({
      type: outcomeType,
      response: statusCode === null ? null : { status: statusCode },
      policy: { retryAfterAt },
      error: {
        type: outcomeType,
        status: statusCode,
        message: `Diagnostic for ${outcomeType}`
      }
    });
    const updateSpy = vi.spyOn(Feed, 'update');
    const startedAt = Date.now();

    const result = await crawlController.performCrawl(user.id);

    const terminalCalls = updateSpy.mock.calls.filter(
      ([values]) => Object.hasOwn(values, 'lastFetchOutcome')
    );
    expect(terminalCalls).toHaveLength(1);
    expect(terminalCalls[0][0]).toMatchObject({
      lastFetchOutcome: outcomeType,
      consecutiveFailures: priorFailures + 1,
      errorCount: priorFailures + 1,
      errorMessage: `Diagnostic for ${outcomeType}`,
      status: expectedStatus,
      nextFetchAt: retryable ? expect.any(Date) : null
    });
    await feed.reload();
    expect(feed).toMatchObject({
      lastFetchOutcome: outcomeType,
      consecutiveFailures: priorFailures + 1,
      errorCount: priorFailures + 1,
      errorMessage: `Diagnostic for ${outcomeType}`,
      status: expectedStatus
    });
    expect(result).toMatchObject({ processed: 1, errors: 1, failedFeeds: 1 });
    expect(mocked.processArticle).not.toHaveBeenCalled();
    if (retryable) {
      expect(terminalCalls[0][0].nextFetchAt.getTime()).toBeGreaterThanOrEqual(
        startedAt + minimumDelayMs
      );
      expect(feed.nextFetchAt.getTime()).toBeGreaterThanOrEqual(
        Math.floor((startedAt + minimumDelayMs) / 1000) * 1000
      );
      expect(feed.nextFetchAt.getTime()).toBeLessThanOrEqual(
        Date.now() + minimumDelayMs + 62000
      );
    } else {
      expect(feed.nextFetchAt).toBeNull();
    }
  });
});
