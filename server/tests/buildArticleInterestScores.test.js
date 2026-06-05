import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import db from '../models/index.js';
import { buildArticleInterestScoresForUser } from '../services/islands/buildArticleInterestScores.js';

const { Article, ArticleTopic, Category, Feed, Island, IslandTopic, Topic, User } = db;

async function createUserGraph() {
  const suffix = randomUUID();

  const user = await User.create({
    username: `interest-scores-${suffix}`,
    password: 'secret',
    hash: `interest-scores-${suffix}`,
    role: 'user'
  });

  const category = await Category.create({
    userId: user.id,
    name: 'Interest Scores',
    categoryOrder: 0
  });

  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: 'Feed',
    url: `https://example.com/interest-scores/${suffix}/feed.xml`
  });

  return { user, feed };
}

function articlePayload(userId, feedId, index, suffix, overrides = {}) {
  return {
    userId,
    feedId,
    title: `Interest score article ${index}`,
    url: `https://example.com/interest/${suffix}/${index}`,
    articleVector: [1, 0, 0],
    interestScore: 0.7,
    status: 'unread',
    ...overrides
  };
}

describe('buildArticleInterestScoresForUser', () => {
  it('clears stale island scores for unread articles when no current island matches', async () => {
    const { user, feed } = await createUserGraph();
    const suffix = randomUUID();
    const unreadArticle = await Article.create(articlePayload(user.id, feed.id, 1, suffix, {
      interestScore: 0.8
    }));
    const readArticle = await Article.create(articlePayload(user.id, feed.id, 2, suffix, {
      status: 'read',
      interestScore: 0.9
    }));

    await buildArticleInterestScoresForUser(user.id);

    await unreadArticle.reload();
    await readArticle.reload();

    expect(unreadArticle.interestScore).toBe(0);
    expect(readArticle.interestScore).toBe(0.9);
  });

  it('rescoring from topic islands only updates unread articles', async () => {
    const { user, feed } = await createUserGraph();
    const suffix = randomUUID();
    const topic = await Topic.create({
      userId: user.id,
      name: 'Topic',
      topicKey: `topic-${suffix}`,
      topicVector: [1, 0, 0]
    });
    const island = await Island.create({
      userId: user.id,
      label: 'Island',
      weight: 0.42,
      islandVector: [1, 0, 0],
      archivedInd: false
    });
    const unreadArticle = await Article.create(articlePayload(user.id, feed.id, 1, suffix, {
      topicId: topic.id,
      interestScore: 0.8
    }));
    const readArticle = await Article.create(articlePayload(user.id, feed.id, 2, suffix, {
      topicId: topic.id,
      status: 'read',
      interestScore: 0.9
    }));

    await Promise.all([
      ArticleTopic.create({
        articleId: unreadArticle.id,
        topicId: topic.id,
        confidence: 1
      }),
      ArticleTopic.create({
        articleId: readArticle.id,
        topicId: topic.id,
        confidence: 1
      }),
      IslandTopic.create({
        islandId: island.id,
        topicId: topic.id,
        confidence: 1
      })
    ]);

    await buildArticleInterestScoresForUser(user.id);

    await unreadArticle.reload();
    await readArticle.reload();

    expect(unreadArticle.interestScore).toBe(0.42);
    expect(readArticle.interestScore).toBe(0.9);
  });
});
