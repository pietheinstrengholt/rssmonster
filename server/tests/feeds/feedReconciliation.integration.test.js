import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';
import { Op } from 'sequelize';
import db from '../../models/index.js';
import { withExecutionTimeout } from '../../services/feeds/executionDeadline.js';
import { assertFeedLeaseOwnership } from '../../services/feeds/feedClaims.js';
import { persistDiscoveredFeedUrl, registerFeedUrlAliases } from '../../services/feeds/feedUrlAliases.js';
import { reconcileDuplicateFeeds } from '../../services/feeds/feedReconciliation.js';

const {
  Article,
  ArticleTopic,
  Category,
  Event,
  Feed,
  FeedUrlAlias,
  Hotlink,
  Setting,
  Tag,
  Topic,
  User,
  sequelize
} = db;

let sequence = 0;
let ownedUserIds = [];

// Creates a collision-safe fixture label for the shared integration database.
const unique = prefix => `${prefix}-${Date.now()}-${++sequence}`;

// Creates one user and two categories for reconciliation fixtures.
const createOwner = async () => {
  const username = `${unique('feed-reconcile')}@example.test`;
  const user = await User.create({
    username,
    password: 'test-password',
    feverCredentialHash: `${username}-hash`,
    role: 'user'
  });
  ownedUserIds.push(user.id);
  const firstCategory = await Category.create({
    userId: user.id,
    name: unique('Primary'),
    categoryOrder: 1
  });
  const secondCategory = await Category.create({
    userId: user.id,
    name: unique('Secondary'),
    categoryOrder: 2
  });
  return { user, firstCategory, secondCategory };
};

// Creates a complete article using model hooks for its identity hashes.
const createArticle = (feed, suffix, overrides = {}) => Article.create({
  userId: feed.userId,
  feedId: feed.id,
  externalId: `guid-${suffix}`,
  externalIdType: 'guid',
  status: 'unread',
  url: `https://articles.example.test/${suffix}`,
  normalizedUrl: `https://articles.example.test/${suffix}`,
  title: `Article ${suffix}`,
  contentHtml: `<p>${suffix}</p>`,
  contentText: suffix,
  publishedAt: new Date('2026-08-01T00:00:00.000Z'),
  ...overrides
});

// Creates two differently configured feeds owned by one user.
const createFeedPair = async fixture => {
  const stable = await Feed.create({
    userId: fixture.user.id,
    categoryId: fixture.firstCategory.id,
    feedName: 'Established subscription',
    url: `https://old.example.test/${unique('feed')}.xml`,
    feedTags: ['stable'],
    generateEmbeddings: true,
    applyAiAnalysis: true,
    crawlSince: new Date('2026-07-01T00:00:00.000Z'),
    lastSuccessAt: new Date('2026-08-08T00:00:00.000Z'),
    leaseOwner: 'crawl-lease',
    leaseUntil: new Date('2026-08-09T01:00:00.000Z')
  });
  const duplicate = await Feed.create({
    userId: fixture.user.id,
    categoryId: fixture.secondCategory.id,
    feedName: 'Later duplicate',
    url: `https://redirect.example.test/${unique('feed')}.xml`,
    feedTags: ['duplicate', 'stable'],
    generateEmbeddings: false,
    applyAiAnalysis: false,
    crawlSince: null,
    mutedUntil: new Date('2026-08-20T00:00:00.000Z')
  });
  await registerFeedUrlAliases({
    userId: fixture.user.id,
    feedId: stable.id,
    candidates: [{ originalUrl: stable.url, aliasType: 'input' }]
  });
  await registerFeedUrlAliases({
    userId: fixture.user.id,
    feedId: duplicate.id,
    candidates: [{ originalUrl: duplicate.url, aliasType: 'input' }]
  });
  return { stable, duplicate };
};

