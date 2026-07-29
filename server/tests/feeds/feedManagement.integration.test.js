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
import {
  LABEL_PREFIX,
  createGreaderUser,
  greaderActionTokenFor,
  greaderAuthHeaderFor
} from '../helpers/greaderCompatibilityFixture.js';

const mocked = vi.hoisted(() => ({
  discoverRssLink: vi.fn()
}));

vi.mock('../../services/feeds/discoverRssLink.js', () => ({
  default: {
    discoverRssLink: mocked.discoverRssLink
  }
}));

const { Article, Category, Feed, User, sequelize } = db;

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
  });

  afterEach(async () => {
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
    expect(readerResponse.body).toMatchObject({
      query: inputUrl,
      numResults: 1,
      streamId: `feed/${encodeURIComponent(expectedUrl)}`,
      streamName: 'Discovered Publisher Feed',
      streamUrl: `feed/${encodeURIComponent(expectedUrl)}`
    });
  });

  it('routes regular and Reader OPML imports through the same feed initialization', async () => {
    const regularUser = trackUser(await createGreaderUser());
    const readerUser = trackUser(await createGreaderUser());
    const opml = Buffer.from(`<?xml version="1.0"?>
      <opml version="2.0"><body><outline text="Imported">
        <outline type="rss" text="Imported title"
          xmlUrl="https://opml-shared.example.test/source" />
      </outline></body></opml>`);

    const regularResponse = await request(app)
      .post('/api/opml/import')
      .set('Authorization', regularAuthHeaderFor(regularUser))
      .attach('opmlFile', opml, 'regular.opml');
    const readerResponse = await request(app)
      .post('/api/greader/reader/api/0/subscription/import')
      .field('T', greaderActionTokenFor(readerUser))
      .attach('subscriptions_file', opml, 'reader.opml')
      .set('Authorization', greaderAuthHeaderFor(readerUser));
    const [regularFeed, readerFeed] = await Promise.all([
      Feed.findOne({ where: { userId: regularUser.id } }),
      Feed.findOne({ where: { userId: readerUser.id } })
    ]);

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
      url: 'https://opml-shared.example.test/canonical.xml',
      feedName: 'Imported title',
      feedDesc: 'Discovered publisher description',
      feedType: 'rss',
      favicon: 'https://opml-shared.example.test/favicon.ico'
    });
    expect(readerFeed).toMatchObject({
      url: regularFeed.url,
      feedName: regularFeed.feedName,
      feedDesc: regularFeed.feedDesc,
      feedType: regularFeed.feedType,
      favicon: regularFeed.favicon
    });
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
