import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import crawlController from '../../controllers/crawl.js';
import db from '../../models/index.js';

const { sequelize, CrawlRun, User } = db;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe('crawl run lifecycle', () => {
  let user;
  let failingUser;

  beforeAll(async () => {
    await sequelize.authenticate();

    const password = 'secret';
    const hash = await bcrypt.hash(password, 10);
    const username = uniqueName('crawlrunlifecycle');

    user = await User.create({
      username,
      password,
      hash: `${username}-${hash}`,
      role: 'user'
    });

    const failingUsername = uniqueName('failingcrawlrunlifecycle');
    failingUser = await User.create({
      username: failingUsername,
      password,
      hash: `${failingUsername}-${hash}`,
      role: 'user'
    });

    const category = await db.Category.create({
      userId: failingUser.id,
      name: 'Failed Crawl Category',
      categoryOrder: 0
    });

    await db.Feed.create({
      userId: failingUser.id,
      categoryId: category.id,
      feedName: 'Failed Crawl Feed',
      url: 'https://example.com/failed-crawl.xml'
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates and completes exactly one row for a successful user crawl', async () => {
    const createSpy = vi.spyOn(CrawlRun, 'create');
    const updateSpy = vi.spyOn(CrawlRun.prototype, 'update');

    await crawlController.performCrawl(user.id);

    const crawlRuns = await CrawlRun.findAll({
      where: { userId: user.id }
    });

    expect(createSpy).toHaveBeenCalledOnce();
    expect(createSpy).toHaveBeenCalledWith({
      userId: user.id,
      status: 'running'
    });
    expect(updateSpy).toHaveBeenCalledOnce();
    expect(updateSpy).toHaveBeenCalledWith({
      status: 'completed',
      completedAt: expect.any(Date)
    });
    expect(crawlRuns).toHaveLength(1);
    expect(crawlRuns[0]).toMatchObject({
      userId: user.id,
      status: 'completed',
      errorMessage: null
    });
    expect(crawlRuns[0].startedAt).toBeInstanceOf(Date);
    expect(crawlRuns[0].completedAt).toBeInstanceOf(Date);
    expect(crawlRuns[0].completedAt.getTime()).toBeGreaterThanOrEqual(
      crawlRuns[0].startedAt.getTime()
    );
  });

  it('records a failed terminal state and rethrows the original crawl error', async () => {
    const crawlError = new Error('Unable to load crawl actions');
    const updateSpy = vi.spyOn(CrawlRun.prototype, 'update');
    vi.spyOn(db.Action, 'findAll').mockRejectedValueOnce(crawlError);

    await expect(crawlController.performCrawl(failingUser.id)).rejects.toBe(crawlError);

    const crawlRuns = await CrawlRun.findAll({
      where: { userId: failingUser.id }
    });

    expect(updateSpy).toHaveBeenCalledOnce();
    expect(updateSpy).toHaveBeenCalledWith({
      status: 'failed',
      completedAt: expect.any(Date),
      errorMessage: crawlError.message
    });
    expect(crawlRuns).toHaveLength(1);
    expect(crawlRuns[0]).toMatchObject({
      userId: failingUser.id,
      status: 'failed',
      errorMessage: crawlError.message
    });
    expect(crawlRuns[0].startedAt).toBeInstanceOf(Date);
    expect(crawlRuns[0].completedAt).toBeInstanceOf(Date);
    expect(crawlRuns[0].completedAt.getTime()).toBeGreaterThanOrEqual(
      crawlRuns[0].startedAt.getTime()
    );
  });

  it('rejects an overlapping crawl for the same user without creating another row', async () => {
    const username = uniqueName('overlappingcrawl');
    const overlapUser = await User.create({
      username,
      password: 'secret',
      hash: uniqueName('overlappingcrawlhash'),
      role: 'user'
    });
    const activeCrawlRun = await CrawlRun.create({
      userId: overlapUser.id,
      status: 'running'
    });
    const createSpy = vi.spyOn(CrawlRun, 'create');
    const onProgress = vi.fn();

    const result = await crawlController.performCrawlWithSemanticGrouping(
      overlapUser.id,
      { onProgress }
    );

    expect(createSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      userId: overlapUser.id,
      crawlRunId: activeCrawlRun.id,
      skipped: true,
      reused: true,
      reason: 'crawl_already_running'
    });
    expect(onProgress).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      type: 'done',
      event: 'crawl_already_running',
      message: 'Crawl already running for this user.',
      crawlRunId: activeCrawlRun.id
    }));
    expect(await CrawlRun.count({ where: { userId: overlapUser.id } })).toBe(1);
    await activeCrawlRun.reload();
    expect(activeCrawlRun.status).toBe('running');
    expect(activeCrawlRun.completedAt).toBeNull();
  });

  it('fails a stale running row before starting a replacement crawl', async () => {
    const username = uniqueName('stalecrawl');
    const staleUser = await User.create({
      username,
      password: 'secret',
      hash: uniqueName('stalecrawlhash'),
      role: 'user'
    });
    const staleCrawlRun = await CrawlRun.create({
      userId: staleUser.id,
      status: 'running',
      startedAt: new Date(Date.now() - 61 * 60 * 1000)
    });

    const result = await crawlController.performCrawl(staleUser.id);
    const crawlRuns = await CrawlRun.findAll({
      where: { userId: staleUser.id },
      order: [['id', 'ASC']]
    });

    expect(result.reason).toBeUndefined();
    expect(crawlRuns).toHaveLength(2);
    expect(crawlRuns[0]).toMatchObject({
      id: staleCrawlRun.id,
      status: 'failed'
    });
    expect(crawlRuns[0].completedAt).toBeInstanceOf(Date);
    expect(crawlRuns[0].errorMessage).toContain('marked stale');
    expect(crawlRuns[1].status).toBe('completed');
  });

  it('atomically rejects one of two simultaneous acquisitions for the same user', async () => {
    const username = uniqueName('atomiccrawl');
    const atomicUser = await User.create({
      username,
      password: 'secret',
      hash: uniqueName('atomiccrawlhash'),
      role: 'user'
    });
    const originalFindOne = CrawlRun.findOne.bind(CrawlRun);
    let acquisitionChecks = 0;
    vi.spyOn(CrawlRun, 'findOne').mockImplementation(options => {
      if (acquisitionChecks < 2) {
        acquisitionChecks += 1;
        return Promise.resolve(null);
      }

      return originalFindOne(options);
    });

    let releaseFeedLookup;
    let markFeedLookupStarted;
    const feedLookupStarted = new Promise(resolve => {
      markFeedLookupStarted = resolve;
    });
    vi.spyOn(db.Feed, 'findAll').mockImplementation(() => new Promise(resolve => {
      releaseFeedLookup = () => resolve([]);
      markFeedLookupStarted();
    }));

    const firstAcquisition = crawlController.performCrawl(atomicUser.id);
    const secondAcquisition = crawlController.performCrawl(atomicUser.id);
    const [, rejectedAcquisition] = await Promise.all([
      feedLookupStarted,
      Promise.race([firstAcquisition, secondAcquisition])
    ]);

    expect(rejectedAcquisition).toMatchObject({
      userId: atomicUser.id,
      skipped: true,
      reused: true,
      reason: 'crawl_already_running'
    });

    releaseFeedLookup();
    const results = await Promise.all([firstAcquisition, secondAcquisition]);
    const crawlRuns = await CrawlRun.findAll({
      where: { userId: atomicUser.id }
    });

    expect(results.filter(result => result.skipped)).toHaveLength(1);
    expect(results.filter(result => !result.skipped)).toHaveLength(1);
    expect(crawlRuns).toHaveLength(1);
    expect(crawlRuns[0].status).toBe('completed');
  });

  it('safely arbitrates concurrent stale-run recovery attempts', async () => {
    const username = uniqueName('concurrentstalecrawl');
    const staleUser = await User.create({
      username,
      password: 'secret',
      hash: uniqueName('concurrentstalecrawlhash'),
      role: 'user'
    });
    const staleCrawlRun = await CrawlRun.create({
      userId: staleUser.id,
      status: 'running',
      startedAt: new Date(Date.now() - 61 * 60 * 1000)
    });
    const originalFindOne = CrawlRun.findOne.bind(CrawlRun);
    let acquisitionChecks = 0;
    vi.spyOn(CrawlRun, 'findOne').mockImplementation(options => {
      if (acquisitionChecks < 2) {
        acquisitionChecks += 1;
        return Promise.resolve(staleCrawlRun);
      }

      return originalFindOne(options);
    });

    let releaseFeedLookup;
    let markFeedLookupStarted;
    const feedLookupStarted = new Promise(resolve => {
      markFeedLookupStarted = resolve;
    });
    vi.spyOn(db.Feed, 'findAll').mockImplementation(() => new Promise(resolve => {
      releaseFeedLookup = () => resolve([]);
      markFeedLookupStarted();
    }));

    const firstRecovery = crawlController.performCrawl(staleUser.id);
    const secondRecovery = crawlController.performCrawl(staleUser.id);
    const [, rejectedRecovery] = await Promise.all([
      feedLookupStarted,
      Promise.race([firstRecovery, secondRecovery])
    ]);

    expect(rejectedRecovery.reason).toBe('crawl_already_running');

    releaseFeedLookup();
    const results = await Promise.all([firstRecovery, secondRecovery]);
    const crawlRuns = await CrawlRun.findAll({
      where: { userId: staleUser.id },
      order: [['id', 'ASC']]
    });

    expect(results.filter(result => result.skipped)).toHaveLength(1);
    expect(results.filter(result => !result.skipped)).toHaveLength(1);
    expect(crawlRuns).toHaveLength(2);
    expect(crawlRuns[0]).toMatchObject({
      id: staleCrawlRun.id,
      status: 'failed'
    });
    expect(crawlRuns[0].errorMessage).toContain('marked stale');
    expect(crawlRuns[1].status).toBe('completed');
  });

  it('allows a different user to crawl while another user has a running row', async () => {
    const activeUsername = uniqueName('activeotherusercrawl');
    const activeUser = await User.create({
      username: activeUsername,
      password: 'secret',
      hash: uniqueName('activeotherusercrawlhash'),
      role: 'user'
    });
    const allowedUsername = uniqueName('allowedotherusercrawl');
    const allowedUser = await User.create({
      username: allowedUsername,
      password: 'secret',
      hash: uniqueName('allowedotherusercrawlhash'),
      role: 'user'
    });
    await CrawlRun.create({
      userId: activeUser.id,
      status: 'running'
    });

    const result = await crawlController.performCrawl(allowedUser.id);
    const allowedCrawlRuns = await CrawlRun.findAll({
      where: { userId: allowedUser.id }
    });

    expect(result.reason).toBeUndefined();
    expect(allowedCrawlRuns).toHaveLength(1);
    expect(allowedCrawlRuns[0].status).toBe('completed');
  });
});