// Creates a crawl execution whose first transactional ownership query can be delayed.
const createDelayedLeaseExecution = feed => {
  let releaseOwnershipCheck;
  let reportOwnershipCheck;
  const ownershipCheckStarted = new Promise(resolve => {
    reportOwnershipCheck = resolve;
  });
  const ownershipCheckReleased = new Promise(resolve => {
    releaseOwnershipCheck = resolve;
  });
  let delayNextCheck = true;
  const execution = {
    deadlineAt: Date.now() + 30_000,
    lease: { feedId: feed.id, leaseOwner: feed.leaseOwner },
    leaseState: { lost: false }
  };
  execution.assertLeaseOwnership = async options => {
    if (delayNextCheck) {
      delayNextCheck = false;
      reportOwnershipCheck();
      await ownershipCheckReleased;
    }
    return assertFeedLeaseOwnership(execution.lease, options);
  };
  return { execution, ownershipCheckStarted, releaseOwnershipCheck };
};

describe('duplicate feed reconciliation integration', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
  }, 50_000);

  afterEach(async () => {
    if (ownedUserIds.length > 0) {
      await User.destroy({ where: { id: { [Op.in]: ownedUserIds } } });
    }
    ownedUserIds = [];
  });

  it('promotes a converged URL and transfers all feed-owned data to one stable subscription', async () => {
    const fixture = await createOwner();
    const { stable, duplicate } = await createFeedPair(fixture);
    const overlapUrl = 'https://articles.example.test/shared';
    const retainedOverlap = await createArticle(stable, unique('stable-overlap'), {
      url: overlapUrl,
      normalizedUrl: overlapUrl,
      status: 'read',
      favoriteInd: 1
    });
    const removedOverlap = await createArticle(duplicate, unique('duplicate-overlap'), {
      url: `${overlapUrl}#publisher-fragment`,
      normalizedUrl: overlapUrl,
      clickedAmount: 4
    });
    const uniqueArticle = await createArticle(duplicate, unique('unique'));
    const topic = await Topic.create({
      userId: fixture.user.id,
      name: 'Transferred topic',
      topicKey: unique('topic'),
      topicType: 'event'
    });
    const event = await Event.create({
      userId: fixture.user.id,
      topicId: topic.id,
      representativeArticleId: removedOverlap.id,
      developingArticleId: removedOverlap.id,
      name: 'Transferred event'
    });
    await removedOverlap.update({ eventId: event.id, topicId: topic.id });
    await ArticleTopic.create({
      articleId: removedOverlap.id,
      topicId: topic.id,
      confidence: 0.8,
      rank: 1,
      primaryInd: true
    });
    await Tag.create({
      articleId: removedOverlap.id,
      userId: fixture.user.id,
      name: 'transferred',
      tagType: 'rule'
    });
    await Hotlink.create({
      userId: fixture.user.id,
      feedId: duplicate.id,
      sourceArticleId: removedOverlap.id,
      url: 'https://outbound.example.test/story'
    });
    await Setting.create({ userId: fixture.user.id, feedId: String(duplicate.id) });

    const survivor = await persistDiscoveredFeedUrl({
      feed: duplicate,
      discoveredUrl: stable.url
    });

    expect(survivor.id).toBe(stable.id);
    expect(await Feed.count({ where: { userId: fixture.user.id } })).toBe(1);
    const reloaded = await Feed.findByPk(stable.id);
    expect(reloaded).toMatchObject({
      categoryId: fixture.firstCategory.id,
      feedName: 'Established subscription',
      feedTags: ['stable', 'duplicate'],
      generateEmbeddings: false,
      applyAiAnalysis: false,
      crawlSince: null,
      mutedUntil: new Date('2026-08-20T00:00:00.000Z')
    });
    expect(await Article.count({ where: { feedId: stable.id } })).toBe(2);
    expect(await Article.findByPk(removedOverlap.id)).toBeNull();
    expect(await Article.findByPk(uniqueArticle.id)).toMatchObject({ feedId: stable.id });
    expect(await Article.findByPk(retainedOverlap.id)).toMatchObject({
      status: 'read',
      favoriteInd: 1,
      clickedAmount: 4
    });
    expect(await Tag.findOne({ where: { name: 'transferred' } })).toMatchObject({
      articleId: retainedOverlap.id
    });
    expect(await ArticleTopic.findOne({ where: { topicId: topic.id } })).toMatchObject({
      articleId: retainedOverlap.id
    });
    expect(await Event.findByPk(event.id)).toMatchObject({
      representativeArticleId: retainedOverlap.id,
      developingArticleId: retainedOverlap.id
    });
    expect(await Hotlink.findOne({ where: { userId: fixture.user.id }, raw: true })).toMatchObject({
      feedId: stable.id,
      sourceArticleId: retainedOverlap.id
    });
    expect(await Setting.findOne({ where: { userId: fixture.user.id } })).toMatchObject({
      feedId: String(stable.id)
    });
    const aliases = await FeedUrlAlias.findAll({ where: { userId: fixture.user.id } });
    expect(aliases).toHaveLength(2);
    expect(new Set(aliases.map(alias => alias.feedId))).toEqual(new Set([stable.id]));
    expect(await Article.count({ where: { feedId: duplicate.id } })).toBe(0);
    expect(await FeedUrlAlias.count({ where: { feedId: duplicate.id } })).toBe(0);
    expect(await Hotlink.count({ where: { feedId: duplicate.id } })).toBe(0);
  });

  it('retains validators, body hash, and freshness from one accepted representation', async () => {
    const fixture = await createOwner();
    const { stable, duplicate } = await createFeedPair(fixture);
    const stableFreshUntil = new Date('2026-08-09T12:00:00.000Z');
    await stable.update({
      etag: '"stable"',
      lastModified: 'Sat, 08 Aug 2026 00:00:00 GMT',
      contentHash: 'stable-content-hash',
      cacheFreshUntil: stableFreshUntil,
      lastSuccessAt: new Date('2026-08-08T00:00:00.000Z')
    });
    await duplicate.update({
      etag: '"older"',
      lastModified: 'Fri, 07 Aug 2026 00:00:00 GMT',
      contentHash: 'older-content-hash',
      cacheFreshUntil: new Date('2026-08-20T00:00:00.000Z'),
      lastSuccessAt: new Date('2026-08-07T00:00:00.000Z')
    });

    const result = await reconcileDuplicateFeeds({
      userId: fixture.user.id,
      feedIds: [stable.id, duplicate.id]
    });
    const survivor = await Feed.findByPk(result.survivor.id);

    expect(survivor).toMatchObject({
      etag: '"stable"',
      lastModified: 'Sat, 08 Aug 2026 00:00:00 GMT',
      contentHash: 'stable-content-hash',
      cacheFreshUntil: stableFreshUntil
    });
  });

  it('rolls back every transfer on failure and is harmless when repeated after success', async () => {
    const fixture = await createOwner();
    const { stable, duplicate } = await createFeedPair(fixture);
    const article = await createArticle(duplicate, unique('rollback'));

    await expect(reconcileDuplicateFeeds({
      userId: fixture.user.id,
      feedIds: [stable.id, duplicate.id],
      // Forces a failure after all transfers but before the losing feed is deleted.
      beforeDelete: async () => {
        throw new Error('forced rollback');
      }
    })).rejects.toThrow('forced rollback');

    expect(await Feed.count({ where: { id: { [Op.in]: [stable.id, duplicate.id] } } })).toBe(2);
    expect(await Article.findByPk(article.id)).toMatchObject({ feedId: duplicate.id });
    expect(await FeedUrlAlias.count({ where: { feedId: duplicate.id } })).toBe(1);

    const first = await reconcileDuplicateFeeds({
      userId: fixture.user.id,
      feedIds: [stable.id, duplicate.id]
    });
    const repeated = await reconcileDuplicateFeeds({
      userId: fixture.user.id,
      feedIds: [stable.id, duplicate.id]
    });
    expect(first).toMatchObject({ survivor: { id: stable.id }, reconciled: true });
    expect(repeated).toMatchObject({ survivor: { id: stable.id }, reconciled: false });
    expect(await Article.findByPk(article.id)).toMatchObject({ feedId: stable.id });
  });

  it('rolls back a delayed reconciliation after the timeout has been reported', async () => {
    const fixture = await createOwner();
    const { stable, duplicate } = await createFeedPair(fixture);
    const article = await createArticle(duplicate, unique('deadline-rollback'));
    let reachedDelayedBoundary = false;
    let settleOperation;
    const operationSettled = new Promise(resolve => {
      settleOperation = resolve;
    });

    await expect(withExecutionTimeout(async (signal, deadlineAt) => {
      try {
        return await reconcileDuplicateFeeds({
          userId: fixture.user.id,
          feedIds: [stable.id, duplicate.id],
          execution: { signal, deadlineAt },
          // Holds the transaction after material transfers to exercise pre-commit expiry.
          beforeDelete: () => {
            reachedDelayedBoundary = true;
            if (signal.aborted) return;
            return new Promise(resolve => {
              signal.addEventListener('abort', resolve, { once: true });
            });
          }
        });
      } finally {
        settleOperation();
      }
    }, 1000)).rejects.toMatchObject({ code: 'FEED_EXECUTION_TIMEOUT' });

    expect(reachedDelayedBoundary).toBe(true);
    await operationSettled;
    expect(await Feed.count({
      where: { id: { [Op.in]: [stable.id, duplicate.id] } }
    })).toBe(2);
    expect(await Article.findByPk(article.id)).toMatchObject({
      feedId: duplicate.id
    });
    expect(await FeedUrlAlias.count({ where: { feedId: duplicate.id } })).toBe(1);
  });

  it('does not begin URL promotion after execution has expired', async () => {
    const fixture = await createOwner();
    const { duplicate } = await createFeedPair(fixture);
    const originalUrl = duplicate.url;
    const promotedUrl = `https://publisher.example.test/${unique('expired')}.xml`;

    await expect(persistDiscoveredFeedUrl({
      feed: duplicate,
      discoveredUrl: promotedUrl,
      execution: { deadlineAt: Date.now() - 1 }
    })).rejects.toMatchObject({ code: 'FEED_EXECUTION_TIMEOUT' });

    expect(await Feed.findByPk(duplicate.id)).toMatchObject({ url: originalUrl });
    expect(await FeedUrlAlias.count({
      where: { userId: fixture.user.id, originalUrl: promotedUrl }
    })).toBe(0);
  });

  it('rolls back crawl URL and alias promotion when lease ownership changes', async () => {
    const fixture = await createOwner();
    const { duplicate } = await createFeedPair(fixture);
    const originalUrl = duplicate.url;
    const promotedUrl = `https://publisher.example.test/${unique('lease-lost')}.xml`;
    await duplicate.update({
      leaseOwner: 'first-crawl-owner',
      leaseUntil: new Date(Date.now() + 60_000)
    });
    const delayed = createDelayedLeaseExecution(duplicate);

    const promotion = persistDiscoveredFeedUrl({
      feed: duplicate,
      discoveredUrl: promotedUrl,
      aliases: [{ originalUrl: promotedUrl, aliasType: 'redirect' }],
      execution: delayed.execution
    });
    await delayed.ownershipCheckStarted;
    await Feed.update({
      leaseOwner: 'replacement-owner',
      leaseUntil: new Date(Date.now() + 60_000)
    }, { where: { id: duplicate.id } });
    delayed.releaseOwnershipCheck();

    await expect(promotion).rejects.toMatchObject({ code: 'FEED_LEASE_LOST' });
    expect(await Feed.findByPk(duplicate.id)).toMatchObject({
      url: originalUrl,
      leaseOwner: 'replacement-owner'
    });
    expect(await FeedUrlAlias.count({
      where: { userId: fixture.user.id, originalUrl: promotedUrl }
    })).toBe(0);
  });

  it('rolls back crawl reconciliation and article transfers when ownership changes', async () => {
    const fixture = await createOwner();
    const { stable, duplicate } = await createFeedPair(fixture);
    const article = await createArticle(duplicate, unique('lease-lost-article'));
    await duplicate.update({
      leaseOwner: 'reconcile-owner',
      leaseUntil: new Date(Date.now() + 60_000)
    });
    const delayed = createDelayedLeaseExecution(duplicate);

    const reconciliation = reconcileDuplicateFeeds({
      userId: fixture.user.id,
      feedIds: [stable.id, duplicate.id],
      preferredSurvivorId: stable.id,
      execution: delayed.execution
    });
    await delayed.ownershipCheckStarted;
    await Feed.update({
      leaseOwner: 'replacement-owner',
      leaseUntil: new Date(Date.now() + 60_000)
    }, { where: { id: duplicate.id } });
    delayed.releaseOwnershipCheck();

    await expect(reconciliation).rejects.toMatchObject({ code: 'FEED_LEASE_LOST' });
    expect(await Feed.count({
      where: { id: { [Op.in]: [stable.id, duplicate.id] } }
    })).toBe(2);
    expect(await Article.findByPk(article.id)).toMatchObject({ feedId: duplicate.id });
    expect(await FeedUrlAlias.count({ where: { feedId: duplicate.id } })).toBe(1);
  });

  it('defers reconciliation when a participating feed has a foreign live lease', async () => {
    const fixture = await createOwner();
    const { stable, duplicate } = await createFeedPair(fixture);
    const article = await createArticle(duplicate, unique('foreign-lease'));
    const leaseUntil = new Date(Math.ceil(Date.now() / 1000) * 1000 + 60_000);
    await stable.update({ leaseOwner: 'foreign-owner', leaseUntil });
    await duplicate.update({ leaseOwner: 'caller-owner', leaseUntil });
    const execution = {
      deadlineAt: Date.now() + 30_000,
      lease: { feedId: duplicate.id, leaseOwner: 'caller-owner' },
      assertLeaseOwnership: options => assertFeedLeaseOwnership({
        feedId: duplicate.id,
        leaseOwner: 'caller-owner'
      }, options)
    };

    await expect(reconcileDuplicateFeeds({
      userId: fixture.user.id,
      feedIds: [stable.id, duplicate.id],
      preferredSurvivorId: stable.id,
      execution
    })).rejects.toMatchObject({ code: 'FEED_RECONCILIATION_LEASE_CONFLICT' });

    expect(await Feed.count({
      where: { id: { [Op.in]: [stable.id, duplicate.id] } }
    })).toBe(2);
    expect(await Feed.findByPk(stable.id)).toMatchObject({
      leaseOwner: 'foreign-owner',
      leaseUntil
    });
    expect(await Article.findByPk(article.id)).toMatchObject({ feedId: duplicate.id });
  });

  it('transfers the caller lease to an expired survivor during reconciliation', async () => {
    const fixture = await createOwner();
    const { stable, duplicate } = await createFeedPair(fixture);
    const callerLeaseUntil = new Date(Math.ceil(Date.now() / 1000) * 1000 + 60_000);
    await stable.update({
      leaseOwner: 'expired-owner',
      leaseUntil: new Date(Date.now() - 60_000)
    });
    await duplicate.update({
      leaseOwner: 'caller-owner',
      leaseUntil: callerLeaseUntil
    });
    const execution = {
      deadlineAt: Date.now() + 30_000,
      lease: { feedId: duplicate.id, leaseOwner: 'caller-owner' },
      assertLeaseOwnership: options => assertFeedLeaseOwnership({
        feedId: duplicate.id,
        leaseOwner: 'caller-owner'
      }, options)
    };

    const result = await reconcileDuplicateFeeds({
      userId: fixture.user.id,
      feedIds: [stable.id, duplicate.id],
      preferredSurvivorId: stable.id,
      execution
    });
    const survivor = await Feed.findByPk(stable.id);

    expect(result).toMatchObject({ survivor: { id: stable.id }, reconciled: true });
    expect(survivor).toMatchObject({
      leaseOwner: 'caller-owner',
      leaseUntil: callerLeaseUntil
    });
    expect(await Feed.findByPk(duplicate.id)).toBeNull();
  });

  it('persists every endpoint in an accepted multi-hop redirect chain', async () => {
    const fixture = await createOwner();
    const { duplicate } = await createFeedPair(fixture);
    const intermediateUrl = `https://redirect.example.test/${unique('hop')}.xml`;
    const finalUrl = `https://publisher.example.test/${unique('final')}.xml`;

    const survivor = await persistDiscoveredFeedUrl({
      feed: duplicate,
      discoveredUrl: finalUrl,
      aliases: [
        { originalUrl: duplicate.url, aliasType: 'redirect' },
        { originalUrl: intermediateUrl, aliasType: 'redirect' },
        { originalUrl: intermediateUrl, aliasType: 'redirect' },
        { originalUrl: finalUrl, aliasType: 'redirect' }
      ]
    });
    const aliases = await FeedUrlAlias.findAll({
      where: { userId: fixture.user.id, feedId: survivor.id }
    });

    expect(aliases.map(alias => alias.originalUrl)).toEqual(expect.arrayContaining([
      duplicate.url,
      intermediateUrl,
      finalUrl
    ]));
    expect(new Set(aliases.map(alias => alias.normalizedUrl)).size).toBe(3);
    expect(aliases.find(alias => alias.originalUrl === intermediateUrl)?.aliasType)
      .toBe('redirect');
    expect(aliases.find(alias => alias.originalUrl === finalUrl)?.aliasType)
      .toBe('final');
  });

  it('serializes simultaneous promotions and leaves one feed and one final alias owner', async () => {
    const fixture = await createOwner();
    const { stable, duplicate } = await createFeedPair(fixture);
    const finalUrl = `https://publisher.example.test/${unique('concurrent-final')}.xml`;

    const [first, second] = await Promise.all([
      persistDiscoveredFeedUrl({ feed: stable, discoveredUrl: finalUrl }),
      persistDiscoveredFeedUrl({ feed: duplicate, discoveredUrl: finalUrl })
    ]);

    expect(first.id).toBe(second.id);
    expect(await Feed.count({ where: { userId: fixture.user.id } })).toBe(1);
    expect(await FeedUrlAlias.count({
      where: { userId: fixture.user.id, feedId: first.id }
    })).toBe(3);
  });

  it('never merges feeds across users even when their final URLs match', async () => {
    const firstFixture = await createOwner();
    const secondFixture = await createOwner();
    const first = await createFeedPair(firstFixture);
    const second = await createFeedPair(secondFixture);
    const sharedUrl = 'https://publisher.example.test/shared.xml';

    const promoted = await persistDiscoveredFeedUrl({
      feed: first.duplicate,
      discoveredUrl: sharedUrl
    });
    const otherPromoted = await persistDiscoveredFeedUrl({
      feed: second.duplicate,
      discoveredUrl: sharedUrl
    });

    expect(promoted.userId).toBe(firstFixture.user.id);
    expect(otherPromoted.userId).toBe(secondFixture.user.id);
    expect(promoted.id).not.toBe(otherPromoted.id);
    expect(await Feed.count({ where: { userId: firstFixture.user.id } })).toBe(2);
    expect(await Feed.count({ where: { userId: secondFixture.user.id } })).toBe(2);
  });
});
