import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

const {
  Article,
  ArticleTopic,
  Category,
  Event,
  EventTopic,
  Feed,
  Island,
  IslandTopic,
  Topic,
  User,
  sequelize
} = db;

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

// This function creates one user-owned article connected to two topics.
const createArticleTopicFixture = async user => {
  const category = await Category.create({
    userId: user.id,
    name: uniqueName('islands-category'),
    categoryOrder: 1
  });
  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: uniqueName('islands-feed'),
    url: `https://example.com/${uniqueName('feed')}.xml`
  });
  const topic = await Topic.create({
    userId: user.id,
    name: uniqueName('islands-topic'),
    topicKey: uniqueName('topic-key'),
    topicType: 'behavioral',
    topicVector: [1, 0, 0],
    affinityScore: 0.8
  });
  const secondaryTopic = await Topic.create({
    userId: user.id,
    name: uniqueName('islands-secondary-topic'),
    topicKey: uniqueName('secondary-topic-key'),
    topicType: 'behavioral',
    topicVector: [0.9, 0.1, 0],
    affinityScore: 0.7
  });
  const article = await Article.create({
    userId: user.id,
    feedId: feed.id,
    status: 'unread',
    favoriteInd: 1,
    clickedAmount: 2,
    url: `https://example.com/${uniqueName('article')}`,
    title: 'Island overview article',
    contentOriginal: '<p>Article body</p>',
    contentHtml: 'Article body',
    articleVector: [1, 0, 0],
    published: new Date('2026-05-01T10:00:00Z')
  });

  await ArticleTopic.create({
    articleId: article.id,
    topicId: topic.id,
    confidence: 0.9,
    rank: 1,
    primaryInd: true
  });
  await ArticleTopic.create({
    articleId: article.id,
    topicId: secondaryTopic.id,
    confidence: 0.8,
    rank: 2,
    primaryInd: false
  });

  return { article, secondaryTopic, topic };
};

// This function creates event and topic rows for the settings topics overview.
const createEventTopicFixture = async user => {
  const category = await Category.create({
    userId: user.id,
    name: uniqueName('topics-category'),
    categoryOrder: 1
  });
  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: uniqueName('topics-feed'),
    url: `https://example.com/${uniqueName('topics-feed')}.xml`
  });
  const topic = await Topic.create({
    userId: user.id,
    name: uniqueName('topics-topic'),
    topicKey: uniqueName('topics-topic-key'),
    topicType: 'event',
    topicVector: [1, 0, 0],
    affinityScore: 0.4,
    evidenceScore: 0.7,
    articleCount: 2,
    eventCount: 1,
    starredCount: 1,
    lastActivityAt: new Date('2026-05-03T10:00:00Z')
  });
  const hybridTopic = await Topic.create({
    userId: user.id,
    name: uniqueName('topics-hybrid-topic'),
    topicKey: uniqueName('topics-hybrid-key'),
    topicType: 'hybrid',
    topicVector: [0.9, 0.1, 0],
    affinityScore: 0.6,
    evidenceScore: 0.8,
    articleCount: 1,
    eventCount: 1,
    starredCount: 0,
    lastActivityAt: new Date('2026-05-04T10:00:00Z')
  });
  const firstArticle = await Article.create({
    userId: user.id,
    feedId: feed.id,
    status: 'unread',
    favoriteInd: 1,
    clickedAmount: 1,
    url: `https://example.com/${uniqueName('event-article-1')}`,
    title: 'First event article',
    contentOriginal: '<p>Article body</p>',
    contentHtml: 'Article body',
    articleVector: [1, 0, 0],
    topicId: topic.id,
    published: new Date('2026-05-01T10:00:00Z')
  });
  const secondArticle = await Article.create({
    userId: user.id,
    feedId: feed.id,
    status: 'unread',
    favoriteInd: 0,
    clickedAmount: 0,
    url: `https://example.com/${uniqueName('event-article-2')}`,
    title: 'Second event article',
    contentOriginal: '<p>Article body</p>',
    contentHtml: 'Article body',
    articleVector: [0.9, 0.1, 0],
    topicId: topic.id,
    published: new Date('2026-05-01T11:00:00Z')
  });
  const unclusteredArticle = await Article.create({
    userId: user.id,
    feedId: feed.id,
    status: 'unread',
    url: `https://example.com/${uniqueName('unclustered-article')}`,
    title: 'Unclustered article',
    contentOriginal: '<p>Article body</p>',
    contentHtml: 'Article body',
    articleVector: [0, 1, 0],
    published: new Date('2026-05-02T10:00:00Z')
  });
  const event = await Event.create({
    userId: user.id,
    topicId: topic.id,
    representativeArticleId: firstArticle.id,
    name: 'Readable event',
    articleCount: 2,
    sourceCount: 1,
    eventStrength: 0.7,
    status: 'active',
    eventWindowStartAt: new Date('2026-05-01T10:00:00Z'),
    eventWindowEndAt: new Date('2026-05-01T11:00:00Z')
  });

  await firstArticle.update({ eventId: event.id });
  await secondArticle.update({ eventId: event.id });

  await ArticleTopic.create({
    articleId: firstArticle.id,
    topicId: topic.id,
    confidence: 0.9,
    rank: 1,
    primaryInd: true
  });
  await ArticleTopic.create({
    articleId: firstArticle.id,
    topicId: hybridTopic.id,
    confidence: 0.7,
    rank: 2,
    primaryInd: false
  });
  await ArticleTopic.create({
    articleId: secondArticle.id,
    topicId: topic.id,
    confidence: 0.8,
    rank: 1,
    primaryInd: true
  });
  await EventTopic.create({
    eventId: event.id,
    topicId: topic.id,
    confidence: 0.9,
    rank: 1,
    primaryInd: true
  });
  await EventTopic.create({
    eventId: event.id,
    topicId: hybridTopic.id,
    confidence: 0.6,
    rank: 2,
    primaryInd: false
  });

  return { event, firstArticle, hybridTopic, secondArticle, topic, unclusteredArticle };
};

