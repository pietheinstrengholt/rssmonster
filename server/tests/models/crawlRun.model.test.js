import { beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../../models/index.js';

const { sequelize, User, CrawlRun } = db;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe('CrawlRun model', () => {
  let user;

  beforeAll(async () => {
    await sequelize.authenticate();

    const password = 'secret';
    const hash = await bcrypt.hash(password, 10);
    const username = uniqueName('crawlrunuser');

    user = await User.create({
      username,
      password,
      hash: `${username}-${hash}`,
      role: 'user'
    });
  });

  it('creates a running crawl execution with nullable result fields', async () => {
    const crawlRun = await CrawlRun.create({
      userId: user.id
    });

    expect(crawlRun.id).toBeDefined();
    expect(crawlRun.userId).toBe(user.id);
    expect(crawlRun.status).toBe('running');
    expect(crawlRun.startedAt).toBeInstanceOf(Date);
    expect(crawlRun.completedAt).toBeNull();
    expect(crawlRun.errorMessage).toBeNull();
    expect(crawlRun.newArticles).toBeNull();
    expect(crawlRun.updatedArticles).toBeNull();
    expect(crawlRun.createdAt).toBeInstanceOf(Date);
    expect(crawlRun.updatedAt).toBeInstanceOf(Date);
  });

  it('declares only supported crawl statuses', () => {
    expect(CrawlRun.rawAttributes.status.values).toEqual([
      'running',
      'completed',
      'failed'
    ]);
  });

  it('declares nullable crawl article counters', () => {
    expect(CrawlRun.rawAttributes.newArticles.allowNull).toBe(true);
    expect(CrawlRun.rawAttributes.updatedArticles.allowNull).toBe(true);
  });

  it('allows multiple terminal crawl rows for the same user', async () => {
    const completedAt = new Date();
    const [completedRun, failedRun] = await Promise.all([
      CrawlRun.create({
        userId: user.id,
        status: 'completed',
        completedAt
      }),
      CrawlRun.create({
        userId: user.id,
        status: 'failed',
        completedAt,
        errorMessage: 'Historical failure'
      })
    ]);

    expect(completedRun.status).toBe('completed');
    expect(failedRun.status).toBe('failed');
  });

  it('uses the existing user ownership association conventions', async () => {
    const crawlRun = await CrawlRun.create({
      userId: user.id,
      status: 'completed',
      completedAt: new Date()
    });

    const owner = await crawlRun.getUser();

    expect(User.associations.crawl_runs).toMatchObject({
      as: 'crawl_runs',
      foreignKey: 'userId'
    });
    expect(User.associations.crawl_runs.options.onDelete).toBe('CASCADE');
    expect(CrawlRun.associations.user).toMatchObject({
      as: 'user',
      foreignKey: 'userId'
    });
    expect(owner.id).toBe(user.id);
  });
});
