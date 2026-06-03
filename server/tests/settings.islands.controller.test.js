import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../models/index.js';
import { getJwtSecret } from '../config/auth.js';

const {
  Article,
  ArticleTopic,
  Category,
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
    starInd: 1,
    clickedAmount: 2,
    url: `https://example.com/${uniqueName('article')}`,
    title: 'Island overview article',
    contentOriginal: '<p>Article body</p>',
    contentStripped: 'Article body',
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

describe('settings islands overview', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../app.js');
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
      starCount: 1,
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
