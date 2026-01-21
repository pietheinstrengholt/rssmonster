import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../models/index.js';

const { sequelize, User, Category, Feed } = db;

describe('Feed model', () => {
  let user;
  let category;

  beforeAll(async () => {
    // Ensure DB connection is alive
    await sequelize.authenticate();

    // ---- Create user ----
    const password = 'secret';
    const hash = await bcrypt.hash(password, 10);

    user = await User.create({
      username: 'feedtestuser',
      password,
      hash,
      role: 'user'
    });

    // ---- Create category (required by Feed) ----
    category = await Category.create({
      userId: user.id,
      name: 'Test Category',
      categoryOrder: 0
    });
  });

  afterAll(async () => {
    // Close DB connection to avoid hanging CI
    await sequelize.close();
  });

  it('creates a feed with defaults', async () => {
    const feed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Test Feed',
      url: 'https://example.com/rss.xml'
    });

    // ---- Identity ----
    expect(feed.id).toBeDefined();
    expect(feed.userId).toBe(user.id);
    expect(feed.categoryId).toBe(category.id);

    // ---- Fields ----
    expect(feed.feedName).toBe('Test Feed');
    expect(feed.url).toBe('https://example.com/rss.xml');

    // ---- Defaults ----
    expect(feed.status).toBe('active');
    expect(feed.feedTrust).toBe(0.5);
    expect(feed.feedDuplicationRate).toBe(0);
    expect(feed.errorCount).toBe(0);
    expect(feed.errorMessage).toBeNull();
    expect(feed.errorSince).toBeNull();
    expect(feed.lastFetched).toBeNull();
  });
});