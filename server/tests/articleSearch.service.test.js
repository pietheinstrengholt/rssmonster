import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../models/index.js';
import { searchArticles } from '../util/articleSearch.service.js';

const { sequelize, User, Category, Feed, Article, Tag, Setting } = db;

describe('articleSearch.service', () => {
  let user;
  let category;
  let feed;
  const articles = {};

  beforeAll(async () => {
    await sequelize.authenticate();

    // ---- User ----
    const password = 'secret';
    const hash = await bcrypt.hash(password, 10);
    user = await User.create({
      username: 'searchtestuser',
      password,
      hash,
      role: 'user'
    });

    // ---- Category ----
    category = await Category.create({
      userId: user.id,
      name: 'Search Test Category',
      categoryOrder: 0
    });

    // ---- Feed ----
    feed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Search Test Feed',
      url: 'https://example.com/search-test.xml'
    });

    // ---- Settings (default score thresholds) ----
    await Setting.create({
      userId: user.id,
      categoryId: '%',
      feedId: '%',
      status: 'unread',
      sort: 'DESC',
      minAdvertisementScore: 0,
      minSentimentScore: 0,
      minQualityScore: 0,
      viewMode: 'full',
      clusterView: 'all'
    });

    // ---- Articles with diverse properties ----
    const now = new Date();
    const hoursAgo = (h) => new Date(now.getTime() - h * 60 * 60 * 1000);

    articles.recent = await Article.create({
      userId: user.id,
      feedId: feed.id,
      url: 'https://example.com/article-recent',
      title: 'Breaking: JavaScript Framework Released',
      description: 'A new JavaScript framework has been released today.',
      contentOriginal: '<p>A new JavaScript framework has been released today with exciting features.</p>',
      contentStripped: 'A new JavaScript framework has been released today with exciting features.',
      status: 'unread',
      published: hoursAgo(1),
      advertisementScore: 90,
      sentimentScore: 80,
      qualityScore: 85
    });

    articles.old = await Article.create({
      userId: user.id,
      feedId: feed.id,
      url: 'https://example.com/article-old',
      title: 'Python Tips and Tricks',
      description: 'A collection of Python programming tips.',
      contentOriginal: '<p>Here are some useful Python programming tips and tricks for developers.</p>',
      contentStripped: 'Here are some useful Python programming tips and tricks for developers.',
      status: 'unread',
      published: hoursAgo(72),
      advertisementScore: 70,
      sentimentScore: 70,
      qualityScore: 70
    });

    articles.starred = await Article.create({
      userId: user.id,
      feedId: feed.id,
      url: 'https://example.com/article-starred',
      title: 'Rust Memory Safety Guide',
      description: 'Understanding memory safety in Rust programming language.',
      contentOriginal: '<p>Rust provides memory safety without garbage collection through its ownership system.</p>',
      contentStripped: 'Rust provides memory safety without garbage collection through its ownership system.',
      status: 'read',
      starInd: 1,
      published: hoursAgo(24),
      advertisementScore: 95,
      sentimentScore: 90,
      qualityScore: 90
    });

    articles.clicked = await Article.create({
      userId: user.id,
      feedId: feed.id,
      url: 'https://example.com/article-clicked',
      title: 'Docker Container Best Practices',
      description: 'Best practices for Docker containers in production.',
      contentOriginal: '<p>Learn the best practices for running Docker containers in production environments.</p>',
      contentStripped: 'Learn the best practices for running Docker containers in production environments.',
      status: 'read',
      clickedAmount: 3,
      published: hoursAgo(48),
      advertisementScore: 80,
      sentimentScore: 75,
      qualityScore: 80
    });

    articles.lowQuality = await Article.create({
      userId: user.id,
      feedId: feed.id,
      url: 'https://example.com/article-low-quality',
      title: 'BUY NOW Amazing Product Deal!!!',
      description: 'Incredible limited time offer on amazing products.',
      contentOriginal: '<p>Buy our amazing product now! Limited time offer! Act fast!</p>',
      contentStripped: 'Buy our amazing product now! Limited time offer! Act fast!',
      status: 'unread',
      published: hoursAgo(6),
      advertisementScore: 10,
      sentimentScore: 30,
      qualityScore: 20
    });

    // ---- Tags ----
    await Tag.create({ articleId: articles.recent.id, userId: user.id, name: 'javascript' });
    await Tag.create({ articleId: articles.recent.id, userId: user.id, name: 'framework' });
    await Tag.create({ articleId: articles.starred.id, userId: user.id, name: 'rust' });
    await Tag.create({ articleId: articles.clicked.id, userId: user.id, name: 'docker' });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // ============================
  // Basic queries
  // ============================

  describe('basic queries', () => {
    it('returns unread articles by default', async () => {
      const result = await searchArticles({ userId: user.id });
      // recent, old, lowQuality are unread
      expect(result.itemIds).toContain(articles.recent.id);
      expect(result.itemIds).toContain(articles.old.id);
      expect(result.itemIds).toContain(articles.lowQuality.id);
      // starred and clicked are read
      expect(result.itemIds).not.toContain(articles.starred.id);
      expect(result.itemIds).not.toContain(articles.clicked.id);
    });

    it('throws when userId is missing', async () => {
      await expect(searchArticles({})).rejects.toThrow('Missing userId');
    });

    it('returns all statuses when status is %', async () => {
      const result = await searchArticles({ userId: user.id, status: '%' });
      expect(result.itemIds.length).toBe(5);
    });

    it('returns starred articles when status is star', async () => {
      const result = await searchArticles({ userId: user.id, status: 'star' });
      expect(result.itemIds).toContain(articles.starred.id);
      expect(result.itemIds.length).toBe(1);
    });
  });

  // ============================
  // Text search
  // ============================

  describe('text search', () => {
    it('searches title and content with unquoted words', async () => {
      const result = await searchArticles({ userId: user.id, search: 'JavaScript', status: '%' });
      expect(result.itemIds).toContain(articles.recent.id);
    });

    it('searches with quoted exact phrase', async () => {
      const result = await searchArticles({ userId: user.id, search: '"memory safety"', status: '%' });
      expect(result.itemIds).toContain(articles.starred.id);
      expect(result.itemIds).not.toContain(articles.recent.id);
    });

    it('combines title: filter with text search', async () => {
      const result = await searchArticles({ userId: user.id, search: 'title:Docker', status: '%' });
      expect(result.itemIds).toContain(articles.clicked.id);
      expect(result.itemIds).not.toContain(articles.recent.id);
    });

    it('supports title:"exact phrase" filter', async () => {
      const result = await searchArticles({ userId: user.id, search: 'title:"Python Tips"', status: '%' });
      expect(result.itemIds).toContain(articles.old.id);
      expect(result.itemIds.length).toBe(1);
    });
  });

  // ============================
  // Field filters via search string
  // ============================

  describe('field filters', () => {
    it('filters by star:true', async () => {
      const result = await searchArticles({ userId: user.id, search: 'star:true' });
      expect(result.itemIds).toContain(articles.starred.id);
      result.itemIds.forEach(id => {
        expect(id).toBe(articles.starred.id);
      });
    });

    it('filters by unread:true', async () => {
      const result = await searchArticles({ userId: user.id, search: 'unread:true' });
      expect(result.itemIds).toContain(articles.recent.id);
      expect(result.itemIds).not.toContain(articles.starred.id);
      expect(result.itemIds).not.toContain(articles.clicked.id);
    });

    it('filters by read:true', async () => {
      const result = await searchArticles({ userId: user.id, search: 'read:true' });
      expect(result.itemIds).toContain(articles.starred.id);
      expect(result.itemIds).toContain(articles.clicked.id);
      expect(result.itemIds).not.toContain(articles.recent.id);
    });

    it('filters by clicked:true', async () => {
      const result = await searchArticles({ userId: user.id, search: 'clicked:true' });
      expect(result.itemIds).toContain(articles.clicked.id);
      expect(result.itemIds).not.toContain(articles.recent.id);
    });

    it('combines multiple field filters', async () => {
      const result = await searchArticles({ userId: user.id, search: 'star:true read:true' });
      expect(result.itemIds).toContain(articles.starred.id);
      // clicked is read but not starred
      expect(result.itemIds).not.toContain(articles.clicked.id);
    });
  });

  // ============================
  // Score thresholds
  // ============================

  describe('score thresholds', () => {
    it('filters out articles below minAdvertisementScore', async () => {
      const result = await searchArticles({
        userId: user.id,
        status: '%',
        minAdvertisementScore: 50
      });
      // lowQuality has advertisementScore=10, should be filtered out
      expect(result.itemIds).not.toContain(articles.lowQuality.id);
      expect(result.itemIds).toContain(articles.recent.id);
    });

    it('filters out articles below minQualityScore', async () => {
      const result = await searchArticles({
        userId: user.id,
        status: '%',
        minQualityScore: 50
      });
      // lowQuality has qualityScore=20
      expect(result.itemIds).not.toContain(articles.lowQuality.id);
      expect(result.itemIds).toContain(articles.starred.id);
    });

    it('filters out articles below minSentimentScore', async () => {
      const result = await searchArticles({
        userId: user.id,
        status: '%',
        minSentimentScore: 60
      });
      // lowQuality has sentimentScore=30
      expect(result.itemIds).not.toContain(articles.lowQuality.id);
      expect(result.itemIds).toContain(articles.recent.id);
    });

    it('applies all score thresholds together', async () => {
      const result = await searchArticles({
        userId: user.id,
        status: '%',
        minAdvertisementScore: 70,
        minSentimentScore: 70,
        minQualityScore: 70
      });
      // Only articles meeting all three thresholds
      expect(result.itemIds).toContain(articles.old.id); // 70/70/70
      expect(result.itemIds).toContain(articles.starred.id); // 95/90/90
      expect(result.itemIds).toContain(articles.recent.id); // 90/80/85
      expect(result.itemIds).toContain(articles.clicked.id); // 80/75/80
      expect(result.itemIds).not.toContain(articles.lowQuality.id); // 10/30/20
    });
  });

  // ============================
  // Tag filtering
  // ============================

  describe('tag filtering', () => {
    it('filters by tag parameter', async () => {
      const result = await searchArticles({ userId: user.id, tag: 'javascript', status: '%' });
      expect(result.itemIds).toContain(articles.recent.id);
      expect(result.itemIds.length).toBe(1);
    });

    it('filters by tag: search token', async () => {
      const result = await searchArticles({ userId: user.id, search: 'tag:rust', status: '%' });
      expect(result.itemIds).toContain(articles.starred.id);
      expect(result.itemIds.length).toBe(1);
    });

    it('tag: search token overrides tag parameter', async () => {
      const result = await searchArticles({ userId: user.id, search: 'tag:docker', tag: 'javascript', status: '%' });
      expect(result.itemIds).toContain(articles.clicked.id);
      expect(result.itemIds).not.toContain(articles.recent.id);
    });
  });

  // ============================
  // Sort
  // ============================

  describe('sorting', () => {
    it('sorts by published DESC by default', async () => {
      const result = await searchArticles({ userId: user.id, status: '%' });
      // Articles should be newest first
      const recentIdx = result.itemIds.indexOf(articles.recent.id);
      const oldIdx = result.itemIds.indexOf(articles.old.id);
      expect(recentIdx).toBeLessThan(oldIdx);
    });

    it('sorts by published ASC when specified', async () => {
      const result = await searchArticles({ userId: user.id, sort: 'ASC', status: '%' });
      const recentIdx = result.itemIds.indexOf(articles.recent.id);
      const oldIdx = result.itemIds.indexOf(articles.old.id);
      expect(oldIdx).toBeLessThan(recentIdx);
    });

    it('sort: search token overrides sort parameter', async () => {
      const result = await searchArticles({ userId: user.id, search: 'sort:ASC', sort: 'DESC', status: '%' });
      const recentIdx = result.itemIds.indexOf(articles.recent.id);
      const oldIdx = result.itemIds.indexOf(articles.old.id);
      expect(oldIdx).toBeLessThan(recentIdx);
    });
  });

  // ============================
  // Limit
  // ============================

  describe('limit', () => {
    it('respects limit: search token', async () => {
      const result = await searchArticles({ userId: user.id, search: 'limit:2', status: '%' });
      expect(result.itemIds.length).toBe(2);
    });

    it('respects limitCount for smart folders', async () => {
      const result = await searchArticles({
        userId: user.id,
        status: '%',
        smartFolderSearch: true,
        limitCount: 3
      });
      expect(result.itemIds.length).toBe(3);
    });
  });

  // ============================
  // Date filters
  // ============================

  describe('date filters', () => {
    it('filters by @today (last 24h)', async () => {
      const result = await searchArticles({ userId: user.id, search: '@today', status: '%' });
      // recent (1h ago) and lowQuality (6h ago) are within 24h
      expect(result.itemIds).toContain(articles.recent.id);
      expect(result.itemIds).toContain(articles.lowQuality.id);
      // old (72h ago) is not within 24h
      expect(result.itemIds).not.toContain(articles.old.id);
    });

    it('filters by @lastweek', async () => {
      const result = await searchArticles({ userId: user.id, search: '@lastweek', status: '%' });
      // All articles are within 7 days
      expect(result.itemIds.length).toBe(5);
    });
  });

  // ============================
  // Response shape
  // ============================

  describe('response shape', () => {
    it('returns query metadata and itemIds array', async () => {
      const result = await searchArticles({ userId: user.id });
      expect(result).toHaveProperty('query');
      expect(result).toHaveProperty('itemIds');
      expect(result.query).toHaveProperty('userId', user.id);
      expect(Array.isArray(result.itemIds)).toBe(true);
    });

    it('echoes back search string in response', async () => {
      const result = await searchArticles({ userId: user.id, search: 'hello' });
      expect(result.query.search).toBe('hello');
    });

    it('echoes back tag filter in response', async () => {
      const result = await searchArticles({ userId: user.id, search: 'tag:docker', status: '%' });
      expect(result.query.tag).toBe('docker');
    });

    it('echoes back date token in response', async () => {
      const result = await searchArticles({ userId: user.id, search: '@today', status: '%' });
      expect(result.query.date).toBe('today');
    });
  });
});
