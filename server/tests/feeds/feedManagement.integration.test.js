import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { Op } from 'sequelize';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import { clearOpmlPreviewJobs } from '../../services/feeds/opmlPreviewJobs.js';
import {
  LABEL_PREFIX,
  createGreaderUser,
  greaderActionTokenFor,
  greaderAuthHeaderFor
} from '../helpers/greaderCompatibilityFixture.js';

const mocked = vi.hoisted(() => ({
  discoverRssLink: vi.fn(),
  testOpmlConnection: vi.fn()
}));

vi.mock('../../services/feeds/discoverRssLink.js', () => ({
  default: {
    discoverRssLink: mocked.discoverRssLink
  }
}));

vi.mock('../../services/feeds/opmlConnection.js', async importOriginal => ({
  ...(await importOriginal()),
  testOpmlConnection: mocked.testOpmlConnection
}));

const { Article, Category, Feed, FeedUrlAlias, User, sequelize } = db;

let app;
let ownedUserIds = [];

// This function tracks test users for scoped database cleanup.
const trackUser = user => {
  ownedUserIds.push(user.id);
  return user;
};

// This function creates a JWT header for the regular RSSMonster feed API.
const regularAuthHeaderFor = user => {
  const token = jwt.sign({
    username: user.username,
    userId: user.id
  }, getJwtSecret());

  return `Bearer ${token}`;
};

// This function polls one asynchronous OPML preview until it reaches a terminal state.
const waitForOpmlPreview = async (user, previewId) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await request(app)
      .get(`/api/opml/preview/${previewId}/status`)
      .set('Authorization', regularAuthHeaderFor(user));
    if (response.body.status !== 'running') return response;
    await new Promise(resolve => setImmediate(resolve));
  }
  throw new Error('OPML preview did not complete');
};

// This function returns deterministic discovered metadata for controller tests.
const discoveredFeedFor = input => {
  const inputUrl = new URL(input);
  const canonicalPath = inputUrl.pathname === '/source'
    ? '/canonical.xml'
    : `${inputUrl.pathname.replace(/\/+$/, '') || '/feed'}.xml`;
  const feedUrl = new URL(canonicalPath, inputUrl.origin).toString();

  return {
    url: feedUrl,
    parsedFeed: {
      title: 'Discovered Publisher Feed',
      description: 'Discovered publisher description',
      format: 'rss',
      faviconUrl: `${inputUrl.origin}/favicon.ico`,
      entries: []
    }
  };
};

// This function creates one owned category for regular feed API requests.
const createCategory = (user, name = 'Regular Category') =>
  Category.create({
    userId: user.id,
    name,
    categoryOrder: 1
  });

