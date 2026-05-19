import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../models/index.js';
import { assignArticleToEvent } from '../services/events/assignArticleToEvent.js';

const { sequelize, User, Category, Feed, Article, Event, Topic } = db;

const buildVector = (length = 32, shift = 0) =>
  Array.from({ length }, (_, i) => (((i + shift) % 5) + 1) / 10);

const basisVector = (length = 32, index = 0) =>
  Array.from({ length }, (_, i) => (i === index ? 1 : 0));

describe('assignArticleToEvent', () => {
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

  it('creates a new event and topic for first vectorized article', async () => {
    const eventVector = buildVector(32, 0);
    const topicVector = buildVector(32, 0);

    const article = await Article.create({
      userId: user.id,
      feedId: feedA.id,
      url: `https://example.com/article-cluster-new-${Date.now()}`,
      title: 'Cluster test: first article',
      description: 'First article for cluster creation test',
      contentOriginal: '<p>First article for cluster creation test</p>',
      contentStripped: 'First article for cluster creation test'
    });

    await assignArticleToEvent(article.id, null, { eventVector, topicVector });

    const assignedArticle = await Article.findByPk(article.id);
    expect(assignedArticle.eventId).toBeTruthy();
    expect(assignedArticle.topicId).toBeTruthy();

    const event = await Event.findByPk(assignedArticle.eventId);
    const topic = await Topic.findByPk(assignedArticle.topicId);
    expect(event).toBeTruthy();
    expect(topic).toBeTruthy();
    expect(event.representativeArticleId).toBe(article.id);
    expect(event.articleCount).toBe(1);
    expect(event.sourceCount).toBe(1);
    expect(event.sourceDiversityScore).toBeCloseTo(Math.log(2), 5);
  });

  it('assigns a similar article to existing event and updates source diversity', async () => {
    // Use a different vector family than the previous test to avoid matching older test clusters.
    const eventVector = buildVector(32, 3);
    const topicVector = buildVector(32, 3);

    const firstArticle = await Article.create({
      userId: user.id,
      feedId: feedA.id,
      url: `https://example.com/article-cluster-seed-${Date.now()}`,
      title: 'Cluster test: seed article',
      description: 'Seed article for merge test',
      contentOriginal: '<p>Seed article for merge test</p>',
      contentStripped: 'Seed article for merge test'
    });

    await assignArticleToEvent(firstArticle.id, null, { eventVector, topicVector });

    const seeded = await Article.findByPk(firstArticle.id);
    expect(seeded.eventId).toBeTruthy();
    expect(seeded.topicId).toBeTruthy();

    const similarArticle = await Article.create({
      userId: user.id,
      feedId: feedB.id,
      url: `https://example.com/article-cluster-similar-${Date.now()}`,
      title: 'Cluster test: similar article',
      description: 'Similar article from another source',
      contentOriginal: '<p>Similar article from another source</p>',
      contentStripped: 'Similar article from another source'
    });

    await assignArticleToEvent(similarArticle.id, null, { eventVector, topicVector });

    const merged = await Article.findByPk(similarArticle.id);
    expect(merged.eventId).toBe(seeded.eventId);
    expect(merged.topicId).toBe(seeded.topicId);

    const event = await Event.findByPk(seeded.eventId);
    expect(event.articleCount).toBe(2);
    expect(event.sourceCount).toBe(2);
    expect(event.sourceDiversityScore).toBeCloseTo(Math.log(3), 5);
  });

  it('promotes a cross-topic candidate into the same event when semantic similarity is high', async () => {
    const eventVector = buildVector(32, 1);
    const firstTopicVector = basisVector(32, 0);
    const secondTopicVector = basisVector(32, 1);

    const firstArticle = await Article.create({
      userId: user.id,
      feedId: feedA.id,
      url: `https://example.com/article-cross-topic-seed-${Date.now()}`,
      title: 'GPT 6 launch preview shocks developers',
      description: 'A preview article about the GPT 6 launch event',
      contentOriginal: '<p>A preview article about the GPT 6 launch event</p>',
      contentStripped: 'A preview article about the GPT 6 launch event'
    });

    await assignArticleToEvent(firstArticle.id, null, {
      eventVector,
      topicVector: firstTopicVector
    });

    const seeded = await Article.findByPk(firstArticle.id);
    expect(seeded.eventId).toBeNull();
    expect(seeded.topicId).toBeTruthy();

    const initialTopicId = seeded.topicId;

    const secondArticle = await Article.create({
      userId: user.id,
      feedId: feedB.id,
      url: `https://example.com/article-cross-topic-match-${Date.now()}`,
      title: 'GPT 6 launch briefing expands rollout details',
      description: 'A follow up article describing the GPT 6 launch event',
      contentOriginal: '<p>A follow up article describing the GPT 6 launch event</p>',
      contentStripped: 'A follow up article describing the GPT 6 launch event'
    });

    await assignArticleToEvent(secondArticle.id, null, {
      eventVector,
      topicVector: secondTopicVector
    });

    const promoted = await Article.findByPk(secondArticle.id);
    const updatedSeed = await Article.findByPk(firstArticle.id);

    expect(promoted.eventId).toBeTruthy();
    expect(updatedSeed.eventId).toBe(promoted.eventId);
    expect(initialTopicId).not.toBe(promoted.topicId);

    const event = await Event.findByPk(promoted.eventId);
    expect(event).toBeTruthy();
    expect(event.articleCount).toBe(2);
    expect(event.sourceCount).toBe(2);
  });
});
