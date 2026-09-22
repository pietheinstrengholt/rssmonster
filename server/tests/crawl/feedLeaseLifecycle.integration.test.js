import { CRAWL_FIELDS, saveCrawlSettings, clearCrawlSettings } from '../../services/crawl/configuration.js';
import { getFeedInputLimits } from '../../services/feeds/feedsmith/feedInputLimits.js';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import { Op } from 'sequelize';

const mocked = vi.hoisted(() => ({
  acquireFeed: vi.fn(),
  hotArticleCutoffDate: vi.fn(() => new Date('2026-08-21T12:00:00.000Z')),
  processArticle: vi.fn(),
  runHotArticleReconciliation: vi.fn(),
  runPostCrawlSemanticPipeline: vi.fn()
}));

vi.mock('../../services/feeds/feedAcquisition.js', () => ({
  acquireFeed: mocked.acquireFeed
}));

vi.mock('../../services/crawl/index.js', () => ({
  hotArticleCutoffDate: mocked.hotArticleCutoffDate,
  processArticle: mocked.processArticle,
  runHotArticleReconciliation: mocked.runHotArticleReconciliation,
  runPostCrawlSemanticPipeline: mocked.runPostCrawlSemanticPipeline
}));

import crawlController from '../../controllers/crawl.js';
import db from '../../models/index.js';
import { claimDueFeeds } from '../../services/feeds/feedClaims.js';
import { updateFeedSubscription } from '../../services/feeds/feedManagement.js';
import { deterministicJitterMs } from '../../services/feeds/feedScheduling.js';
import { parseFeedSourceIsolated } from '../../services/feeds/feedsmith/isolatedFeedParser.js';

const { Category, Feed, User, sequelize } = db;
let sequence = 0;
let ownedUserIds = [];

// Creates a collision-safe fixture value for the shared integration database.
const unique = prefix => `${prefix}-${Date.now()}-${++sequence}`;

// Waits without depending on the feed acquisition transport implementation.
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

// Creates a user and deterministic due feeds for one lifecycle scenario.
const createFixture = async feedCount => {
  const username = `${unique('lease-user')}@example.test`;
  const user = await User.create({
    username,
    password: 'test-password',
    feverCredentialHash: `${username}-hash`,
    role: 'user'
  });
  ownedUserIds.push(user.id);
  const category = await Category.create({
    userId: user.id,
    name: unique('Lease category'),
    categoryOrder: 0
  });
  const feeds = [];
  for (let index = 0; index < feedCount; index++) {
    feeds.push(await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: `Lease feed ${index + 1}`,
      url: `https://example.test/${unique(`lease-${index}`)}.xml`,
      nextFetchAt: new Date(Date.now() - 60_000 + index * 1000)
    }));
  }
  return { user, feeds };
};

// Builds a successful neutral acquisition result with one processable entry.
const successfulOutcome = feed => ({
  type: 'changed',
  url: feed.url,
  parsedFeed: {
    format: 'rss',
    title: feed.feedName,
    faviconUrl: null,
    entries: [{ externalId: `entry-${feed.id}` }]
  }
});