describe('shared feed-management integration', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
    app = mod.default;
    await sequelize.authenticate();
  }, 50_000);

  beforeEach(() => {
    mocked.discoverRssLink.mockReset().mockImplementation(async input =>
      discoveredFeedFor(input)
    );
    mocked.testOpmlConnection.mockReset().mockResolvedValue('available');
  });

  afterEach(async () => {
    clearOpmlPreviewJobs();
    if (ownedUserIds.length > 0) {
      await User.destroy({ where: { id: { [Op.in]: ownedUserIds } } });
    }
    ownedUserIds = [];
  });

  it('initializes regular and Google Reader feeds through the same discovery result', async () => {
    const regularUser = trackUser(await createGreaderUser());
    const readerUser = trackUser(await createGreaderUser());
    const regularCategory = await createCategory(regularUser);
    const inputUrl = 'https://publisher.example.test/site';
    const expectedUrl = 'https://publisher.example.test/site.xml';

    const validationResponse = await request(app)
      .post('/api/feeds/validate')
      .set('Authorization', regularAuthHeaderFor(regularUser))
      .send({
        categoryId: regularCategory.id,
        url: inputUrl
      });
    const regularResponse = await request(app)
      .post('/api/feeds')
      .set('Authorization', regularAuthHeaderFor(regularUser))
      .send({
        categoryId: regularCategory.id,
        url: inputUrl,
        status: 'active'
      });
    const readerResponse = await request(app)
      .post('/api/greader/reader/api/0/subscription/quickadd')
      .type('form')
      .send({
        quickadd: inputUrl,
        T: greaderActionTokenFor(readerUser)
      })
      .set('Authorization', greaderAuthHeaderFor(readerUser));
    const regularFeed = await Feed.findOne({
      where: { userId: regularUser.id }
    });
    const readerFeed = await Feed.findOne({
      where: { userId: readerUser.id }
    });
    const readerCategory = await Category.findByPk(readerFeed.categoryId);

    expect(validationResponse.status).toBe(200);
    expect(validationResponse.body).toMatchObject({
      categoryId: regularCategory.id,
      url: expectedUrl,
      feedName: 'Discovered Publisher Feed',
      feedDesc: 'Discovered publisher description',
      feedType: 'rss',
      favicon: 'https://publisher.example.test/favicon.ico'
    });
    expect(regularResponse.status).toBe(201);
    expect(readerResponse.status).toBe(200);
    expect([regularFeed, readerFeed]).toEqual([
      expect.objectContaining({
        url: expectedUrl,
        feedName: 'Discovered Publisher Feed',
        feedDesc: 'Discovered publisher description',
        feedType: 'rss',
        favicon: 'https://publisher.example.test/favicon.ico',
        status: 'active',
        lastFetched: null
      }),
      expect.objectContaining({
        url: expectedUrl,
        feedName: 'Discovered Publisher Feed',
        feedDesc: 'Discovered publisher description',
        feedType: 'rss',
        favicon: 'https://publisher.example.test/favicon.ico',
        status: 'active',
        lastFetched: null
      })
    ]);
    expect(regularFeed.crawlSince).toBeInstanceOf(Date);
    expect(readerFeed.crawlSince).toBeInstanceOf(Date);
    expect(readerCategory.name).toBe('Uncategorized');
    const regularAliases = await FeedUrlAlias.findAll({
      where: { userId: regularUser.id, feedId: regularFeed.id }
    });
    expect(regularAliases).toHaveLength(2);
    expect(regularAliases.map(alias => alias.aliasType).sort()).toEqual([
      'final',
      'input'
    ]);
    expect(regularAliases.map(alias => alias.originalUrl)).toEqual(
      expect.arrayContaining([inputUrl, expectedUrl])
    );
    expect(await FeedUrlAlias.count({
      where: { userId: readerUser.id, feedId: readerFeed.id }
    })).toBe(2);
    expect(readerResponse.body).toMatchObject({
      query: inputUrl,
      numResults: 1,
      streamId: `feed/${encodeURIComponent(expectedUrl)}`,
      streamName: 'Discovered Publisher Feed',
      streamUrl: `feed/${encodeURIComponent(expectedUrl)}`
    });
  });

  it('records every accepted subscription redirect with stable endpoint provenance', async () => {
    const user = trackUser(await createGreaderUser());
    const category = await createCategory(user);
    const inputUrl = 'https://redirect-subscribe.example.test/source';
    const intermediateUrl = 'https://edge-subscribe.example.test/feed.xml';
    const finalUrl = 'https://redirect-subscribe.example.test/canonical.xml';
    const discovery = discoveredFeedFor(inputUrl);
    mocked.discoverRssLink.mockResolvedValue({
      ...discovery,
      fetchOutcome: {
        type: 'changed',
        response: {
          url: finalUrl,
          redirects: [
            { fromUrl: inputUrl, toUrl: intermediateUrl, status: 301 },
            { fromUrl: intermediateUrl, toUrl: finalUrl, status: 308 }
          ]
        }
      }
    });

    const response = await request(app)
      .post('/api/feeds')
      .set('Authorization', regularAuthHeaderFor(user))
      .send({ categoryId: category.id, url: inputUrl, status: 'active' });
    const feed = await Feed.findOne({ where: { userId: user.id } });
    const aliases = await FeedUrlAlias.findAll({ where: { feedId: feed.id } });

    expect(response.status).toBe(201);
    expect(aliases.map(alias => ({
      url: alias.originalUrl,
      type: alias.aliasType
    }))).toEqual(expect.arrayContaining([
      { url: inputUrl, type: 'input' },
      { url: intermediateUrl, type: 'redirect' },
      { url: finalUrl, type: 'final' }
    ]));
  });

  it('discards oversized optional publisher metadata before creating a feed', async () => {
    const user = trackUser(await createGreaderUser());
    const category = await createCategory(user);
    const inputUrl = 'https://hostile-metadata.example.test/feed.xml';
    mocked.discoverRssLink.mockResolvedValue({
      url: inputUrl,
      parsedFeed: {
        title: 't'.repeat(256),
        description: 'd'.repeat(65_536),
        format: 'rss',
        faviconUrl: `https://hostile-metadata.example.test/${'i'.repeat(220)}`,
        selfUrl: `https://hostile-metadata.example.test/${'s'.repeat(8192)}`,
        entries: []
      },
      publisherSelf: {
        accepted: false,
        declaredUrl: `https://hostile-metadata.example.test/${'s'.repeat(8192)}`,
        resolvedUrl: null,
        status: 'unrelated',
        diagnostic: 'Oversized declaration',
        aliases: []
      }
    });
    const { addFeedSubscription } = await import(
      '../../services/feeds/feedManagement.js'
    );

    const result = await addFeedSubscription({
      userId: user.id,
      inputUrl,
      categoryId: category.id
    });
    await result.feed.reload();

    expect(result.feed).toMatchObject({
      feedName: 'hostile-metadata.example.test',
      feedDesc: null,
      favicon: null,
      publisherSelfUrl: null,
      publisherSelfStatus: 'unrelated'
    });
  });

  it('stores regular and Reader OPML subscriptions without feed discovery', async () => {
    const regularUser = trackUser(await createGreaderUser());
    const readerUser = trackUser(await createGreaderUser());
    await createCategory(regularUser, 'Existing Category');
    mocked.testOpmlConnection.mockResolvedValue('temporarily_unavailable');
    mocked.discoverRssLink.mockResolvedValue(undefined);
    const opml = Buffer.from(`<?xml version="1.0"?>
      <opml version="2.0"><body><outline text="Imported">
        <outline type="rss" text="Imported title"
          xmlUrl="https://opml-shared.example.test/source" />
      </outline></body></opml>`);

    const previewStart = await request(app)
      .post('/api/opml/preview')
      .set('Authorization', regularAuthHeaderFor(regularUser))
      .attach('opmlFile', opml, 'regular.opml');
    const previewResponse = await waitForOpmlPreview(
      regularUser,
      previewStart.body.previewId
    );
    const regularResponse = await request(app)
      .post('/api/opml/import')
      .set('Authorization', regularAuthHeaderFor(regularUser))
      .send(previewResponse.body.preview);
    const readerResponse = await request(app)
      .post('/api/greader/reader/api/0/subscription/import')
      .field('T', greaderActionTokenFor(readerUser))
      .attach('subscriptions_file', opml, 'reader.opml')
      .set('Authorization', greaderAuthHeaderFor(readerUser));
    const [regularFeed, readerFeed] = await Promise.all([
      Feed.findOne({ where: { userId: regularUser.id } }),
      Feed.findOne({ where: { userId: readerUser.id } })
    ]);

    expect(previewStart.status).toBe(202);
    expect(previewStart.body).toMatchObject({
      status: 'running',
      checkedFeeds: 0,
      totalFeeds: 1
    });
    expect(previewResponse.status).toBe(200);
    expect(previewResponse.body.preview).toMatchObject({
      subscriptionCount: 1,
      categories: [{ name: 'Imported', subscriptionCount: 1 }],
      categoryOptions: expect.arrayContaining([{
        name: 'Existing Category',
        alreadyExists: true,
        fromOpml: false
      }, {
        name: 'Imported',
        alreadyExists: false,
        fromOpml: true
      }]),
      subscriptions: [{
        alreadySubscribed: false,
        connectionStatus: 'temporarily_unavailable'
      }]
    });
    expect(mocked.testOpmlConnection).toHaveBeenCalledOnce();
    expect(regularResponse.status).toBe(200);
    expect(regularResponse.body).toMatchObject({
      message: 'OPML import completed',
      categoriesCreated: 1,
      feedsCreated: 1,
      feedsExisting: 0,
      feedsFailed: 0
    });
    expect(readerResponse.status).toBe(200);
    expect(readerResponse.text).toBe('OK');
    expect(regularFeed).toMatchObject({
      url: 'https://opml-shared.example.test/source',
      feedName: 'Imported title',
      feedDesc: null,
      feedType: null,
      favicon: null
    });
    expect(readerFeed).toMatchObject({
      url: regularFeed.url,
      feedName: regularFeed.feedName,
      feedDesc: regularFeed.feedDesc,
      feedType: regularFeed.feedType,
      favicon: regularFeed.favicon
    });
    expect(mocked.discoverRssLink).not.toHaveBeenCalled();
  });

  it('returns regular validation failure and a protocol zero-result for discovery failure', async () => {
    const regularUser = trackUser(await createGreaderUser());
    const readerUser = trackUser(await createGreaderUser());
    const regularCategory = await createCategory(regularUser);
    const inputUrl = 'https://invalid-feed.example.test/source';
    mocked.discoverRssLink.mockResolvedValue(undefined);

    const regularResponse = await request(app)
      .post('/api/feeds')
      .set('Authorization', regularAuthHeaderFor(regularUser))
      .send({
        categoryId: regularCategory.id,
        url: inputUrl,
        status: 'active'
      });
    const readerResponse = await request(app)
      .post('/api/greader/reader/api/0/subscription/quickadd')
      .type('form')
      .send({
        quickadd: inputUrl,
        T: greaderActionTokenFor(readerUser)
      })
      .set('Authorization', greaderAuthHeaderFor(readerUser));

    expect(regularResponse.status).toBe(400);
    expect(regularResponse.body).toEqual({
      error_msg: 'Feed url is invalid. Are you sure the RSS feed is correct?'
    });
    expect(readerResponse.status).toBe(200);
    expect(readerResponse.body).toEqual({
      query: inputUrl,
      numResults: 0,
      streamId: '',
      streamName: '',
      streamUrl: ''
    });
    expect(await Feed.count({
      where: { userId: { [Op.in]: [regularUser.id, readerUser.id] } }
    })).toBe(0);
  });

  it('applies the outbound SSRF guard to regular and Google Reader additions', async () => {
    const actualDiscovery = await vi.importActual(
      '../../services/feeds/discoverRssLink.js'
    );
    mocked.discoverRssLink.mockImplementation(
      actualDiscovery.discoverRssLink
    );
    const regularUser = trackUser(await createGreaderUser());
    const readerUser = trackUser(await createGreaderUser());
    const regularCategory = await createCategory(regularUser);
    const internalUrl = 'http://127.0.0.1/private-feed';

    const regularResponse = await request(app)
      .post('/api/feeds')
      .set('Authorization', regularAuthHeaderFor(regularUser))
      .send({
        categoryId: regularCategory.id,
        url: internalUrl,
        status: 'active'
      });
    const readerResponse = await request(app)
      .post('/api/greader/reader/api/0/subscription/quickadd')
      .type('form')
      .send({
        quickadd: internalUrl,
        T: greaderActionTokenFor(readerUser)
      })
      .set('Authorization', greaderAuthHeaderFor(readerUser));

    expect(regularResponse.status).toBe(400);
    expect(readerResponse.status).toBe(200);
    expect(readerResponse.body.numResults).toBe(0);
    expect(await Feed.count({
      where: { userId: { [Op.in]: [regularUser.id, readerUser.id] } }
    })).toBe(0);
  });

  it('treats a canonical duplicate as one subscription and applies Reader metadata changes', async () => {
    const user = trackUser(await createGreaderUser());
    const sourceCategory = await createCategory(user, 'Source');
    const targetCategory = await createCategory(user, 'Target');
    const inputUrl = 'https://duplicate.example.test/source';

    const regularResponse = await request(app)
      .post('/api/feeds')
      .set('Authorization', regularAuthHeaderFor(user))
      .send({
        categoryId: sourceCategory.id,
        url: inputUrl,
        status: 'active'
      });
    const readerResponse = await request(app)
      .post('/api/greader/reader/api/0/subscription/edit')
      .type('form')
      .send({
        s: `feed/${encodeURIComponent(inputUrl)}`,
        ac: 'subscribe',
        t: 'Reader Rename',
        a: `${LABEL_PREFIX}${encodeURIComponent(targetCategory.name)}`,
        T: greaderActionTokenFor(user)
      })
      .set('Authorization', greaderAuthHeaderFor(user));
    const feeds = await Feed.findAll({ where: { userId: user.id } });

    expect(regularResponse.status).toBe(201);
    expect(readerResponse.status).toBe(200);
    expect(readerResponse.text).toBe('OK');
    expect(feeds).toHaveLength(1);
    expect(feeds[0]).toMatchObject({
      url: 'https://duplicate.example.test/canonical.xml',
      feedName: 'Reader Rename',
      categoryId: targetCategory.id
    });
  });

  it('gives an added category precedence when edit supplies both add and remove', async () => {
    const user = trackUser(await createGreaderUser());
    const sourceCategory = await createCategory(user, 'Source');
    const targetCategory = await createCategory(user, 'Target');
    const feed = await Feed.create({
      userId: user.id,
      categoryId: sourceCategory.id,
      feedName: 'Existing Feed',
      url: 'https://edit.example.test/feed.xml'
    });

    const response = await request(app)
      .post('/api/greader/reader/api/0/subscription/edit')
      .type('form')
      .send({
        s: `feed/${encodeURIComponent(feed.url)}`,
        ac: 'edit',
        t: 'Atomic Rename',
        a: `${LABEL_PREFIX}${encodeURIComponent(targetCategory.name)}`,
        r: `${LABEL_PREFIX}${encodeURIComponent(sourceCategory.name)}`,
        T: greaderActionTokenFor(user)
      })
      .set('Authorization', greaderAuthHeaderFor(user));
    await feed.reload();

    expect(response.status).toBe(200);
    expect(feed.feedName).toBe('Atomic Rename');
    expect(feed.categoryId).toBe(targetCategory.id);
  });

  it('reactivates a corrected quarantined feed with clean endpoint state', async () => {
    const user = trackUser(await createGreaderUser());
    const category = await createCategory(user);
    const oldUrl = 'https://manual-reset.example.test/broken.xml';
    const nextUrl = 'https://manual-reset.example.test/corrected.xml';
    const now = new Date('2026-08-09T12:00:00.000Z');
    const feed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Quarantined feed',
      url: oldUrl,
      status: 'error',
      etag: '"broken"',
      lastModified: 'Sat, 08 Aug 2026 00:00:00 GMT',
      contentHash: 'broken-content-hash',
      cacheFreshUntil: new Date('2026-08-10T00:00:00.000Z'),
      publisherSelfUrl: 'https://manual-reset.example.test/self.xml',
      publisherSelfStatus: 'unrelated',
      publisherSelfCheckedAt: new Date('2026-08-08T00:00:00.000Z'),
      publisherSelfDiagnostic: 'Old endpoint identity did not match',
      errorCount: 4,
      errorMessage: 'Malformed feed',
      errorSince: new Date('2026-08-01T00:00:00.000Z'),
      consecutiveFailures: 4,
      lastFetchOutcome: 'malformed',
      nextFetchAt: null
    });
    const [{ updateFeedSubscription }, { deterministicJitterMs }] = await Promise.all([
      import('../../services/feeds/feedManagement.js'),
      import('../../services/feeds/feedScheduling.js')
    ]);

    await updateFeedSubscription({
      userId: user.id,
      feedId: feed.id,
      updates: { url: nextUrl, feedName: 'Corrected feed' },
      clock: () => now
    });
    await feed.reload();

    expect(feed).toMatchObject({
      url: nextUrl,
      feedName: 'Corrected feed',
      status: 'active',
      etag: null,
      lastModified: null,
      contentHash: null,
      cacheFreshUntil: null,
      publisherSelfUrl: null,
      publisherSelfStatus: null,
      publisherSelfCheckedAt: null,
      publisherSelfDiagnostic: null,
      errorCount: 0,
      errorMessage: null,
      errorSince: null,
      consecutiveFailures: 0,
      lastFetchOutcome: null
    });
    expect(feed.nextFetchAt.getTime()).toBe(
      Math.floor((now.getTime() + deterministicJitterMs(feed.id)) / 1000) * 1000
    );
    const aliases = await FeedUrlAlias.findAll({ where: { feedId: feed.id } });
    expect(aliases.map(alias => alias.originalUrl)).toEqual(
      expect.arrayContaining([oldUrl, nextUrl])
    );
  });

  it('preserves endpoint state when the normalized URL is unchanged', async () => {
    const user = trackUser(await createGreaderUser());
    const category = await createCategory(user);
    const url = 'https://manual-reset.example.test/stable.xml';
    const cacheFreshUntil = new Date('2026-08-10T00:00:00.000Z');
    const errorSince = new Date('2026-08-01T00:00:00.000Z');
    const feed = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Stable endpoint',
      url,
      status: 'error',
      etag: '"stable"',
      lastModified: 'Sat, 08 Aug 2026 00:00:00 GMT',
      contentHash: 'stable-content-hash',
      cacheFreshUntil,
      publisherSelfUrl: 'https://manual-reset.example.test/self.xml',
      publisherSelfStatus: 'validated',
      publisherSelfCheckedAt: new Date('2026-08-08T00:00:00.000Z'),
      publisherSelfDiagnostic: 'Validated endpoint',
      errorCount: 3,
      errorMessage: 'Temporary failure',
      errorSince,
      consecutiveFailures: 3,
      lastFetchOutcome: 'malformed',
      nextFetchAt: null
    });
    const { updateFeedSubscription } = await import(
      '../../services/feeds/feedManagement.js'
    );

    await updateFeedSubscription({
      userId: user.id,
      feedId: feed.id,
      updates: { url: `${url}#ignored`, feedName: 'Renamed endpoint' }
    });
    await feed.reload();

    expect(feed).toMatchObject({
      url,
      feedName: 'Renamed endpoint',
      status: 'error',
      etag: '"stable"',
      lastModified: 'Sat, 08 Aug 2026 00:00:00 GMT',
      contentHash: 'stable-content-hash',
      cacheFreshUntil,
      publisherSelfUrl: 'https://manual-reset.example.test/self.xml',
      publisherSelfStatus: 'validated',
      publisherSelfDiagnostic: 'Validated endpoint',
      errorCount: 3,
      errorMessage: 'Temporary failure',
      errorSince,
      consecutiveFailures: 3,
      lastFetchOutcome: 'malformed',
      nextFetchAt: null
    });
  });

  it('serializes concurrent default-category creation without duplicates', async () => {
    const user = trackUser(await createGreaderUser());
    const add = quickadd => request(app)
      .post('/api/greader/reader/api/0/subscription/quickadd')
      .type('form')
      .send({
        quickadd,
        T: greaderActionTokenFor(user)
      })
      .set('Authorization', greaderAuthHeaderFor(user));

    const responses = await Promise.all([
      add('https://concurrent.example.test/one'),
      add('https://concurrent.example.test/two')
    ]);
    const defaultCategories = await Category.findAll({
      where: { userId: user.id, name: 'Uncategorized' }
    });

    expect(responses.map(response => response.status)).toEqual([200, 200]);
    expect(defaultCategories).toHaveLength(1);
    expect(await Feed.count({ where: { userId: user.id } })).toBe(2);
  });

  it('resolves conservative input URL variants before repeating discovery', async () => {
    const user = trackUser(await createGreaderUser());
    const category = await createCategory(user);
    const firstInput =
      'HTTPS://Identity.Example.Test:443/a/../feeds/%66eed.xml#first';
    const equivalentInput =
      'https://identity.example.test/feeds/feed.xml#second';

    const first = await request(app)
      .post('/api/feeds')
      .set('Authorization', regularAuthHeaderFor(user))
      .send({ categoryId: category.id, url: firstInput, status: 'active' });
    const callsAfterFirst = mocked.discoverRssLink.mock.calls.length;
    const second = await request(app)
      .post('/api/feeds')
      .set('Authorization', regularAuthHeaderFor(user))
      .send({ categoryId: category.id, url: equivalentInput, status: 'active' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(mocked.discoverRssLink).toHaveBeenCalledTimes(callsAfterFirst);
    expect(await Feed.count({ where: { userId: user.id } })).toBe(1);
  });

  it('keeps case-sensitive path and meaningful query variants distinct', async () => {
    const user = trackUser(await createGreaderUser());
    const category = await createCategory(user);
    mocked.discoverRssLink.mockImplementation(async input => ({
      url: input,
      parsedFeed: {
        title: `Feed ${input}`,
        description: null,
        format: 'rss',
        faviconUrl: null,
        entries: []
      }
    }));

    for (const url of [
      'https://distinct.example.test/Feed.xml',
      'https://distinct.example.test/feed.xml',
      'https://distinct.example.test/query.xml?view=full',
      'https://distinct.example.test/query.xml?view=summary'
    ]) {
      const response = await request(app)
        .post('/api/feeds')
        .set('Authorization', regularAuthHeaderFor(user))
        .send({ categoryId: category.id, url, status: 'active' });
      expect(response.status).toBe(201);
    }

    expect(await Feed.count({ where: { userId: user.id } })).toBe(4);
  });

  it('uses the same aliases for regular, Google Reader, and OPML additions', async () => {
    const user = trackUser(await createGreaderUser());
    const category = await createCategory(user);
    const inputUrl = 'https://shared-alias.example.test/source#regular';
    const regular = await request(app)
      .post('/api/feeds')
      .set('Authorization', regularAuthHeaderFor(user))
      .send({ categoryId: category.id, url: inputUrl, status: 'active' });
    const callsAfterRegular = mocked.discoverRssLink.mock.calls.length;

    const reader = await request(app)
      .post('/api/greader/reader/api/0/subscription/quickadd')
      .type('form')
      .send({
        quickadd: 'https://SHARED-ALIAS.example.test:443/source#reader',
        T: greaderActionTokenFor(user)
      })
      .set('Authorization', greaderAuthHeaderFor(user));
    const readerEdit = await request(app)
      .post('/api/greader/reader/api/0/subscription/edit')
      .type('form')
      .send({
        s: `feed/${encodeURIComponent(
          'https://shared-alias.example.test/source#edit'
        )}`,
        ac: 'edit',
        t: 'Alias-aware Reader edit',
        T: greaderActionTokenFor(user)
      })
      .set('Authorization', greaderAuthHeaderFor(user));
    const opml = Buffer.from(`<?xml version="1.0"?>
      <opml version="2.0"><body><outline type="rss" text="Same feed"
        xmlUrl="https://shared-alias.example.test/source#opml" /></body></opml>`);
    const previewStart = await request(app)
      .post('/api/opml/preview')
      .set('Authorization', regularAuthHeaderFor(user))
      .attach('opmlFile', opml, 'aliases.opml');
    const previewed = await waitForOpmlPreview(user, previewStart.body.previewId);
    const imported = await request(app)
      .post('/api/opml/import')
      .set('Authorization', regularAuthHeaderFor(user))
      .send(previewed.body.preview);

    expect(regular.status).toBe(201);
    expect(reader.status).toBe(200);
    expect(reader.body.numResults).toBe(1);
    expect(readerEdit.status).toBe(200);
    expect(previewed.status).toBe(200);
    expect(previewStart.status).toBe(202);
    expect(previewStart.body.totalFeeds).toBe(0);
    expect(previewed.body.preview.subscriptions).toEqual([
      expect.objectContaining({
        alreadySubscribed: true,
        connectionStatus: 'not_checked'
      })
    ]);
    expect(mocked.testOpmlConnection).not.toHaveBeenCalled();
    expect(imported.status).toBe(200);
    expect(imported.body).toMatchObject({ feedsCreated: 0, feedsExisting: 0 });
    expect(mocked.discoverRssLink).toHaveBeenCalledTimes(callsAfterRegular);
    expect(await Feed.count({ where: { userId: user.id } })).toBe(1);
    expect(await Feed.count({
      where: { userId: user.id, feedName: 'Alias-aware Reader edit' }
    })).toBe(1);
  });

  it('serializes concurrent aliases for one discovered feed', async () => {
    const user = trackUser(await createGreaderUser());
    const finalUrl = 'https://concurrent-alias.example.test/final.xml';
    mocked.discoverRssLink.mockResolvedValue({
      url: finalUrl,
      parsedFeed: {
        title: 'Concurrent alias feed',
        description: null,
        format: 'rss',
        faviconUrl: null,
        entries: []
      }
    });
    const { addFeedSubscription } = await import(
      '../../services/feeds/feedManagement.js'
    );

    const results = await Promise.all([
      addFeedSubscription({
        userId: user.id,
        inputUrl: 'https://concurrent-alias.example.test/one',
        useDefaultCategory: true,
        allowExisting: true
      }),
      addFeedSubscription({
        userId: user.id,
        inputUrl: 'https://concurrent-alias.example.test/two',
        useDefaultCategory: true,
        allowExisting: true
      })
    ]);
    const feeds = await Feed.findAll({ where: { userId: user.id } });
    const aliases = await FeedUrlAlias.findAll({ where: { userId: user.id } });

    expect(results.filter(result => result.created)).toHaveLength(1);
    expect(feeds).toHaveLength(1);
    expect(new Set(aliases.map(alias => alias.normalizedUrl)).size).toBe(3);
    expect(new Set(aliases.map(alias => alias.feedId))).toEqual(new Set([feeds[0].id]));
  });

  it('treats a validated publisher self URL and CDN endpoint as one subscription', async () => {
    const user = trackUser(await createGreaderUser());
    const category = await createCategory(user);
    const cdnUrl = 'https://cdn-self.example.test/feed.xml';
    const selfUrl = 'https://publisher-self.example.test/canonical.xml';
    mocked.discoverRssLink.mockResolvedValue({
      url: cdnUrl,
      parsedFeed: {
        title: 'Publisher self feed',
        description: null,
        format: 'atom',
        faviconUrl: null,
        selfUrl,
        entries: []
      },
      publisherSelf: {
        accepted: true,
        declaredUrl: selfUrl,
        resolvedUrl: selfUrl,
        status: 'validated',
        diagnostic: 'Validated by stable feed evidence',
        aliases: [{ originalUrl: selfUrl, aliasType: 'publisher_self' }]
      }
    });
    const { addFeedSubscription } = await import(
      '../../services/feeds/feedManagement.js'
    );

    const first = await addFeedSubscription({
      userId: user.id,
      inputUrl: cdnUrl,
      categoryId: category.id,
      allowExisting: true
    });
    const callsAfterFirst = mocked.discoverRssLink.mock.calls.length;
    const second = await addFeedSubscription({
      userId: user.id,
      inputUrl: selfUrl,
      categoryId: category.id,
      allowExisting: true
    });

    expect(first.created).toBe(true);
    expect(second).toMatchObject({ created: false, feed: { id: first.feed.id } });
    expect(mocked.discoverRssLink).toHaveBeenCalledTimes(callsAfterFirst);
    expect(await Feed.count({ where: { userId: user.id } })).toBe(1);
    expect(await FeedUrlAlias.findOne({
      where: { userId: user.id, aliasType: 'publisher_self' }
    })).toMatchObject({ feedId: first.feed.id, originalUrl: selfUrl });
  });

  it('serializes crawl promotion with a concurrent subscription to the same final URL', async () => {
    const user = trackUser(await createGreaderUser());
    const category = await createCategory(user);
    const existing = await Feed.create({
      userId: user.id,
      categoryId: category.id,
      feedName: 'Existing crawl subscription',
      url: 'https://crawl-subscribe.example.test/original.xml',
      lastSuccessAt: new Date('2026-08-08T00:00:00.000Z')
    });
    const finalUrl = 'https://crawl-subscribe.example.test/final.xml';
    mocked.discoverRssLink.mockResolvedValue({
      url: finalUrl,
      parsedFeed: {
        title: 'Concurrent crawl subscription',
        description: null,
        format: 'rss',
        faviconUrl: null,
        entries: []
      }
    });
    const [{ addFeedSubscription }, { persistDiscoveredFeedUrl, registerFeedUrlAliases }] =
      await Promise.all([
        import('../../services/feeds/feedManagement.js'),
        import('../../services/feeds/feedUrlAliases.js')
      ]);
    await registerFeedUrlAliases({
      userId: user.id,
      feedId: existing.id,
      candidates: [{ originalUrl: existing.url, aliasType: 'input' }]
    });

    const [promoted, subscribed] = await Promise.all([
      persistDiscoveredFeedUrl({ feed: existing, discoveredUrl: finalUrl }),
      addFeedSubscription({
        userId: user.id,
        inputUrl: 'https://crawl-subscribe.example.test/new-subscription',
        categoryId: category.id,
        allowExisting: true
      })
    ]);
    const feeds = await Feed.findAll({ where: { userId: user.id } });
    const aliases = await FeedUrlAlias.findAll({ where: { userId: user.id } });

    expect(feeds).toHaveLength(1);
    expect(promoted.id).toBe(feeds[0].id);
    expect(subscribed.feed.id).toBe(feeds[0].id);
    expect(new Set(aliases.map(alias => alias.feedId))).toEqual(new Set([feeds[0].id]));
  });

  it('keeps equivalent aliases strictly user scoped', async () => {
    const firstUser = trackUser(await createGreaderUser());
    const secondUser = trackUser(await createGreaderUser());
    const inputUrl = 'https://user-scoped-alias.example.test/source';

    for (const user of [firstUser, secondUser]) {
      const response = await request(app)
        .post('/api/greader/reader/api/0/subscription/quickadd')
        .type('form')
        .send({ quickadd: inputUrl, T: greaderActionTokenFor(user) })
        .set('Authorization', greaderAuthHeaderFor(user));
      expect(response.status).toBe(200);
      expect(response.body.numResults).toBe(1);
    }

    expect(await Feed.count({
      where: { userId: { [Op.in]: [firstUser.id, secondUser.id] } }
    })).toBe(2);
    expect(await FeedUrlAlias.count({
      where: { userId: { [Op.in]: [firstUser.id, secondUser.id] } }
    })).toBe(4);
  });

  it('uses complete article cleanup for regular delete and Reader unsubscribe', async () => {
    const regularUser = trackUser(await createGreaderUser());
    const readerUser = trackUser(await createGreaderUser());
    const regularCategory = await createCategory(regularUser);
    const readerCategory = await createCategory(readerUser);
    const regularFeed = await Feed.create({
      userId: regularUser.id,
      categoryId: regularCategory.id,
      feedName: 'Regular removal',
      url: 'https://remove.example.test/regular.xml'
    });
    const readerFeed = await Feed.create({
      userId: readerUser.id,
      categoryId: readerCategory.id,
      feedName: 'Reader removal',
      url: 'https://remove.example.test/reader.xml'
    });
    const regularArticle = await Article.create({
      userId: regularUser.id,
      feedId: regularFeed.id,
      title: 'Regular article',
      url: 'https://remove.example.test/regular-article',
      publishedAt: new Date('2026-07-01T10:00:00Z')
    });
    const readerArticle = await Article.create({
      userId: readerUser.id,
      feedId: readerFeed.id,
      title: 'Reader article',
      url: 'https://remove.example.test/reader-article',
      publishedAt: new Date('2026-07-01T10:00:00Z')
    });

    const regularResponse = await request(app)
      .delete(`/api/feeds/${regularFeed.id}`)
      .set('Authorization', regularAuthHeaderFor(regularUser));
    const readerResponse = await request(app)
      .post('/api/greader/reader/api/0/subscription/edit')
      .type('form')
      .send({
        s: `feed/${encodeURIComponent(readerFeed.url)}`,
        ac: 'unsubscribe',
        T: greaderActionTokenFor(readerUser)
      })
      .set('Authorization', greaderAuthHeaderFor(readerUser));

    expect(regularResponse.status).toBe(204);
    expect(readerResponse.status).toBe(200);
    expect(await Feed.findByPk(regularFeed.id)).toBeNull();
    expect(await Feed.findByPk(readerFeed.id)).toBeNull();
    expect(await Article.findByPk(regularArticle.id)).toBeNull();
    expect(await Article.findByPk(readerArticle.id)).toBeNull();
  });
});
