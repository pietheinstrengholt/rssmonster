import { beforeEach, describe, expect, it } from 'vitest';
import db from '../models/index.js';
import { resetDatabase } from './helpers/resetDb.js';
import { buildArticleInterestScoresForUser } from '../services/islands/buildArticleInterestScores.js';

const { Article, ArticleTopic, Category, Feed, Island, IslandTopic, Topic, User } = db;
let userSequence = 0;

async function createUserGraph() {
  userSequence += 1;

  const user = await User.create({
    username: `interest-scores-${Date.now()}-${userSequence}`,
    password: 'secret',
    hash: 'secret',
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
    url: 'https://example.com/feed.xml'
  });

  return { user, feed };
}

function articlePayload(userId, feedId, index, overrides = {}) {
  return {
    userId,
    feedId,
    title: `Interest score article ${index}`,
    url: `https://example.com/interest/${index}`,
    articleVector: [1, 0, 0],
    interestScore: 0.7,
    status: 'unread',
    ...overrides
  };
}

describe('buildArticleInterestScoresForUser', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('clears stale island scores for unread articles when no current island matches', async () => {
    const { user, feed } = await createUserGraph();
    const unreadArticle = await Article.create(articlePayload(user.id, feed.id, 1, {
      interestScore: 0.8
    }));
    const readArticle = await Article.create(articlePayload(user.id, feed.id, 2, {
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
    const topic = await Topic.create({
      userId: user.id,
      name: 'Topic',
      topicKey: 'topic',
      topicVector: [1, 0, 0]
    });
    const island = await Island.create({
      userId: user.id,
      label: 'Island',
      weight: 0.42,
      islandVector: [1, 0, 0],
      archivedInd: false
    });
    const unreadArticle = await Article.create(articlePayload(user.id, feed.id, 1, {
      topicId: topic.id,
      interestScore: 0.8
    }));
    const readArticle = await Article.create(articlePayload(user.id, feed.id, 2, {
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
