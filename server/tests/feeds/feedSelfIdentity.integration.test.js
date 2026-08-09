import {
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import { Op } from 'sequelize';
import db from '../../models/index.js';
import {
  persistPublisherSelfIdentity,
  validatePublisherSelfIdentity
} from '../../services/feeds/feedSelfIdentity.js';
import { registerFeedUrlAliases } from '../../services/feeds/feedUrlAliases.js';
import { assertFeedLeaseOwnership } from '../../services/feeds/feedClaims.js';

const { Category, Feed, FeedUrlAlias, User, sequelize } = db;
let sequence = 0;
let ownedUserIds = [];

// Creates collision-safe values for the shared integration database.
const unique = prefix => `${prefix}-${Date.now()}-${++sequence}`;

// Creates one user-scoped feed fixture.
const createFeed = async (url, userFixture = null) => {
  let fixture = userFixture;
  if (!fixture) {
    const username = `${unique('self-user')}@example.test`;
    const user = await User.create({
      username,
      password: 'test-password',
      feverCredentialHash: `${username}-hash`,
      role: 'user'
    });
    ownedUserIds.push(user.id);
    const category = await Category.create({
      userId: user.id,
      name: unique('Self feeds'),
      categoryOrder: 1
    });
    fixture = { user, category };
  }
  const feed = await Feed.create({
    userId: fixture.user.id,
    categoryId: fixture.category.id,
    feedName: unique('Publisher feed'),
    url
  });
  return { ...fixture, feed };
};

// Builds stable parsed-feed evidence shared by source and validation endpoints.
const parsedFeed = selfUrl => ({
  format: 'atom',
  title: 'Publisher identity feed',
  selfUrl,
  entries: [{
    externalIdType: 'atom-id',
    externalId: 'stable-entry',
    url: 'https://publisher.example.test/articles/stable'
  }, {
    externalIdType: 'atom-id',
    externalId: 'stable-entry-2',
    url: 'https://publisher.example.test/articles/stable-2'
  }]
});

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
  const execution = {
    deadlineAt: Date.now() + 30_000,
    lease: { feedId: feed.id, leaseOwner: feed.leaseOwner },
    leaseState: { lost: false }
  };
  execution.assertLeaseOwnership = async options => {
    reportOwnershipCheck();
    await ownershipCheckReleased;
    return assertFeedLeaseOwnership(execution.lease, options);
  };
  return { execution, ownershipCheckStarted, releaseOwnershipCheck };
};

