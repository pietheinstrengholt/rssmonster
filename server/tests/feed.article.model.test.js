import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../models/index.js';
import {
  createRepresentativeFeeds,
  createRepresentativeClustersAndArticles,
  DOMAIN_TOPICS
} from './helpers/representativeContentFixtures.js';

const { sequelize, User, Category, Feed, Article } = db;

describe('Feed -> Article integration', () => {
  let user;
  let category;
  let feed;

  beforeAll(async () => {
    await sequelize.authenticate();

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

  it('creates many representative feeds and articles with stars/clicks', async () => {
    const representativeFeeds = await createRepresentativeFeeds({
      userId: user.id,
      categoryId: category.id,
      prefix: 'ARTICLE-MODEL',
      feedsPerDomain: 2,
      seed: 77
    });

    expect(representativeFeeds.length).toBe(DOMAIN_TOPICS.length * 2);

    const summary = await createRepresentativeClustersAndArticles({
      userId: user.id,
      feeds: representativeFeeds,
      prefix: 'ARTICLE-MODEL',
      days: 10,
      articlesPerFeedPerDay: 4,
      clickRate: 0.5,
      starRate: 0.22,
      negativeRate: 0.1,
      seed: 88
    });

    expect(summary.articleCount).toBeGreaterThan(200);
    expect(summary.clusterCount).toBeGreaterThan(10);
    expect(summary.starredCount).toBeGreaterThan(0);
    expect(summary.clickedCount).toBeGreaterThan(0);
  });
});