describe('settings islands overview', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('returns island counts and related articles without duplicate topic matches', async () => {
    const user = await User.create({
      username: uniqueName('islands-user'),
      password: 'hashed-password',
      hash: uniqueName('islands-hash'),
      role: 'user'
    });
    const { article, secondaryTopic, topic } = await createArticleTopicFixture(user);
    const island = await Island.create({
      userId: user.id,
      label: 'Readable island',
      weight: 0.75,
      islandVector: [1, 0, 0],
      populationAudit: [{
        sourceArticles: {
          starredArticleIds: [article.id]
        }
      }]
    });

    await IslandTopic.create({
      islandId: island.id,
      topicId: topic.id,
      similarity: 0.95,
      confidence: 0.9
    });
    await IslandTopic.create({
      islandId: island.id,
      topicId: secondaryTopic.id,
      similarity: 0.85,
      confidence: 0.8
    });

    const res = await request(app)
      .get('/api/setting/islands')
      .set('Authorization', authHeaderFor(user));

    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({
      islandCount: 1,
      islandArticles: 1,
      totalArticles: 1
    });
    expect(res.body.islands).toHaveLength(1);
    expect(res.body.islands[0]).toMatchObject({
      id: island.id,
      topicCount: 2,
      relatedArticleCount: 1,
      favoriteCount: 1,
      clickCount: 1,
      interactionCount: 2
    });
    expect(res.body.islands[0].relatedArticles).toHaveLength(1);
    expect(res.body.islands[0].relatedArticles[0]).toMatchObject({
      id: article.id,
      title: 'Island overview article',
      isPopulationSource: true,
      isNewArticle: false
    });
  });
});

describe('settings topics overview', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('returns event and topic counts without duplicate semantic matches', async () => {
    const user = await User.create({
      username: uniqueName('topics-user'),
      password: 'hashed-password',
      hash: uniqueName('topics-hash'),
      role: 'user'
    });
    const { event, hybridTopic, topic } = await createEventTopicFixture(user);

    const res = await request(app)
      .get('/api/setting/topics')
      .set('Authorization', authHeaderFor(user));

    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({
      totalArticles: 3,
      unclusteredArticles: 1,
      eventLinkedArticles: 2,
      unassignedArticles: 1,
      eventCount: 1,
      activeEventCount: 1,
      eventReuseRatio: 66.7,
      newEventRatio: 33.3,
      averageArticlesPerEvent: 2,
      largestEventSize: 2,
      topicCount: 2,
      eventsLinkedToTopics: 1,
      topicsWithEvents: 2,
      eventsWithoutTopics: 0,
      articlesLinkedToTopics: 2,
      topicCoveragePercent: 66.7,
      averageEventsPerTopic: 0.5
    });
    expect(res.body.eventSizeBuckets).toContainEqual({ bucket: '2', count: 1 });
    expect(res.body.topicTypes).toEqual(expect.arrayContaining([
      { topicType: 'event', count: 1 },
      { topicType: 'hybrid', count: 1 }
    ]));
    expect(res.body.events[0]).toMatchObject({
      id: event.id,
      name: 'Readable event',
      articleCount: 2,
      actualArticleCount: 2,
      topicCount: 2
    });
    expect(res.body.topics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: hybridTopic.id,
        linkedEventCount: 1,
        linkedArticleCount: 1
      }),
      expect.objectContaining({
        id: topic.id,
        linkedEventCount: 1,
        linkedArticleCount: 2
      })
    ]));
  });
});
