import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import db from '../../models/index.js';
import { scoreArticlesFromIslandsForUser, explainArticleInterests } from '../../services/score/scoreArticlesFromIslands.js';

const { sequelize, Article, Category, Feed, Island, User } = db;

async function createUserGraph() {
  const suffix = randomUUID();

  const user = await User.create({
    username: `interest-scores-${suffix}`,
    password: 'secret',
    feverCredentialHash: `interest-scores-${suffix}`,
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
    embedding_model: 'test-model', articleVector: [1, 0, 0],
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

  it('rescoring from direct islands only updates unread articles', async () => {
    const { user, feed } = await createUserGraph();
    const suffix = randomUUID();

    await Island.create({ lastBehaviorAt: new Date(),
      userId: user.id,
      label: 'Island',
      weight: 0.42,
      embedding_model: 'test-model', islandVector: [1, 0, 0],
      archivedInd: false
    });
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

    await Promise.all([

    ]);

    await scoreArticlesFromIslandsForUser(user.id);

    await unreadArticle.reload();
    await readArticle.reload();
    await filteredArticle.reload();

    expect(unreadArticle.interestScore).toBe(0.042);
    expect(readArticle.interestScore).toBe(0.9);
    expect(filteredArticle.interestScore).toBe(0.95);
  });

  it('combines the strongest confidence-adjusted preference of each sign and excludes duplicates', async () => {
    const { user, feed } = await createUserGraph();
    const suffix = randomUUID();

    await Promise.all([
      Island.create({ lastBehaviorAt: new Date(),
        userId: user.id,
        label: 'Positive island',
        weight: 0.6,
        embedding_model: 'test-model', islandVector: [1, 0, 0],
        archivedInd: false
      }),
      Island.create({ lastBehaviorAt: new Date(),
        userId: user.id,
        label: 'Negative island',
        weight: -0.8,
        embedding_model: 'test-model', islandVector: [1, 0, 0],
        archivedInd: false
      }),
      Island.create({ lastBehaviorAt: new Date(),
        userId: user.id,
        label: 'Archived island',
        weight: 0.95,
        embedding_model: 'test-model', islandVector: [1, 0, 0],
        archivedInd: true
      })
    ]);
    const canonicalArticle = await Article.create(articlePayload(
      user.id,
      feed.id,
      1,
      suffix,
      { articleVector: [1, 0, 0] }
    ));
    const duplicateArticle = await Article.create(articlePayload(
      user.id,
      feed.id,
      2,
      suffix,
      {
        articleVector: [1, 0, 0],
        duplicateOfArticleId: canonicalArticle.id,
        interestScore: 0.9
      }
    ));

    const result = await scoreArticlesFromIslandsForUser(user.id);
    await Promise.all([canonicalArticle.reload(), duplicateArticle.reload()]);

    expect(result.fallbackScoredCount).toBe(1);
    // Unsupported negative intent uses .5 compatibility: .06 positive minus .04 negative.
    expect(canonicalArticle.interestScore).toBe(0.02);
    const { results } = await explainArticleInterests(user.id, [canonicalArticle]);
    const paths = results.get(String(canonicalArticle.id)).paths;
    expect(paths).toHaveLength(2);
    expect(paths.find(path => path.contribution > 0).contribution).toBeCloseTo(0.06);
    expect(paths.find(path => path.contribution < 0)).toMatchObject({ sourceIntent: 'unknown', intentCompatibility: 0.5 });
    expect(paths.find(path => path.contribution < 0).contribution).toBeCloseTo(-0.04);
    expect(duplicateArticle.interestScore).toBe(0.9);
  });

  it('uses vector similarity for matching and unrelated unread articles', async () => {
    const { user, feed } = await createUserGraph();
    const suffix = randomUUID();
    await Island.create({ lastBehaviorAt: new Date(),
      userId: user.id,
      label: 'Vector island',
      weight: 0.6,
      embedding_model: 'test-model', islandVector: [1, 0, 0],
      archivedInd: false
    });
    const matchingArticle = await Article.create(articlePayload(user.id, feed.id, 1, suffix, {
      articleVector: '[1, 0, 0]',
      interestScore: 0.9
    }));
    const unrelatedArticle = await Article.create(articlePayload(user.id, feed.id, 2, suffix, {
      articleVector: [0, 1, 0],
      interestScore: 0.9
    }));

    const result = await scoreArticlesFromIslandsForUser(user.id, {
      articleScoreThreshold: 0.8
    });

    await Promise.all([matchingArticle.reload(), unrelatedArticle.reload()]);

    expect(result).toMatchObject({ fallbackScoredCount: 1, updatedCount: 1 });
    expect(matchingArticle.interestScore).toBe(0.06);
    expect(unrelatedArticle.interestScore).toBe(0);
  });

  it('does not transfer explicit evidence across users, filtered/duplicate records, or expired publication windows', async () => {
    const { user, feed } = await createUserGraph();
    const foreign = await createUserGraph();
    const suffix = randomUUID();
    const target = await Article.create(articlePayload(user.id, feed.id, 1, suffix, {
      articleVector: [0, 1, 0], publishedAt: new Date()
    }));
    const ownNegative = await Article.create(articlePayload(user.id, feed.id, 2, suffix, {
      status: 'read', negativeInd: 1, publishedAt: new Date()
    }));
    await Article.bulkCreate([
      articlePayload(foreign.user.id, foreign.feed.id, 3, suffix, { negativeInd: 1, articleVector: [0, 1, 0], publishedAt: new Date() }),
      articlePayload(user.id, feed.id, 4, suffix, { negativeInd: 1, articleVector: [0, 1, 0], filteredInd: true, publishedAt: new Date() }),
      articlePayload(user.id, feed.id, 5, suffix, { negativeInd: 1, articleVector: [0, 1, 0], duplicateOfArticleId: ownNegative.id, publishedAt: new Date() }),
      articlePayload(user.id, feed.id, 6, suffix, { negativeInd: 1, articleVector: [0, 1, 0], status: 'read', publishedAt: new Date(Date.now() - 91 * 86400000) })
    ]);
    await scoreArticlesFromIslandsForUser(user.id);
    await target.reload();
    expect(target.interestScore).toBe(0);
  });

});
