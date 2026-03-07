import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../models/index.js';
import { assignArticleToCluster } from '../controllers/cluster/assignArticleToCluster.js';

const { sequelize, User, Category, Feed, Article, ArticleCluster } = db;

const buildVector = (length = 32) =>
  Array.from({ length }, (_, i) => ((i % 5) + 1) / 10);

describe('assignArticleToCluster', () => {
  let user;
  let category;
  let feedA;
  let feedB;

  beforeAll(async () => {
    await sequelize.authenticate();

    const password = 'secret';
    const hash = await bcrypt.hash(password, 10);

    user = await User.create({
      username: `cluster-test-user-${Date.now()}`,
      password,
      hash,
      role: 'user'
    });

    category = await Category.create({
      userId: user.id,
      name: 'Cluster Test Category',
      categoryOrder: 0
    });

    feedA = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Cluster Feed A',
      url: `https://example.com/feed-a-${Date.now()}.xml`
    });

    feedB = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Cluster Feed B',
      url: `https://example.com/feed-b-${Date.now()}.xml`
    });
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('creates a new event cluster for first vectorized article', async () => {
    const eventVector = buildVector();
    const topicVector = buildVector();

    const article = await Article.create({
      userId: user.id,
      feedId: feedA.id,
      url: `https://example.com/article-cluster-new-${Date.now()}`,
      title: 'Cluster test: first article',
      description: 'First article for cluster creation test',
      contentOriginal: '<p>First article for cluster creation test</p>',
      contentStripped: 'First article for cluster creation test',
      eventVector,
      topicVector
    });

    await assignArticleToCluster(article.id);

    const assignedArticle = await Article.findByPk(article.id);
    expect(assignedArticle.clusterId).toBeTruthy();

    const cluster = await ArticleCluster.findByPk(assignedArticle.clusterId);
    expect(cluster).toBeTruthy();
    expect(cluster.representativeArticleId).toBe(article.id);
    expect(cluster.articleCount).toBe(1);
    expect(cluster.sourceCount).toBe(1);
    expect(cluster.sourceDiversityScore).toBeCloseTo(Math.log(2), 5);
  });

  it('assigns a similar article to existing cluster and updates source diversity', async () => {
    const eventVector = buildVector();
    const topicVector = buildVector();

    const firstArticle = await Article.create({
      userId: user.id,
      feedId: feedA.id,
      url: `https://example.com/article-cluster-seed-${Date.now()}`,
      title: 'Cluster test: seed article',
      description: 'Seed article for merge test',
      contentOriginal: '<p>Seed article for merge test</p>',
      contentStripped: 'Seed article for merge test',
      eventVector,
      topicVector
    });

    await assignArticleToCluster(firstArticle.id);

    const seeded = await Article.findByPk(firstArticle.id);
    expect(seeded.clusterId).toBeTruthy();

    const similarArticle = await Article.create({
      userId: user.id,
      feedId: feedB.id,
      url: `https://example.com/article-cluster-similar-${Date.now()}`,
      title: 'Cluster test: similar article',
      description: 'Similar article from another source',
      contentOriginal: '<p>Similar article from another source</p>',
      contentStripped: 'Similar article from another source',
      eventVector,
      topicVector
    });

    await assignArticleToCluster(similarArticle.id);

    const merged = await Article.findByPk(similarArticle.id);
    expect(merged.clusterId).toBe(seeded.clusterId);

    const cluster = await ArticleCluster.findByPk(seeded.clusterId);
    expect(cluster.articleCount).toBe(2);
    expect(cluster.sourceCount).toBe(2);
    expect(cluster.sourceDiversityScore).toBeCloseTo(Math.log(3), 5);
  });
});
