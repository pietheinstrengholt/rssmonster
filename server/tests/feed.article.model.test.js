import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../models/index.js';
//import { resetDatabase } from './helpers/resetDb.js';

const { sequelize, User, Category, Feed, Article } = db;

describe('Feed -> Article integration', () => {
  let user;
  let category;
  let feed;

  beforeAll(async () => {
    await sequelize.authenticate();
    //await resetDatabase(); // HARD RESET

    // ---- User ----
    const password = 'secret';
    const hash = await bcrypt.hash(password, 10);

    user = await User.create({
      username: 'articletestuser',
      password,
      hash,
      role: 'user'
    });

    // ---- Category ----
    category = await Category.create({
      userId: user.id,
      name: 'Test Category'
    });

    // ---- Feed ----
    feed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Test Feed',
      url: 'https://example.com/rss.xml'
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('creates an article for a feed with defaults and virtuals', async () => {
    const article = await Article.create({
      userId: user.id,
      feedId: feed.id,
      url: 'https://example.com/article-1',
      title: 'Test Article',
      description: 'Short description',
      contentOriginal: 'Full article content'
    });

    // ---- Identity ----
    expect(article.id).toBeDefined();
    expect(article.userId).toBe(user.id);
    expect(article.feedId).toBe(feed.id);

    // ---- Required fields ----
    expect(article.url).toBe('https://example.com/article-1');
    expect(article.title).toBe('Test Article');

    // ---- Defaults ----
    expect(article.status).toBe('unread');
    expect(article.starInd).toBe(0);
    expect(article.clickedAmount).toBe(0);
    expect(article.openedCount).toBe(0);
    expect(article.attentionBucket).toBe(0);
    expect(article.media).toBe(false);

    // ---- Published ----
    expect(article.published).toBeInstanceOf(Date);

    // ---- Virtuals (must not throw) ----
    expect(article.freshness).toBeGreaterThan(0);
    expect(article.quality).toBeGreaterThan(0);
    expect(article.attentionScore).toBe(0);
    expect(article.uniqueness).toBe(1.0);
  });
});
