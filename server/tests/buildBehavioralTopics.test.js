import { beforeEach, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../models/index.js';
import { resetDatabase } from './helpers/resetDb.js';
import { rebuildTopicsForUser } from '../services/events/reclusterForUser.js';
import { buildBehavioralTopicsForUser } from '../services/topics/buildBehavioralTopics.js';

const { Article, ArticleTopic, Category, EventTopic, Feed, Topic, User } = db;

// This function creates the minimal user/feed graph needed by article fixtures.
async function createUserGraph() {
  const hash = await bcrypt.hash('secret', 4);
  const user = await User.create({
    username: `behavioral-${Date.now()}`,
    password: 'secret',
    hash,
    role: 'user'
  });

  const category = await Category.create({
    userId: user.id,
    name: 'Behavioral',
    categoryOrder: 0
  });

  const feeds = await Feed.bulkCreate([
    {
      userId: user.id,
      categoryId: category.id,
      feedName: 'Feed A',
      url: 'https://example.com/a.xml'
    },
    {
      userId: user.id,
      categoryId: category.id,
      feedName: 'Feed B',
      url: 'https://example.com/b.xml'
    }
  ]);

  return { user, feeds };
}

// This function builds one engaged article fixture for behavioral clustering.
function articlePayload(userId, feedId, index, overrides = {}) {
  return {
    userId,
    feedId,
    title: `Behavioral preference ${index}`,
    url: `https://example.com/articles/${index}`,
    articleVector: [0.91 + index * 0.001, 0.08, 0.02],
    starInd: 0,
    clickedAmount: 0,
    attentionBucket: 3,
    published: new Date(`2026-05-${20 + index}T10:00:00.000Z`),
    ...overrides
  };
}

describe('buildBehavioralTopicsForUser', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('creates behavioral topics without requiring event linkage', async () => {
    const { user, feeds } = await createUserGraph();

    await Article.bulkCreate([
      articlePayload(user.id, feeds[0].id, 1, { starInd: 1 }),
      articlePayload(user.id, feeds[1].id, 2, { clickedAmount: 2 }),
      articlePayload(user.id, feeds[0].id, 3, { attentionBucket: 4 })
    ]);

    const result = await buildBehavioralTopicsForUser(user.id, {
      engagementThreshold: 6,
      communitySimilarityThreshold: 0.5
    });

    expect(result.topicCount).toBe(1);

    const topic = await Topic.findOne({
      where: {
        userId: user.id,
        topicType: 'behavioral'
      }
    });

    expect(topic).toBeTruthy();
    expect(topic.eventCount).toBe(0);
    expect(topic.evidenceScore).toBeGreaterThanOrEqual(6);
    expect(topic.behavioralArticleCount).toBe(3);
    expect(topic.lastBehaviorAt).toBeTruthy();

    const [eventTopicCount, articleTopicCount, articlesWithEvents] = await Promise.all([
      EventTopic.count({ where: { topicId: topic.id } }),
      ArticleTopic.count({ where: { topicId: topic.id } }),
      Article.count({ where: { userId: user.id, eventId: { [db.Sequelize.Op.ne]: null } } })
    ]);

    expect(eventTopicCount).toBe(0);
    expect(articleTopicCount).toBe(3);
    expect(articlesWithEvents).toBe(0);
  });

  it('does not clear behavioral article.topicId values during event topic rebuilds', async () => {
    const { user, feeds } = await createUserGraph();

    const articles = await Article.bulkCreate([
      articlePayload(user.id, feeds[0].id, 1, { starInd: 1 }),
      articlePayload(user.id, feeds[1].id, 2, { clickedAmount: 2 }),
      articlePayload(user.id, feeds[0].id, 3, { attentionBucket: 4 })
    ]);

    await buildBehavioralTopicsForUser(user.id, {
      engagementThreshold: 6,
      communitySimilarityThreshold: 0.5
    });

    const topic = await Topic.findOne({
      where: {
        userId: user.id,
        topicType: 'behavioral'
      }
    });

    await articles[0].update({ topicId: topic.id });
    await rebuildTopicsForUser(user.id);

    const reloadedArticle = await Article.findByPk(articles[0].id);
    expect(reloadedArticle.topicId).toBe(topic.id);
  });
});
