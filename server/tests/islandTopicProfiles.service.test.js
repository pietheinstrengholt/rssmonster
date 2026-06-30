import { describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../models/index.js';
import { buildTopicInterestIslandProfilesForUser } from '../services/islands/islandTopicProfiles.js';

const { Article, ArticleTopic, Category, Feed, Topic, User } = db;

async function createUserGraph(prefix) {
  const hash = await bcrypt.hash('secret', 4);
  const user = await User.create({
    username: `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    password: 'secret',
    hash,
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
    published: new Date(`2026-05-${20 + index}T10:00:00.000Z`),
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
});
