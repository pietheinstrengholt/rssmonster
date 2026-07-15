import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

const { CrawlRun, User, sequelize } = db;

let app;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// This function creates a signed authorization header for test requests.
const authHeaderFor = user => {
  const token = jwt.sign(
    {
      username: user.username,
      userId: user.id
    },
    getJwtSecret()
  );

  return `Bearer ${token}`;
};

// This function creates a user for crawl statistics endpoint tests.
const createUser = () => User.create({
  username: uniqueName('crawl-statistics-user'),
  password: 'hashed-password',
  hash: uniqueName('crawl-statistics-hash'),
  role: 'user'
});

describe('settings crawl statistics', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('returns recent daily terminal crawl totals scoped to the authenticated user', async () => {
    const [user, otherUser] = await Promise.all([createUser(), createUser()]);
    const startedAt = new Date();
    const previousStartedAt = new Date(startedAt);
    previousStartedAt.setDate(previousStartedAt.getDate() - 1);

    await CrawlRun.bulkCreate([
      {
        userId: user.id,
        status: 'completed',
        startedAt,
        completedAt: new Date(),
        newArticles: 2,
        updatedArticles: 1
      },
      {
        userId: user.id,
        status: 'completed',
        startedAt,
        completedAt: new Date(),
        newArticles: 3,
        updatedArticles: 4
      },
      {
        userId: user.id,
        status: 'failed',
        startedAt,
        completedAt: new Date(),
        errorMessage: 'Feed unavailable',
        newArticles: 1,
        updatedArticles: 2
      },
      {
        userId: user.id,
        status: 'failed',
        startedAt: previousStartedAt,
        completedAt: new Date(),
        errorMessage: 'Earlier failure',
        newArticles: 4,
        updatedArticles: 5
      },
      {
        userId: otherUser.id,
        status: 'completed',
        startedAt,
        completedAt: new Date(),
        newArticles: 100,
        updatedArticles: 100
      }
    ]);

    const res = await request(app)
      .get('/api/setting/crawl-statistics?days=7')
      .set('Authorization', authHeaderFor(user));

    expect(res.status).toBe(200);
    expect(res.body.days).toBe(7);
    expect(res.body.crawlStatistics).toHaveLength(2);
    expect(res.body.crawlStatistics[0]).toMatchObject({
      newArticles: 6,
      updatedArticles: 7,
      completedCrawls: 2,
      failedCrawls: 1
    });
    expect(res.body.crawlStatistics[1]).toMatchObject({
      newArticles: 4,
      updatedArticles: 5,
      completedCrawls: 0,
      failedCrawls: 1
    });
    expect(res.body.crawlStatistics[0].date >= res.body.crawlStatistics[1].date).toBe(true);
  });

  it.each(['0', '366', 'invalid'])('rejects an invalid days range of %s', async days => {
    const user = await createUser();

    const res = await request(app)
      .get(`/api/setting/crawl-statistics?days=${days}`)
      .set('Authorization', authHeaderFor(user));

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('days must be an integer between 1 and 365');
  });
});
