import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../../models/index.js';
import { buildTopicInterestIslandProfilesForUser } from '../../services/islands/islandTopicProfiles.js';

const { Article, ArticleTopic, Category, Feed, Topic, User } = db;

async function createUserGraph(prefix) {
  const hash = await bcrypt.hash('secret', 4);
  const user = await User.create({
    username: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    password: 'secret',
    feverCredentialHash: hash,
    role: 'user'
  });

  const category = await Category.create({
    userId: user.id,
    name: `${prefix} category`,
    categoryOrder: 0
  });

  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: `${prefix} feed`,
    url: `https://example.com/${prefix}-${user.id}.xml`
  });

  return { user, feed };
}

function articlePayload(user, feed, index, overrides = {}) {
  return {
    userId: user.id,
    feedId: feed.id,
    title: `${user.username} article ${index}`,
    url: `https://example.com/${user.username}/article-${index}`,
    publishedAt: new Date(`2026-05-${20 + index}T10:00:00.000Z`),
    articleVector: [1, index / 10, 0],
    ...overrides
  };
}

describe('buildTopicInterestIslandProfilesForUser', () => {
  it('ignores foreign article behavior attached through stale article-topic rows', async () => {
    const owner = await createUserGraph('owner');
    const foreign = await createUserGraph('foreign');

    const ownerTopic = await Topic.create({
      userId: owner.user.id,
      name: 'Owner topic',
      topicKey: `owner-topic-${owner.user.id}`,
      topicType: 'event',
      topicVector: [1, 0, 0],
      articleCount: 1,
      eventCount: 0,
      lastActivityAt: new Date('2026-05-20T10:00:00.000Z')
    });

    const ownerArticle = await Article.create(articlePayload(owner.user, owner.feed, 1, {
      clickedAmount: 0,
      favoriteInd: 0,
      attentionBucket: 0,
      negativeInd: 0
    }));
    const foreignArticle = await Article.create(articlePayload(foreign.user, foreign.feed, 2, {
      clickedAmount: 3,
      favoriteInd: 1,
      attentionBucket: 4,
      negativeInd: 1
    }));

    await ArticleTopic.bulkCreate([
      {
        articleId: ownerArticle.id,
        topicId: ownerTopic.id,
        confidence: 1,
        rank: 1,
        primaryInd: true
      },
      {
        articleId: foreignArticle.id,
        topicId: ownerTopic.id,
        confidence: 1,
        rank: 1,
        primaryInd: true
      }
    ]);

    const profiles = await buildTopicInterestIslandProfilesForUser(owner.user.id);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].positiveSignals).toEqual({
      positives: 0,
      stars: 0,
      clicks: 0,
      deepReads: 0,
      negatives: 0
    });
  });

  it('groups topics that share temporal engagement and respects the island cap', async () => {
    const graph = await createUserGraph('behavioral-community');
    const topics = await Promise.all([
      Topic.create({
        userId: graph.user.id,
        name: 'AI',
        topicKey: `ai-${graph.user.id}`,
        topicType: 'event',
        topicVector: [1, 0, 0],
        articleCount: 1,
        eventCount: 1,
        affinityScore: 0.8,
        lastActivityAt: new Date('2026-05-20T10:00:00.000Z')
      }),
      Topic.create({
        userId: graph.user.id,
        name: 'Linux',
        topicKey: `linux-${graph.user.id}`,
        topicType: 'event',
        topicVector: [0, 1, 0],
        articleCount: 1,
        eventCount: 1,
        affinityScore: 0.6,
        lastActivityAt: new Date('2026-05-20T10:00:00.000Z')
      }),
      Topic.create({
        userId: graph.user.id,
        name: 'Photography',
        topicKey: `photo-${graph.user.id}`,
        topicType: 'event',
        topicVector: [0, 0.2, 1],
        articleCount: 1,
        eventCount: 0,
        affinityScore: 0.2,
        lastActivityAt: new Date('2026-05-25T10:00:00.000Z')
      })
    ]);
    const articles = await Promise.all([
      Article.create(articlePayload(graph.user, graph.feed, 1, { clickedAmount: 2 })),
      Article.create(articlePayload(graph.user, graph.feed, 2, { favoriteInd: 1 })),
      Article.create(articlePayload(graph.user, graph.feed, 3, {
        clickedAmount: 1,
        publishedAt: new Date('2026-05-28T10:00:00.000Z')
      }))
    ]);
    await ArticleTopic.bulkCreate(topics.map((topic, index) => ({
      articleId: articles[index].id,
      topicId: topic.id,
      confidence: 1,
      rank: 1,
      primaryInd: true
    })));

    const profiles = await buildTopicInterestIslandProfilesForUser(graph.user.id, { maxIslands: 1 });

    expect(profiles).toHaveLength(1);
    expect(profiles[0].topics).toHaveLength(3);
    expect(profiles[0].positiveSignals.clicks).toBe(3);
    expect(profiles[0].positiveSignals.stars).toBe(1);
    expect(profiles[0].vector).toHaveLength(3);
  });
});
