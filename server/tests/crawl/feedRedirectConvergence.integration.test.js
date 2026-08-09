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
  runPostCrawlSemanticPipeline: vi.fn()
}));

vi.mock('../../services/feeds/feedAcquisition.js', () => ({
  acquireFeed: mocked.acquireFeed
}));

vi.mock('../../services/crawl/index.js', () => ({
  processArticle: vi.fn(),
  runPostCrawlSemanticPipeline: mocked.runPostCrawlSemanticPipeline
}));

import crawlController from '../../controllers/crawl.js';
import db from '../../models/index.js';
import { persistDiscoveredFeedUrl, registerFeedUrlAliases } from '../../services/feeds/feedUrlAliases.js';
import { FETCH_OUTCOMES, createFetchOutcome } from '../../services/feeds/http/contracts.js';

const { Category, Feed, User, sequelize } = db;
let sequence = 0;
let ownedUserIds = [];

// Creates a collision-safe fixture value for the shared crawl database.
const unique = prefix => `${prefix}-${Date.now()}-${++sequence}`;

describe('crawl redirect convergence integration', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
  }, 50_000);

  beforeEach(() => {
    mocked.acquireFeed.mockReset();
    mocked.runPostCrawlSemanticPipeline.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    if (ownedUserIds.length > 0) {
      await User.destroy({ where: { id: { [Op.in]: ownedUserIds } } });
    }
    ownedUserIds = [];
  });

  it('reports success without incrementing feed errors when claimed feeds converge', async () => {
    const username = `${unique('crawl-converge')}@example.test`;
    const user = await User.create({
      username,
      password: 'test-password',
      feverCredentialHash: `${username}-hash`,
      role: 'user'
    });
    ownedUserIds.push(user.id);
    const category = await Category.create({
      userId: user.id,
      name: unique('Crawl category'),
      categoryOrder: 1
    });
    const targetUrl = `https://publisher.example.test/${unique('final')}.xml`;
    const stable = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Stable feed',
      url: targetUrl,
      lastSuccessAt: new Date('2026-08-08T00:00:00.000Z'),
      nextFetchAt: new Date('2026-08-01T00:00:00.000Z')
    });
    const duplicate = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Redirecting duplicate',
      url: `https://redirect.example.test/${unique('source')}`,
      nextFetchAt: new Date('2026-08-01T00:00:00.000Z')
    });
    await registerFeedUrlAliases({
      userId: user.id,
      feedId: stable.id,
      candidates: [{ originalUrl: stable.url, aliasType: 'final' }]
    });
    await registerFeedUrlAliases({
      userId: user.id,
      feedId: duplicate.id,
      candidates: [{ originalUrl: duplicate.url, aliasType: 'input' }]
    });
    mocked.acquireFeed.mockImplementation(async ({ feed, execution }) => {
      const survivor = await persistDiscoveredFeedUrl({
        feed,
        discoveredUrl: targetUrl,
        execution
      });
      return createFetchOutcome(FETCH_OUTCOMES.CHANGED, {
        feed: survivor,
        url: targetUrl,
        parsedFeed: {
          title: 'Publisher feed',
          format: 'rss',
          faviconUrl: null,
          entries: []
        }
      });
    });

    const result = await crawlController.performCrawl(user.id, {
      triggerType: 'api',
      suppressDoneEvent: true
    });

    expect(result).toMatchObject({ processed: 2, errors: 0, failedFeeds: 0 });
    expect(await Feed.count({ where: { userId: user.id } })).toBe(1);
    expect(await Feed.findByPk(duplicate.id)).toBeNull();
    expect(await Feed.findByPk(stable.id)).toMatchObject({
      errorCount: 0,
      consecutiveFailures: 0,
      url: targetUrl
    });
  });
});