describe('publisher self identity persistence integration', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
  }, 50_000);

  afterEach(async () => {
    if (ownedUserIds.length > 0) {
      await User.destroy({ where: { id: { [Op.in]: ownedUserIds } } });
    }
    ownedUserIds = [];
  });

  it.each([
    ['atom', 'https://publisher.example.test/absolute-atom.xml'],
    ['json', 'https://publisher.example.test/feed.json']
  ])('persists an absolute %s publisher self URL as a validated alias', async (
    format,
    selfUrl
  ) => {
    const fixture = await createFeed(selfUrl);
    const acquireCandidate = vi.fn();
    const validation = await validatePublisherSelfIdentity({
      userId: fixture.user.id,
      feed: fixture.feed,
      parsedFeed: { ...parsedFeed(selfUrl), format },
      finalFeedUrl: selfUrl,
      acquireCandidate
    });
    await persistPublisherSelfIdentity({ feed: fixture.feed, validation });

    expect(acquireCandidate).not.toHaveBeenCalled();
    expect(validation).toMatchObject({ accepted: true, status: 'validated' });
    expect(await FeedUrlAlias.findOne({
      where: {
        userId: fixture.user.id,
        feedId: fixture.feed.id,
        aliasType: 'publisher_self'
      }
    })).toMatchObject({ originalUrl: selfUrl });
  });

  it('validates a known alias owned by another row before reconciling the duplicate', async () => {
    const canonical = await createFeed('https://publisher.example.test/feed.xml');
    const duplicate = await createFeed(
      'https://cdn.example.test/feed.xml',
      canonical
    );
    await registerFeedUrlAliases({
      userId: canonical.user.id,
      feedId: canonical.feed.id,
      candidates: [{
        originalUrl: canonical.feed.url,
        aliasType: 'publisher_self'
      }]
    });
    const acquireCandidate = vi.fn().mockResolvedValue({
      type: 'changed',
      response: { url: canonical.feed.url, redirects: [] },
      parsedFeed: parsedFeed(canonical.feed.url),
      bodyHash: 'canonical-body'
    });

    const validation = await validatePublisherSelfIdentity({
      userId: canonical.user.id,
      feed: duplicate.feed,
      parsedFeed: parsedFeed(canonical.feed.url),
      finalFeedUrl: duplicate.feed.url,
      acquireCandidate
    });
    const survivor = await persistPublisherSelfIdentity({
      feed: duplicate.feed,
      validation
    });

    expect(validation).toMatchObject({
      accepted: true,
      status: 'validated',
      fetched: true,
      ownerFeedId: canonical.feed.id
    });
    expect(acquireCandidate).toHaveBeenCalledOnce();
    expect(survivor.id).toBe(canonical.feed.id);
    expect(await Feed.count({ where: { userId: canonical.user.id } })).toBe(1);
  });

  it('uses a self alias already owned by the current feed without another fetch', async () => {
    const fixture = await createFeed('https://publisher.example.test/known.xml');
    await registerFeedUrlAliases({
      userId: fixture.user.id,
      feedId: fixture.feed.id,
      candidates: [{
        originalUrl: fixture.feed.url,
        aliasType: 'publisher_self'
      }]
    });
    const acquireCandidate = vi.fn();

    const validation = await validatePublisherSelfIdentity({
      userId: fixture.user.id,
      feed: fixture.feed,
      parsedFeed: parsedFeed(fixture.feed.url),
      finalFeedUrl: 'https://cdn.example.test/known.xml',
      acquireCandidate
    });

    expect(validation).toMatchObject({
      accepted: true,
      status: 'known_alias',
      fetched: false
    });
    expect(acquireCandidate).not.toHaveBeenCalled();
  });

  it('retains an old publisher self alias when a new declaration validates', async () => {
    const fixture = await createFeed('https://publisher.example.test/cdn.xml');
    const oldSelf = 'https://publisher.example.test/old.xml';
    const newSelf = 'https://publisher.example.test/new.xml';
    await registerFeedUrlAliases({
      userId: fixture.user.id,
      feedId: fixture.feed.id,
      candidates: [{ originalUrl: oldSelf, aliasType: 'publisher_self' }]
    });
    const validation = await validatePublisherSelfIdentity({
      userId: fixture.user.id,
      feed: fixture.feed,
      parsedFeed: parsedFeed(newSelf),
      finalFeedUrl: fixture.feed.url,
      acquireCandidate: vi.fn().mockResolvedValue({
        type: 'changed',
        response: {
          url: newSelf,
          redirects: [{
            fromUrl: 'https://publisher.example.test/new-redirect',
            toUrl: newSelf,
            status: 301
          }]
        },
        parsedFeed: parsedFeed(newSelf)
      })
    });
    await persistPublisherSelfIdentity({ feed: fixture.feed, validation });

    const aliases = await FeedUrlAlias.findAll({
      where: { userId: fixture.user.id, feedId: fixture.feed.id }
    });
    expect(aliases.map(alias => alias.originalUrl)).toEqual(
      expect.arrayContaining([
        oldSelf,
        newSelf,
        'https://publisher.example.test/new-redirect'
      ])
    );
    expect(await Feed.findByPk(fixture.feed.id)).toMatchObject({
      publisherSelfUrl: newSelf,
      publisherSelfStatus: 'validated'
    });
  });

  it('serializes concurrent self aliases into one durable feed', async () => {
    const first = await createFeed('https://one.example.test/feed.xml');
    const second = await createFeed('https://two.example.test/feed.xml', first);
    const selfUrl = 'https://publisher.example.test/concurrent.xml';
    const validation = {
      accepted: true,
      declaredUrl: selfUrl,
      resolvedUrl: selfUrl,
      status: 'validated',
      diagnostic: 'concurrent validated self',
      aliases: [{ originalUrl: selfUrl, aliasType: 'publisher_self' }]
    };

    const [firstResult, secondResult] = await Promise.all([
      persistPublisherSelfIdentity({ feed: first.feed, validation }),
      persistPublisherSelfIdentity({ feed: second.feed, validation })
    ]);

    expect(firstResult.id).toBe(secondResult.id);
    expect(await Feed.count({ where: { userId: first.user.id } })).toBe(1);
    expect(await FeedUrlAlias.count({
      where: { userId: first.user.id, normalizedUrl: selfUrl }
    })).toBe(1);
  });

  it('does not reuse another user\'s known self alias', async () => {
    const first = await createFeed('https://first.example.test/feed.xml');
    const second = await createFeed('https://second.example.test/feed.xml');
    const selfUrl = 'https://publisher.example.test/user-scoped.xml';
    await registerFeedUrlAliases({
      userId: first.user.id,
      feedId: first.feed.id,
      candidates: [{ originalUrl: selfUrl, aliasType: 'publisher_self' }]
    });
    const acquireCandidate = vi.fn().mockResolvedValue({
      type: 'malformed',
      error: { message: 'not the second user feed' }
    });

    const validation = await validatePublisherSelfIdentity({
      userId: second.user.id,
      feed: second.feed,
      parsedFeed: parsedFeed(selfUrl),
      finalFeedUrl: second.feed.url,
      acquireCandidate
    });

    expect(acquireCandidate).toHaveBeenCalledOnce();
    expect(validation).toMatchObject({ accepted: false, status: 'malformed' });
    expect(await Feed.count()).toBeGreaterThanOrEqual(2);
  });

  it('does not let a cross-origin declaration hijack another same-user feed', async () => {
    const victim = await createFeed('https://victim.example.test/feed.xml');
    const attacker = await createFeed('https://attacker.example.test/feed.xml', victim);
    await registerFeedUrlAliases({
      userId: victim.user.id,
      feedId: victim.feed.id,
      candidates: [{
        originalUrl: victim.feed.url,
        aliasType: 'publisher_self'
      }]
    });
    const validation = await validatePublisherSelfIdentity({
      userId: attacker.user.id,
      feed: attacker.feed,
      parsedFeed: parsedFeed(victim.feed.url),
      finalFeedUrl: attacker.feed.url,
      acquireCandidate: vi.fn().mockResolvedValue({
        type: 'changed',
        response: { url: victim.feed.url, redirects: [] },
        parsedFeed: {
          ...parsedFeed(victim.feed.url),
          title: 'Actual victim feed',
          entries: [{
            externalIdType: 'atom-id',
            externalId: 'victim-only-entry',
            url: 'https://victim.example.test/articles/only'
          }]
        }
      })
    });
    await persistPublisherSelfIdentity({ feed: attacker.feed, validation });

    expect(validation).toMatchObject({ accepted: false, status: 'unrelated' });
    expect(await Feed.count({ where: { userId: victim.user.id } })).toBe(2);
    expect(await Feed.findByPk(victim.feed.id)).not.toBeNull();
    expect(await Feed.findByPk(attacker.feed.id)).not.toBeNull();
  });

  it('persists rejected diagnostics without invalidating the fetched feed row', async () => {
    const fixture = await createFeed('https://cdn.example.test/valid.xml');
    const selfUrl = 'https://publisher.example.test/unreachable.xml';
    const validation = await validatePublisherSelfIdentity({
      userId: fixture.user.id,
      feed: fixture.feed,
      parsedFeed: parsedFeed(selfUrl),
      finalFeedUrl: fixture.feed.url,
      acquireCandidate: vi.fn().mockResolvedValue({
        type: 'transient_failure',
        error: { message: 'publisher endpoint unavailable' }
      })
    });
    await persistPublisherSelfIdentity({ feed: fixture.feed, validation });

    expect(await Feed.findByPk(fixture.feed.id)).toMatchObject({
      url: fixture.feed.url,
      status: 'active',
      publisherSelfUrl: selfUrl,
      publisherSelfStatus: 'unreachable',
      publisherSelfDiagnostic: 'publisher endpoint unavailable'
    });
    expect(await FeedUrlAlias.count({
      where: { userId: fixture.user.id, originalUrl: selfUrl }
    })).toBe(0);
  });

  it('does not persist publisher self state after execution has expired', async () => {
    const fixture = await createFeed('https://cdn.example.test/expired.xml');
    const selfUrl = 'https://publisher.example.test/expired-self.xml';
    const validation = {
      accepted: true,
      declaredUrl: selfUrl,
      resolvedUrl: selfUrl,
      status: 'validated',
      diagnostic: 'validated before the deadline',
      aliases: [{ originalUrl: selfUrl, aliasType: 'publisher_self' }]
    };

    await expect(persistPublisherSelfIdentity({
      feed: fixture.feed,
      validation,
      execution: { deadlineAt: Date.now() - 1 }
    })).rejects.toMatchObject({ code: 'FEED_EXECUTION_TIMEOUT' });

    expect(await Feed.findByPk(fixture.feed.id)).toMatchObject({
      publisherSelfUrl: null,
      publisherSelfStatus: null
    });
    expect(await FeedUrlAlias.count({
      where: { userId: fixture.user.id, originalUrl: selfUrl }
    })).toBe(0);
  });

  it('rolls back publisher-self state and aliases when crawl ownership changes', async () => {
    const fixture = await createFeed('https://cdn.example.test/lease-source.xml');
    const selfUrl = 'https://publisher.example.test/lease-self.xml';
    const validation = {
      accepted: true,
      declaredUrl: selfUrl,
      resolvedUrl: selfUrl,
      status: 'validated',
      diagnostic: 'validated before lease replacement',
      aliases: [{ originalUrl: selfUrl, aliasType: 'publisher_self' }]
    };
    await fixture.feed.update({
      leaseOwner: 'self-owner',
      leaseUntil: new Date(Date.now() + 60_000)
    });
    const delayed = createDelayedLeaseExecution(fixture.feed);

    const persistence = persistPublisherSelfIdentity({
      feed: fixture.feed,
      validation,
      execution: delayed.execution
    });
    await delayed.ownershipCheckStarted;
    await Feed.update({
      leaseOwner: 'replacement-owner',
      leaseUntil: new Date(Date.now() + 60_000)
    }, { where: { id: fixture.feed.id } });
    delayed.releaseOwnershipCheck();

    await expect(persistence).rejects.toMatchObject({ code: 'FEED_LEASE_LOST' });
    expect(await Feed.findByPk(fixture.feed.id)).toMatchObject({
      publisherSelfUrl: null,
      publisherSelfStatus: null,
      leaseOwner: 'replacement-owner'
    });
    expect(await FeedUrlAlias.count({
      where: { userId: fixture.user.id, originalUrl: selfUrl }
    })).toBe(0);
  });
});
