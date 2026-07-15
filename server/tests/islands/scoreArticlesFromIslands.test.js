import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import db from '../../models/index.js';
import { scoreArticlesFromIslandsForUser } from '../../services/score/scoreArticlesFromIslands.js';

const { sequelize, Article, ArticleTopic, Category, Feed, Island, IslandTopic, Topic, User } = db;

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

describe('scoreArticlesFromIslandsForUser', () => {
  it('limits post-crawl scoring to newly created active articles', async () => {
    const { user, feed } = await createUserGraph();
    const suffix = randomUUID();
    const crawlStartedAt = new Date('2026-07-01T12:00:00.000Z');
    const newArticle = await Article.create(articlePayload(user.id, feed.id, 1, suffix, {
      interestScore: 0.8
    }));
    const filteredArticle = await Article.create(articlePayload(user.id, feed.id, 2, suffix, {
      filteredInd: true,
      interestScore: 0.85
    }));
    const oldRevisedArticle = await Article.create(articlePayload(user.id, feed.id, 3, suffix, {
      articleVector: null,
      interestScore: 0.9
    }));

    await sequelize.query(
      `
      UPDATE articles
      SET createdAt = CASE
        WHEN id IN (:newArticleIds) THEN :newCreatedAt
        ELSE :oldCreatedAt
      END,
      updatedAt = :recentUpdatedAt
      WHERE id IN (:articleIds)
      `,
      {
        replacements: {
          newArticleIds: [newArticle.id, filteredArticle.id],
          newCreatedAt: new Date('2026-07-02T12:00:00.000Z'),
          oldCreatedAt: new Date('2026-06-01T12:00:00.000Z'),
          recentUpdatedAt: new Date('2026-07-02T13:00:00.000Z'),
          articleIds: [newArticle.id, filteredArticle.id, oldRevisedArticle.id]
        }
      }
    );

    await scoreArticlesFromIslandsForUser(user.id, { createdAtFrom: crawlStartedAt });

    await Promise.all([
      newArticle.reload(),
      filteredArticle.reload(),
      oldRevisedArticle.reload()
    ]);

    expect(newArticle.interestScore).toBe(0);
    expect(filteredArticle.interestScore).toBe(0.85);
    expect(oldRevisedArticle.interestScore).toBe(0.9);
  });

  it('keeps unscoped scoring available as an explicit historical rebuild', async () => {
    const { user, feed } = await createUserGraph();
    const suffix = randomUUID();
    const historicalArticle = await Article.create(articlePayload(user.id, feed.id, 1, suffix, {
      interestScore: 0.8,
      createdAt: new Date('2020-01-01T00:00:00.000Z')
    }));

    await scoreArticlesFromIslandsForUser(user.id);
    await historicalArticle.reload();

    expect(historicalArticle.interestScore).toBe(0);
  });

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
    const filteredArticle = await Article.create(articlePayload(user.id, feed.id, 3, suffix, {
      filteredInd: true,
      interestScore: 0.95
    }));

    await scoreArticlesFromIslandsForUser(user.id);

    await unreadArticle.reload();
    await readArticle.reload();
    await filteredArticle.reload();

    expect(unreadArticle.interestScore).toBe(0);
    expect(readArticle.interestScore).toBe(0.9);
    expect(filteredArticle.interestScore).toBe(0.95);
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
    const filteredArticle = await Article.create(articlePayload(user.id, feed.id, 3, suffix, {
      topicId: topic.id,
      filteredInd: true,
      interestScore: 0.95
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
      ArticleTopic.create({
        articleId: filteredArticle.id,
        topicId: topic.id,
        confidence: 1
      }),
      IslandTopic.create({
        islandId: island.id,
        topicId: topic.id,
        confidence: 1
      })
    ]);

    await scoreArticlesFromIslandsForUser(user.id);

    await unreadArticle.reload();
    await readArticle.reload();
    await filteredArticle.reload();

    expect(unreadArticle.interestScore).toBe(0.42);
    expect(readArticle.interestScore).toBe(0.9);
    expect(filteredArticle.interestScore).toBe(0.95);
  });
});
