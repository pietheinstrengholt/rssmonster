import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

describe('Overview feed receipt metadata', () => {
  let app;
  const users = [];
  beforeAll(async () => {
    app = (await import('../../app.js')).default;
    for (let index = 0; index < 2; index++) {
      users.push(await db.User.create({ username: `activity-${Date.now()}-${index}`, password: 'test-password' }));
    }
  }, 50_000);
  afterAll(async () => { for (const user of users) await user.destroy(); });

  it('returns owned feed receipt and subscription dates, including feeds without visible articles', async () => {
    const received = new Date('2026-07-01T00:00:00Z');
    const feeds = [];
    for (const user of users) {
      const category = await db.Category.create({ userId: user.id, name: 'Activity' });
      feeds.push(await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Activity feed', url: 'https://activity.test/feed', lastArticleReceivedAt: received }));
    }
    const token = jwt.sign({ userId: users[0].id, username: users[0].username }, getJwtSecret());
    for (const [method, path] of [['get', '/api/manager/overview-lite'], ['post', '/api/manager/overview']]) {
      const response = await request(app)[method](path).set('Authorization', `Bearer ${token}`).send({});
      expect(response.status).toBe(200);
      const result = response.body.categories.flatMap(category => category.feeds);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(feeds[0].id);
      expect(new Date(result[0].lastArticleReceivedAt)).toEqual(received);
      expect(new Date(result[0].createdAt).getTime()).toBeGreaterThan(0);
    }
  });
});
