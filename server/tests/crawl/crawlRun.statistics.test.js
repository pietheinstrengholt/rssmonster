import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';

const mocked = vi.hoisted(() => ({
  discoverRssLink: vi.fn(),
  processArticle: vi.fn(),
  runPostCrawlSemanticPipeline: vi.fn()
}));

vi.mock('../../services/feeds/discoverRssLink.js', () => ({
  default: {
    discoverRssLink: mocked.discoverRssLink
  }
}));

vi.mock('../../services/crawl/index.js', () => ({
  processArticle: mocked.processArticle,
  runPostCrawlSemanticPipeline: mocked.runPostCrawlSemanticPipeline
}));

const { CrawlRun, User, Category, Feed } = db;
let crawlController;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// This function creates one user with one due feed for crawl statistics tests.
async function createUserFeed(prefix) {
  const username = uniqueName(prefix);
  const user = await User.create({
    username,
    password: 'secret',
    hash: uniqueName(`${prefix}hash`),
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

  return { user, feed };
}

describe('crawl run article statistics', () => {
  beforeAll(async () => {
    ({ default: crawlController } = await import('../../controllers/crawl.js'));
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    mocked.discoverRssLink.mockReset().mockImplementation(async (_url, feed) => ({
      url: feed.url,
      parsedFeed: {
        format: 'rss',
        title: feed.feedName,
        entries: [{ externalId: 'new' }, { externalId: 'updated' }]
      }
    }));
    mocked.processArticle.mockReset();
    mocked.runPostCrawlSemanticPipeline.mockReset();
  });

  it('persists successful insert and update totals on completion', async () => {
    const { user } = await createUserFeed('completedcrawlstats');
    mocked.processArticle
      .mockResolvedValueOnce({ newArticles: 1, updatedArticles: 0, errors: 0 })
      .mockResolvedValueOnce({ newArticles: 0, updatedArticles: 1, errors: 0 });

    await crawlController.performCrawl(user.id);

    const crawlRun = await CrawlRun.findOne({ where: { userId: user.id } });

    expect(crawlRun).toMatchObject({
      status: 'completed',
      newArticles: 1,
      updatedArticles: 1,
      articleErrors: 0,
      errors: 0,
      durationMs: expect.any(Number)
    });
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
      articleErrors: 0,
      errors: 0,
      durationMs: expect.any(Number)
    });
  });

  it('persists article errors and leaves the feed in an error state', async () => {
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
      totalArticleErrors: 2
    });
    expect(crawlRun).toMatchObject({
      status: 'completed',
      newArticles: 0,
      updatedArticles: 0,
      articleErrors: 2,
      errors: 1,
      durationMs: expect.any(Number)
    });
    expect(feed.errorCount).toBe(1);
    expect(feed.errorMessage).toBe('2 articles failed during processing');
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      type: 'progress',
      status: 'error',
      articleErrors: 2
    }));
  });

  it('persists accumulated totals when the crawl fails after article writes', async () => {
    const { user } = await createUserFeed('failedcrawlstats');
    const crawlError = new Error('Unable to update feed metadata');
    mocked.processArticle
      .mockResolvedValueOnce({ newArticles: 1, updatedArticles: 0, errors: 0 })
      .mockResolvedValueOnce({ newArticles: 0, updatedArticles: 1, errors: 0 });
    vi.spyOn(Feed.prototype, 'update').mockRejectedValue(crawlError);

    await expect(crawlController.performCrawl(user.id)).rejects.toBe(crawlError);

    const crawlRun = await CrawlRun.findOne({ where: { userId: user.id } });

    expect(crawlRun).toMatchObject({
      status: 'failed',
      errorMessage: crawlError.message,
      newArticles: 1,
      updatedArticles: 1,
      articleErrors: 0,
      errors: 0,
      durationMs: expect.any(Number)
    });
  });
});
