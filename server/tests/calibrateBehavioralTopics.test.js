import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../models/index.js';
import { rebuildAllTopicsForUser } from '../services/reconcile/semanticPipelineScopes.js';
import { calibrateBehavioralTopicsForUser } from '../services/topics/behavioral/calibrateBehavioralTopics.js';

const { Article, ArticleTopic, Category, Event, EventTopic, Feed, Topic, User } = db;
let userSequence = 0;

// This function creates the minimal user/feed graph needed by article fixtures.
async function createUserGraph() {
  userSequence += 1;

  const hash = await bcrypt.hash('secret', 4);
  const user = await User.create({
    username: `behavioral-${Date.now()}-${userSequence}`,
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
    favoriteInd: 0,
    clickedAmount: 0,
    attentionBucket: 3,
    published: new Date(`2026-05-${20 + index}T10:00:00.000Z`),
    ...overrides
  };
}

describe('calibrateBehavioralTopicsForUser', () => {
  it('creates behavioral topics without requiring event linkage', async () => {
    const { user, feeds } = await createUserGraph();

    await Article.bulkCreate([
      articlePayload(user.id, feeds[0].id, 1, { favoriteInd: 1 }),
      articlePayload(user.id, feeds[1].id, 2, { clickedAmount: 2 }),
      articlePayload(user.id, feeds[0].id, 3, { attentionBucket: 4 })
    ]);

    const result = await calibrateBehavioralTopicsForUser(user.id, {
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

  it('removes stale behavioral article-topic links when articles no longer qualify', async () => {
    const { user, feeds } = await createUserGraph();

    const articles = await Article.bulkCreate([
      articlePayload(user.id, feeds[0].id, 1, { favoriteInd: 1 }),
      articlePayload(user.id, feeds[1].id, 2, { clickedAmount: 2 }),
      articlePayload(user.id, feeds[0].id, 3, { attentionBucket: 4 })
    ]);

    await calibrateBehavioralTopicsForUser(user.id, {
      engagementThreshold: 6,
      communitySimilarityThreshold: 0.5
    });

    const topic = await Topic.findOne({
      where: {
        userId: user.id,
        topicType: 'behavioral'
      }
    });

    const articleIds = articles.map(article => article.id);
    const linkCountBefore = await ArticleTopic.count({
      where: {
        articleId: { [db.Sequelize.Op.in]: articleIds },
        topicId: topic.id
      }
    });

    expect(linkCountBefore).toBe(3);

    await Article.update(
      {
        favoriteInd: 0,
        clickedAmount: 0,
        attentionBucket: 0
      },
      {
        where: {
          id: { [db.Sequelize.Op.in]: articleIds }
        }
      }
    );

    const result = await calibrateBehavioralTopicsForUser(user.id, {
      engagementThreshold: 6,
      communitySimilarityThreshold: 0.5
    });

    const linkCountAfter = await ArticleTopic.count({
      where: {
        articleId: { [db.Sequelize.Op.in]: articleIds },
        topicId: topic.id
      }
    });

    expect(result.topicCount).toBe(0);
    expect(result.staleArticleTopicLinkCount).toBe(3);
    expect(linkCountAfter).toBe(0);
  });

  it('preserves behavioral article-topic links during event topic rebuilds', async () => {
    const { user, feeds } = await createUserGraph();

    const articles = await Article.bulkCreate([
      articlePayload(user.id, feeds[0].id, 1, { favoriteInd: 1 }),
      articlePayload(user.id, feeds[1].id, 2, { clickedAmount: 2 }),
      articlePayload(user.id, feeds[0].id, 3, { attentionBucket: 4 })
    ]);

    await calibrateBehavioralTopicsForUser(user.id, {
      engagementThreshold: 6,
      communitySimilarityThreshold: 0.5
    });

    const topic = await Topic.findOne({
      where: {
        userId: user.id,
        topicType: 'behavioral'
      }
    });

    const eventTopic = await Topic.create({
      userId: user.id,
      name: 'Event topic',
      topicKey: `event-topic-${user.id}`,
      topicType: 'event',
      topicVector: [0.08, 0.91, 0.02],
      eventCount: 1,
      articleCount: articles.length,
      lastActivityAt: new Date('2026-05-23T10:00:00.000Z')
    });

    const event = await Event.create({
      userId: user.id,
      topicId: eventTopic.id,
      representativeArticleId: articles[0].id,
      name: 'Seed event',
      articleCount: articles.length,
      sourceCount: 2,
      eventStrength: 0.9,
      eventVector: [0.08, 0.91, 0.02],
      eventWindowStartAt: new Date('2026-05-21T10:00:00.000Z'),
      eventWindowEndAt: new Date('2026-05-23T10:00:00.000Z'),
      status: 'active'
    });

    const articleIds = articles.map(article => article.id);

    await Article.update(
      {
        eventId: event.id,
        topicId: eventTopic.id
      },
      {
        where: {
          id: { [db.Sequelize.Op.in]: articleIds }
        }
      }
    );

    await EventTopic.create({
      eventId: event.id,
      topicId: eventTopic.id,
      confidence: 1,
      rank: 1,
      primaryInd: true
    });

    await ArticleTopic.bulkCreate(articleIds.map(articleId => ({
      articleId,
      topicId: eventTopic.id,
      confidence: 1,
      rank: 1,
      primaryInd: true
    })));

    const behavioralLinksBefore = await ArticleTopic.count({
      where: {
        articleId: { [db.Sequelize.Op.in]: articleIds },
        topicId: topic.id
      }
    });

    expect(behavioralLinksBefore).toBe(3);

    await rebuildAllTopicsForUser(user.id);

    const [
      behavioralLinksAfter,
      eventTopicLinksAfter,
      eventArticleLinksAfter
    ] = await Promise.all([
      ArticleTopic.count({
        where: {
          articleId: { [db.Sequelize.Op.in]: articleIds },
          topicId: topic.id
        }
      }),
      EventTopic.count({
        where: {
          eventId: event.id,
          topicId: eventTopic.id
        }
      }),
      ArticleTopic.count({
        where: {
          articleId: { [db.Sequelize.Op.in]: articleIds },
          topicId: eventTopic.id
        }
      })
    ]);

    expect(behavioralLinksAfter).toBe(3);
    expect(eventTopicLinksAfter).toBe(1);
    expect(eventArticleLinksAfter).toBe(3);
  });
});