describe('crawl feed-lease lifecycle integration', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
  }, 50_000);

  beforeEach(() => {
    mocked.acquireFeed.mockReset().mockImplementation(async ({ feed }) =>
      successfulOutcome(feed));
    mocked.processArticle.mockReset();
    mocked.runHotArticleReconciliation.mockReset().mockResolvedValue({});
    mocked.runPostCrawlSemanticPipeline.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (ownedUserIds.length > 0) {
      await User.destroy({ where: { id: { [Op.in]: ownedUserIds } } });
    }
    ownedUserIds = [];
  });

  it('applies saved batch and lease limits to a real crawl invocation', async () => {
    const { user } = await createFixture(3);
    const values = Object.fromEntries(CRAWL_FIELDS.map(field => [field.key, field.suggestedValue ?? field.defaultValue]));
    values.FEED_MAX_COUNT = 1;
    values.FEED_MAX_ENTRIES = 7;
    await saveCrawlSettings({ overridden: true, values });
    try {
      let effectiveEntries;
      let remainingLease;
      mocked.acquireFeed.mockImplementation(async ({ feed }) => {
        effectiveEntries = getFeedInputLimits().entries;
        remainingLease = new Date(feed.leaseUntil).getTime() - Date.now();
        return { ...successfulOutcome(feed), parsedFeed: { format: 'rss', entries: [] } };
      });
      const result = await crawlController.performCrawl(user.id);
      expect(result).toMatchObject({ processed: 1, errors: 0 });
      expect(mocked.acquireFeed).toHaveBeenCalledOnce();
      expect(effectiveEntries).toBe(7);
      expect(remainingLease).toBeGreaterThan(590000);
    } finally { await clearCrawlSettings(); }
  });

  it.each([
    ['rss', '<rss version="2.0"><channel><title>RSS</title></channel></rss>'],
    ['atom', '<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title></feed>'],
    ['rdf', '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/"><channel rdf:about="https://example.test/feed"><title>RDF</title></channel></rdf:RDF>'],
    ['json', '{"version":"https://jsonfeed.org/version/1","title":"JSON Feed 1","items":[]}'],
    ['json', '{"version":"https://jsonfeed.org/version/1.1","title":"JSON Feed 1.1","items":[]}']
  ])('saves the detected %s format from the real parser over stale metadata', async (format, source) => {
    const { user, feeds: [feed] } = await createFixture(1);
    await feed.update({ feedType: format === 'rss' ? null : 'rss' });
    mocked.acquireFeed.mockImplementation(async ({ feed: acquiredFeed }) => ({
      ...successfulOutcome(acquiredFeed),
      parsedFeed: await parseFeedSourceIsolated(source, { feedUrl: acquiredFeed.url })
    }));

    const result = await crawlController.performCrawl(user.id, { parallel: false });

    expect(result).toMatchObject({ processed: 1, errors: 0 });
    await feed.reload();
    expect(feed.feedType).toBe(format);
  });

  it.each([
    ['rss', url => `<rss version="2.0"><channel><title>Icons</title><image><url>${url}</url></image></channel></rss>`],
    ['atom', url => `<feed xmlns="http://www.w3.org/2005/Atom"><title>Icons</title><icon>${url}</icon><logo>https://example.test/logo.png</logo></feed>`],
    ['rdf', url => `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/"><channel rdf:about="https://example.test/feed"><title>Icons</title><image rdf:resource="${url}" /></channel><image rdf:about="${url}"><url>${url}</url></image></rdf:RDF>`],
    ['json', url => JSON.stringify({ version: 'https://jsonfeed.org/version/1.1', title: 'Icons', favicon: url, icon: 'https://example.test/logo.png', items: [] })]
  ])('stores successive %s favicon locations from the parser even without articles', async (format, source) => {
    const { user, feeds: [feed] } = await createFixture(1);
    await feed.update({ favicon: 'https://example.test/old.ico' });

    for (const faviconUrl of ['https://cdn.example.test/new.png', 'https://cdn.example.test/latest.ico', 'https://cdn.example.test/latest.ico']) {
      // Model separate scheduled attempts despite the database's second-resolution timestamps.
      const previousAttempt = new Date(Date.now() - 60_000);
      await feed.update({
        nextFetchAt: previousAttempt,
        lastAttemptAt: previousAttempt,
        lastFetched: previousAttempt
      });
      mocked.acquireFeed.mockResolvedValue({
        ...successfulOutcome(feed),
        parsedFeed: await parseFeedSourceIsolated(source(faviconUrl), { feedUrl: feed.url })
      });

      const result = await crawlController.performCrawl(user.id, { parallel: false });

      expect(result).toMatchObject({ processed: 1, errors: 0 });
      await feed.reload();
      expect(feed.favicon).toBe(faviconUrl);
      expect(feed.feedType).toBe(format);
    }
  });

  it.each([null, `https://example.test/${'i'.repeat(255)}`])(
    'preserves the stored favicon when new metadata is missing or oversized (%s)', async faviconUrl => {
      const { user, feeds: [feed] } = await createFixture(1);
      await feed.update({ favicon: 'https://example.test/known.ico' });
      mocked.acquireFeed.mockResolvedValue({
        ...successfulOutcome(feed),
        parsedFeed: { format: 'rss', faviconUrl, entries: [] }
      });

      await crawlController.performCrawl(user.id, { parallel: false });

      await feed.reload();
      expect(feed.favicon).toBe('https://example.test/known.ico');
    }
  );

  it('passes the complete deadline and lease contract into acquisition', async () => {
    const { user } = await createFixture(1);
    let observedExecution = null;
    mocked.acquireFeed.mockImplementation(async ({ feed, execution }) => {
      observedExecution = execution;
      return successfulOutcome(feed);
    });
    mocked.processArticle.mockResolvedValue({
      newArticles: 1,
      updatedArticles: 0,
      errors: 0
    });

    await crawlController.performCrawl(user.id, {
      feedLeaseMs: 2000,
      feedTimeoutMs: 5000,
      crawlTimeoutMs: 10_000,
      parallel: false
    });

    expect(observedExecution).toMatchObject({
      deadlineAt: expect.any(Number),
      lease: {
        feedId: expect.any(Number),
        leaseOwner: expect.any(String)
      },
      leaseState: { lost: false },
      signal: expect.any(Object),
      assertLeaseOwnership: expect.any(Function),
      retargetLease: expect.any(Function)
    });
  });

  it('claims sequential feeds just in time when the batch outlives one lease', async () => {
    const { user, feeds } = await createFixture(2);
    let processedEntries = 0;
    mocked.processArticle.mockImplementation(async () => {
      if (processedEntries === 0) {
        const queuedFeed = await Feed.findByPk(feeds[1].id);
        expect(queuedFeed.leaseOwner).toBeNull();
        expect(queuedFeed.leaseUntil).toBeNull();
      }
      processedEntries += 1;
      await delay(1200);
      return { newArticles: 1, updatedArticles: 0, errors: 0 };
    });

    const result = await crawlController.performCrawl(user.id, {
      feedLeaseMs: 2000,
      feedTimeoutMs: 5000,
      crawlTimeoutMs: 10_000,
      parallel: false
    });

    expect(result).toMatchObject({ total: 2, processed: 2, errors: 0 });
    expect(processedEntries).toBe(2);
    const completedFeeds = await Feed.findAll({
      where: { id: { [Op.in]: feeds.map(feed => feed.id) } },
      order: [['id', 'ASC']]
    });
    expect(completedFeeds.every(feed => feed.leaseOwner === null)).toBe(true);
  });

  it('prevents a second worker from reclaiming a heartbeating feed', async () => {
    const { user, feeds } = await createFixture(1);
    let resolveProcessing;
    const processingStarted = new Promise(resolve => {
      mocked.processArticle.mockImplementation(() => {
        resolve();
        return new Promise(processingResolve => {
          resolveProcessing = processingResolve;
        });
      });
    });

    const crawlPromise = crawlController.performCrawl(user.id, {
      feedLeaseMs: 2000,
      feedTimeoutMs: 5000,
      crawlTimeoutMs: 10_000,
      parallel: false
    });
    await processingStarted;
    await delay(2300);

    const reclaimed = await claimDueFeeds({
      userId: user.id,
      limit: 1,
      leaseMs: 2000,
      leaseOwner: 'second-worker'
    });
    expect(reclaimed).toEqual([]);

    resolveProcessing({ newArticles: 1, updatedArticles: 0, errors: 0 });
    await expect(crawlPromise).resolves.toMatchObject({ processed: 1, errors: 0 });
    await feeds[0].reload();
    expect(feeds[0].leaseOwner).toBeNull();
  });

  it('stops terminal persistence after lease ownership is lost during processing', async () => {
    const { user, feeds } = await createFixture(1);
    mocked.processArticle.mockImplementation(async feed => {
      await Feed.update({
        leaseOwner: 'replacement-worker',
        leaseUntil: new Date(Date.now() + 60_000)
      }, { where: { id: feed.id } });
      return { newArticles: 1, updatedArticles: 0, errors: 0 };
    });

    const result = await crawlController.performCrawl(user.id, {
      feedLeaseMs: 2000,
      feedTimeoutMs: 1000,
      crawlTimeoutMs: 2000,
      parallel: false
    });

    await feeds[0].reload();
    expect(result).toMatchObject({ processed: 1, errors: 1, failedFeeds: 1 });
    expect(feeds[0]).toMatchObject({
      leaseOwner: 'replacement-worker',
      lastFetchOutcome: null
    });
  });

  it('leaves an unprocessed feed unclaimed when the crawl deadline stops the batch', async () => {
    const { user, feeds } = await createFixture(2);
    mocked.processArticle.mockImplementation(async () => {
      await delay(90);
      return { newArticles: 1, updatedArticles: 0, errors: 0 };
    });

    const result = await crawlController.performCrawl(user.id, {
      feedLeaseMs: 2000,
      feedTimeoutMs: 1000,
      crawlTimeoutMs: 40,
      parallel: false
    });

    await Promise.all(feeds.map(feed => feed.reload()));
    expect(result).toMatchObject({ total: 1, processed: 1, crawlTimedOut: true });
    expect(feeds[0].leaseOwner).toBeNull();
    expect(feeds[1]).toMatchObject({ leaseOwner: null, leaseUntil: null });
  });

  it('starts and completes owner-checked leases in parallel mode', async () => {
    const { user, feeds } = await createFixture(2);
    const activeFeedIds = new Set();
    mocked.processArticle.mockImplementation(async feed => {
      const activeFeed = await Feed.findByPk(feed.id);
      expect(activeFeed.leaseOwner).toEqual(expect.any(String));
      activeFeedIds.add(activeFeed.id);
      await delay(40);
      return { newArticles: 1, updatedArticles: 0, errors: 0 };
    });

    const result = await crawlController.performCrawl(user.id, {
      feedLeaseMs: 2000,
      feedTimeoutMs: 1000,
      crawlTimeoutMs: 2000,
      parallel: true
    });

    await Promise.all(feeds.map(feed => feed.reload()));
    expect(result).toMatchObject({ total: 2, processed: 2, errors: 0 });
    expect(activeFeedIds.size).toBe(2);
    expect(feeds.every(feed => feed.leaseOwner === null)).toBe(true);
    expect(Math.max(...mocked.processArticle.mock.invocationCallOrder))
      .toBeLessThan(mocked.runHotArticleReconciliation.mock.invocationCallOrder[0]);
  });

  it('bounds parallel feed processing without reducing the claimed batch', async () => {
    const { user, feeds } = await createFixture(5);
    let activeFeeds = 0;
    let maximumActiveFeeds = 0;
    mocked.acquireFeed.mockImplementation(async ({ feed }) => {
      activeFeeds += 1;
      maximumActiveFeeds = Math.max(maximumActiveFeeds, activeFeeds);
      await delay(40);
      activeFeeds -= 1;
      return successfulOutcome(feed);
    });
    mocked.processArticle.mockResolvedValue({
      newArticles: 1,
      updatedArticles: 0,
      errors: 0
    });

    const result = await crawlController.performCrawl(user.id, {
      feedLeaseMs: 2000,
      feedTimeoutMs: 1000,
      crawlTimeoutMs: 5000,
      parallel: true,
      parallelConcurrency: 2
    });

    expect(result).toMatchObject({ total: 5, processed: 5, errors: 0 });
    expect(maximumActiveFeeds).toBe(2);
    expect(mocked.acquireFeed).toHaveBeenCalledTimes(5);
    await Promise.all(feeds.map(feed => feed.reload()));
    expect(feeds.every(feed => feed.leaseOwner === null)).toBe(true);
  });

  it('enforces parallel concurrency across concurrent crawl invocations', async () => {
    const first = await createFixture(3);
    const second = await createFixture(3);
    let activeFeeds = 0;
    let maximumActiveFeeds = 0;
    let releaseAcquisitions;
    const acquisitionsReleased = new Promise(resolve => { releaseAcquisitions = resolve; });
    mocked.acquireFeed.mockImplementation(async ({ feed }) => {
      activeFeeds += 1;
      maximumActiveFeeds = Math.max(maximumActiveFeeds, activeFeeds);
      // Hold fetches until both slots are occupied, regardless of database latency.
      await acquisitionsReleased;
      activeFeeds -= 1;
      return successfulOutcome(feed);
    });
    mocked.processArticle.mockResolvedValue({
      newArticles: 1,
      updatedArticles: 0,
      errors: 0
    });

    const crawls = Promise.all([
      crawlController.performCrawl(first.user.id, {
        parallel: true,
        parallelConcurrency: 2,
        crawlTimeoutMs: 5000
      }),
      crawlController.performCrawl(second.user.id, {
        parallel: true,
        parallelConcurrency: 2,
        crawlTimeoutMs: 5000
      })
    ]);

    let results;
    try {
      await vi.waitFor(() => expect(activeFeeds).toBe(2), { timeout: 4000 });
    } finally {
      releaseAcquisitions();
      results = await crawls;
    }

    expect(results).toEqual([
      expect.objectContaining({ total: 3, processed: 3 }),
      expect.objectContaining({ total: 3, processed: 3 })
    ]);
    expect(maximumActiveFeeds).toBe(2);
  });

  it('enforces feed concurrency across concurrent sequential crawl invocations', async () => {
    const first = await createFixture(2);
    const second = await createFixture(2);
    let activeFeeds = 0;
    let maximumActiveFeeds = 0;
    mocked.acquireFeed.mockImplementation(async ({ feed }) => {
      activeFeeds += 1;
      maximumActiveFeeds = Math.max(maximumActiveFeeds, activeFeeds);
      await delay(40);
      activeFeeds -= 1;
      return successfulOutcome(feed);
    });
    mocked.processArticle.mockResolvedValue({
      newArticles: 1,
      updatedArticles: 0,
      errors: 0
    });

    const results = await Promise.all([
      crawlController.performCrawl(first.user.id, {
        parallel: false,
        parallelConcurrency: 1,
        crawlTimeoutMs: 5000
      }),
      crawlController.performCrawl(second.user.id, {
        parallel: false,
        parallelConcurrency: 1,
        crawlTimeoutMs: 5000
      })
    ]);

    expect(results).toEqual([
      expect.objectContaining({ total: 2, processed: 2 }),
      expect.objectContaining({ total: 2, processed: 2 })
    ]);
    expect(maximumActiveFeeds).toBe(1);
    expect(mocked.acquireFeed).toHaveBeenCalledTimes(4);
  });

  it('claims parallel feeds only when a worker is ready to start them', async () => {
    const { user, feeds } = await createFixture(3);
    let releaseFirstAcquisition;
    const firstAcquisitionStarted = new Promise(resolve => {
      mocked.acquireFeed.mockImplementationOnce(({ feed }) => {
        resolve();
        return new Promise(acquisitionResolve => {
          releaseFirstAcquisition = () => acquisitionResolve(successfulOutcome(feed));
        });
      });
    });
    mocked.processArticle.mockResolvedValue({
      newArticles: 1,
      updatedArticles: 0,
      errors: 0
    });

    const crawlPromise = crawlController.performCrawl(user.id, {
      parallel: true,
      parallelConcurrency: 1,
      feedLeaseMs: 2000,
      crawlTimeoutMs: 5000
    });
    await firstAcquisitionStarted;
    const queuedFeeds = await Feed.findAll({
      where: { id: { [Op.in]: feeds.slice(1).map(feed => feed.id) } },
      order: [['id', 'ASC']]
    });

    expect(queuedFeeds).toHaveLength(2);
    expect(queuedFeeds.every(feed => feed.leaseOwner === null)).toBe(true);
    expect(queuedFeeds.every(feed => feed.leaseUntil === null)).toBe(true);

    releaseFirstAcquisition();
    await expect(crawlPromise).resolves.toMatchObject({
      total: 3,
      processed: 3,
      errors: 0
    });
  });

  it('invalidates an old crawler lease when a manual endpoint is replaced', async () => {
    const { user, feeds } = await createFixture(1);
    const feed = feeds[0];
    const replacementUrl = `https://replacement.example.test/${unique('manual')}.xml`;
    const replacementAt = new Date('2026-08-09T12:00:00.000Z');
    await feed.update({
      etag: '"old"',
      contentHash: 'old-hash',
      lastPublishedAt: new Date('2026-08-08T00:00:00.000Z'),
      observedEntryIntervalMs: 60 * 60 * 1000,
      consecutiveFailures: 2,
      errorCount: 2,
      errorMessage: 'Old endpoint failed',
      errorSince: new Date('2026-08-08T00:00:00.000Z'),
      lastFetchOutcome: 'transient_failure'
    });
    let releaseProcessing;
    const processingStarted = new Promise(resolve => {
      mocked.processArticle.mockImplementation(() => {
        resolve();
        return new Promise(processingResolve => {
          releaseProcessing = processingResolve;
        });
      });
    });

    const crawlPromise = crawlController.performCrawl(user.id, {
      parallel: false,
      feedLeaseMs: 2000,
      feedTimeoutMs: 5000,
      crawlTimeoutMs: 10_000
    });
    await processingStarted;
    await updateFeedSubscription({
      userId: user.id,
      feedId: feed.id,
      updates: { url: replacementUrl },
      clock: () => replacementAt
    });
    releaseProcessing({ newArticles: 1, updatedArticles: 0, errors: 0 });
    await crawlPromise;
    await feed.reload();

    expect(feed).toMatchObject({
      url: replacementUrl,
      leaseOwner: null,
      leaseUntil: null,
      etag: null,
      contentHash: null,
      lastFetched: null,
      lastAttemptAt: null,
      lastSuccessAt: null,
      lastChangedAt: null,
      lastPublishedAt: null,
      observedEntryIntervalMs: null,
      consecutiveFailures: 0,
      errorCount: 0,
      errorMessage: null,
      errorSince: null,
      lastFetchOutcome: null
    });
    expect(feed.nextFetchAt.getTime()).toBe(
      Math.floor(
        (replacementAt.getTime() + deterministicJitterMs(feed.id)) / 1000
      ) * 1000
    );
  });
});
