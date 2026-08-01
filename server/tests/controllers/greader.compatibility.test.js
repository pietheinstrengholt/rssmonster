import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import request from 'supertest';
import { Op } from 'sequelize';
import db from '../../models/index.js';
import { createGreaderAuthToken } from '../../utils/apiCredentials.js';
import { MAX_STREAM_ITEM_ID_COUNT } from '../../services/greader/streamQuery.js';
import {
  LABEL_PREFIX,
  READ_STREAM,
  READING_LIST_STREAM,
  STARRED_STREAM,
  TEST_PASSWORD,
  createGreaderCompatibilityFixture,
  createGreaderUser,
  greaderActionTokenFor,
  greaderAuthHeaderFor,
  toGreaderItemId,
  toUsec
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

// This function tracks fixture users so each test removes only its own database state.
const trackUser = user => {
  ownedUserIds.push(user.id);
  return user;
};

// This function creates and tracks a complete compatibility fixture.
const createFixture = async options => {
  const fixture = await createGreaderCompatibilityFixture(options);
  trackUser(fixture.user);
  return fixture;
};

// This function creates and tracks an account-only fixture.
const createUser = async username => trackUser(await createGreaderUser(username));

// This function returns full item IDs from a stream response.
const responseItemIds = response => response.body.items.map(item => item.id);

// This function requests a stream using its path-form stream ID.
const getStream = (user, streamId, query = {}) =>
  request(app)
    .get(`/api/greader/reader/api/0/stream/contents/${streamId}`)
    .query(query)
    .set('Authorization', greaderAuthHeaderFor(user));

// This function requests item contents with form-encoded repeated IDs.
const getItemContents = (user, itemIds) =>
  request(app)
    .post('/api/greader/reader/api/0/stream/items/contents')
    .type('form')
    .send(itemIds.map(id => `i=${encodeURIComponent(id)}`).join('&'))
    .set('Authorization', greaderAuthHeaderFor(user));

describe('Google Reader API compatibility foundation', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
    app = mod.default;
    await sequelize.authenticate();
  }, 50_000);

  beforeEach(() => {
    mocked.discoverRssLink.mockReset().mockImplementation(async inputUrl => {
      const url = new URL(inputUrl).toString();
      return {
        url,
        parsedFeed: {
          title: `Discovered ${new URL(url).hostname}`,
          description: 'Discovered feed description',
          format: 'rss',
          faviconUrl: `${new URL(url).origin}/favicon.ico`,
          entries: []
        }
      };
    });
  });

  afterEach(async () => {
    if (ownedUserIds.length > 0) {
      await User.destroy({ where: { id: { [Op.in]: ownedUserIds } } });
    }
    ownedUserIds = [];
  });

  describe('accounts/ClientLogin', () => {
    it('[current] returns the exact SID, LSID, and Auth text for correct credentials', async () => {
      const user = await createUser();
      const authValue = `${user.username}/${createGreaderAuthToken(user)}`;

      const response = await request(app)
        .post('/api/greader/accounts/ClientLogin')
        .type('form')
        .send({ Email: user.username, Passwd: TEST_PASSWORD });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/^text\/plain/);
      expect(response.text).toBe(
        `SID=${authValue}\nLSID=null\nAuth=${authValue}\n`
      );
    });

    it('[current] rejects invalid credentials with the exact unauthorized response', async () => {
      const user = await createUser();

      const response = await request(app)
        .post('/api/greader/accounts/ClientLogin')
        .type('form')
        .send({ Email: user.username, Passwd: 'incorrect-password' });

      expect(response.status).toBe(401);
      expect(response.text).toBe('Unauthorized');
    });

    it.each([
      ['Email', { Passwd: TEST_PASSWORD }],
      ['Passwd', { Email: 'missing-password@example.test' }],
      ['both fields', {}]
    ])('[current] rejects a request missing %s', async (_label, fields) => {
      const response = await request(app)
        .post('/api/greader/accounts/ClientLogin')
        .type('form')
        .send(fields);

      expect(response.status).toBe(400);
      expect(response.text).toBe('Email and Passwd required');
    });
  });

  describe('authentication headers', () => {
    it('[current] accepts GoogleLogin auth=username/token', async () => {
      const user = await createUser();

      const response = await request(app)
        .get('/api/greader/reader/api/0/user-info')
        .set('Authorization', greaderAuthHeaderFor(user));

      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(user.username);
    });

    it('[current] accepts the intentional GoogleLogin_auth legacy header form', async () => {
      const user = await createUser();
      const header = `GoogleLogin_auth=${user.username}/${createGreaderAuthToken(user)}`;

      const response = await request(app)
        .get('/api/greader/reader/api/0/user-info')
        .set('Authorization', header);

      expect(response.status).toBe(200);
      expect(response.body.userName).toBe(user.username);
    });

    it.each([
      ['a missing header', null],
      ['an unsupported auth scheme', 'Bearer invalid']
    ])('[current] rejects %s', async (_label, header) => {
      const pendingRequest = request(app)
        .get('/api/greader/reader/api/0/user-info');
      if (header) {
        pendingRequest.set('Authorization', header);
      }

      const response = await pendingRequest;

      expect(response.status).toBe(401);
      expect(response.text).toBe('Unauthorized');
    });

    it('[current] rejects an invalid token for an existing username', async () => {
      const user = await createUser();

      const response = await request(app)
        .get('/api/greader/reader/api/0/user-info')
        .set('Authorization', `GoogleLogin auth=${user.username}/invalid`);

      expect(response.status).toBe(401);
      expect(response.text).toBe('Unauthorized');
    });

    it('[current] safely authenticates a permitted username containing a slash', async () => {
      const user = await createUser(`reader/name-${Date.now()}@example.test`);
      const loginResponse = await request(app)
        .post('/api/greader/accounts/ClientLogin')
        .type('form')
        .send({ Email: user.username, Passwd: TEST_PASSWORD });
      const authLine = loginResponse.text
        .split('\n')
        .find(line => line.startsWith('Auth='));

      const response = await request(app)
        .get('/api/greader/reader/api/0/user-info')
        .set('Authorization', `GoogleLogin auth=${authLine.substring(5)}`);

      expect(loginResponse.status).toBe(200);
      expect(response.status).toBe(200);
      expect(response.body.userId).toBe(user.username);
    });
  });

  describe('reader/api/0/token', () => {
    it('[current] returns a stable 57-character action token plus one newline', async () => {
      const user = await createUser();
      const firstResponse = await request(app)
        .get('/api/greader/reader/api/0/token')
        .set('Authorization', greaderAuthHeaderFor(user));
      const secondResponse = await request(app)
        .get('/api/greader/reader/api/0/token')
        .set('Authorization', greaderAuthHeaderFor(user));

      expect(firstResponse.status).toBe(200);
      expect(firstResponse.text.endsWith('\n')).toBe(true);
      expect(firstResponse.text.slice(0, -1)).toHaveLength(57);
      expect(firstResponse.text.slice(0, -1)).toBe(
        greaderActionTokenFor(user)
      );
      expect(secondResponse.text).toBe(firstResponse.text);
    });

    it('[current] rejects unauthenticated token requests', async () => {
      const response = await request(app)
        .get('/api/greader/reader/api/0/token');

      expect(response.status).toBe(401);
      expect(response.text).toBe('Unauthorized');
    });
  });

  describe('compatibility and HTTP behavior', () => {
    it('[compatible] verifies Authorization header forwarding with PASS or FAIL text', async () => {
      const user = await createUser();
      const missingResponse = await request(app)
        .get('/api/greader/check/compatibility');
      const unsupportedResponse = await request(app)
        .get('/api/greader/check/compatibility')
        .set('Authorization', 'Bearer unsupported');
      const forwardedResponse = await request(app)
        .get('/api/greader/check/compatibility')
        .set('Authorization', greaderAuthHeaderFor(user));

      expect(missingResponse.status).toBe(400);
      expect(missingResponse.text).toBe(
        'FAIL Authorization header was not forwarded'
      );
      expect(unsupportedResponse.status).toBe(400);
      expect(unsupportedResponse.text).toBe(
        'FAIL Unsupported Authorization header'
      );
      expect(forwardedResponse.status).toBe(200);
      expect(forwardedResponse.text).toBe(
        'PASS Authorization header forwarded'
      );
    });

    it('[compatible] disables caching and supports Authorization CORS preflight', async () => {
      const user = await createUser();
      const response = await request(app)
        .get('/api/greader/reader/api/0/token')
        .set('Authorization', greaderAuthHeaderFor(user));
      const optionsResponse = await request(app)
        .options('/api/greader/reader/api/0/edit-tag')
        .set('Access-Control-Request-Headers', 'authorization,content-type')
        .set('Access-Control-Request-Method', 'POST')
        .set('Origin', 'https://reader.example.test');

      expect(response.headers['cache-control']).toBe('no-store, private');
      expect(response.headers.pragma).toBe('no-cache');
      expect(optionsResponse.status).toBe(204);
      expect(optionsResponse.headers['access-control-allow-headers'])
        .toMatch(/Authorization/i);
      expect(optionsResponse.headers['access-control-allow-methods'])
        .toMatch(/POST/);
    });
  });

  describe('repeated form and query parameters', () => {
    it('[current] parses multiple form i parameters as an array and mutates every item', async () => {
      const fixture = await createFixture();

      const response = await request(app)
        .post('/api/greader/reader/api/0/edit-tag')
        .type('form')
        .send(
          `i=${fixture.oldUnread.id}&i=${fixture.newUnread.id}` +
          `&a=${encodeURIComponent(READ_STREAM)}` +
          `&T=${greaderActionTokenFor(fixture.user)}`
        )
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const articles = await Article.findAll({
        where: { id: [fixture.oldUnread.id, fixture.newUnread.id] },
        order: [['id', 'ASC']]
      });

      expect(response.status).toBe(200);
      expect(articles.map(article => article.status)).toEqual(['read', 'read']);
    });

    it('[current] parses multiple form a parameters as an array and applies every tag', async () => {
      const fixture = await createFixture();

      const response = await request(app)
        .post('/api/greader/reader/api/0/edit-tag')
        .type('form')
        .send(
          `i=${fixture.oldUnread.id}` +
          `&a=${encodeURIComponent(READ_STREAM)}` +
          `&a=${encodeURIComponent(STARRED_STREAM)}` +
          `&T=${greaderActionTokenFor(fixture.user)}`
        )
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      await fixture.oldUnread.reload();

      expect(response.status).toBe(200);
      expect(fixture.oldUnread.status).toBe('read');
      expect(fixture.oldUnread.favoriteInd).toBe(1);
    });

    it('[current] parses multiple query r parameters as an array and removes every tag', async () => {
      const fixture = await createFixture();
      await fixture.sameTimestampRead.update({ favoriteInd: 1 });

      const response = await request(app)
        .post('/api/greader/reader/api/0/edit-tag')
        .query({
          i: fixture.sameTimestampRead.id,
          r: [READ_STREAM, STARRED_STREAM]
        })
        .type('form')
        .send({ T: greaderActionTokenFor(fixture.user) })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      await fixture.sameTimestampRead.reload();

      expect(response.status).toBe(200);
      expect(fixture.sameTimestampRead.status).toBe('unread');
      expect(fixture.sameTimestampRead.readAt).toBeNull();
      expect(fixture.sameTimestampRead.favoriteInd).toBe(0);
    });

    it('[current] accepts query-only POST mutations without requiring a parsed body', async () => {
      const fixture = await createFixture();

      const response = await request(app)
        .post('/api/greader/reader/api/0/edit-tag')
        .query({
          i: [fixture.oldUnread.id, fixture.newUnread.id],
          a: READ_STREAM,
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      await fixture.oldUnread.reload();
      await fixture.newUnread.reload();

      expect(response.status).toBe(200);
      expect(fixture.oldUnread.status).toBe('read');
      expect(fixture.newUnread.status).toBe('read');
    });

    it('[compatible] preserves repeated item IDs across body and query parameters', async () => {
      const fixture = await createFixture();

      const response = await request(app)
        .post('/api/greader/reader/api/0/edit-tag')
        .query({ i: [fixture.oldUnread.id, fixture.newUnread.id] })
        .type('form')
        .send({
          i: fixture.sameTimestampStarred.id,
          a: READ_STREAM,
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      await Promise.all(
        fixture.canonicalArticles.map(article => article.reload())
      );

      expect(response.status).toBe(200);
      expect(fixture.sameTimestampStarred.status).toBe('read');
      expect(fixture.oldUnread.status).toBe('read');
      expect(fixture.newUnread.status).toBe('read');
    });
  });

  describe('stream endpoints', () => {
    it('[current] returns only canonical, unfiltered reading-list articles', async () => {
      const fixture = await createFixture();

      const response = await getStream(fixture.user, READING_LIST_STREAM);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(READING_LIST_STREAM);
      expect(responseItemIds(response)).toEqual([
        toGreaderItemId(fixture.newUnread.id),
        toGreaderItemId(fixture.sameTimestampStarred.id),
        toGreaderItemId(fixture.sameTimestampRead.id),
        toGreaderItemId(fixture.oldUnread.id)
      ]);
    });

    it('[current] returns the read stream', async () => {
      const fixture = await createFixture();

      const response = await getStream(fixture.user, READ_STREAM);

      expect(response.status).toBe(200);
      expect(responseItemIds(response)).toEqual([
        toGreaderItemId(fixture.sameTimestampRead.id)
      ]);
    });

    it('[compatible] returns the unread stream', async () => {
      const fixture = await createFixture();

      const response = await getStream(
        fixture.user,
        'user/-/state/com.google/unread'
      );

      expect(response.status).toBe(200);
      expect(responseItemIds(response)).toEqual([
        toGreaderItemId(fixture.newUnread.id),
        toGreaderItemId(fixture.sameTimestampStarred.id),
        toGreaderItemId(fixture.oldUnread.id)
      ]);
    });

    it('[current] returns the starred stream', async () => {
      const fixture = await createFixture();

      const response = await getStream(fixture.user, STARRED_STREAM);

      expect(response.status).toBe(200);
      expect(responseItemIds(response)).toEqual([
        toGreaderItemId(fixture.sameTimestampStarred.id)
      ]);
    });

    it('[current] returns a feed stream addressed by encoded URL', async () => {
      const fixture = await createFixture();
      const streamId = `feed/${encodeURIComponent(fixture.primaryFeed.url)}`;

      const response = await getStream(fixture.user, streamId);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(streamId);
      expect(responseItemIds(response)).toEqual([
        toGreaderItemId(fixture.sameTimestampRead.id),
        toGreaderItemId(fixture.oldUnread.id)
      ]);
    });

    it('[compatible] normalizes a doubled feed prefix in a feed stream', async () => {
      const fixture = await createFixture();
      const response = await getStream(
        fixture.user,
        `feed/feed/${encodeURIComponent(fixture.primaryFeed.url)}`
      );

      expect(response.status).toBe(200);
      expect(responseItemIds(response)).toEqual([
        toGreaderItemId(fixture.sameTimestampRead.id),
        toGreaderItemId(fixture.oldUnread.id)
      ]);
    });

    it('[current] returns a category label stream', async () => {
      const fixture = await createFixture();
      const streamId = `${LABEL_PREFIX}${encodeURIComponent(fixture.primaryCategory.name)}`;

      const response = await getStream(fixture.user, streamId);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(streamId);
      expect(responseItemIds(response)).toEqual([
        toGreaderItemId(fixture.sameTimestampRead.id),
        toGreaderItemId(fixture.oldUnread.id)
      ]);
    });

    it('[current] applies xt read exclusion', async () => {
      const fixture = await createFixture();

      const response = await getStream(fixture.user, READING_LIST_STREAM, {
        xt: READ_STREAM
      });

      expect(response.status).toBe(200);
      expect(responseItemIds(response)).not.toContain(
        toGreaderItemId(fixture.sameTimestampRead.id)
      );
      expect(response.body.items).toHaveLength(3);
    });

    it('[current] applies it starred inclusion', async () => {
      const fixture = await createFixture();

      const response = await getStream(fixture.user, READING_LIST_STREAM, {
        it: STARRED_STREAM
      });

      expect(response.status).toBe(200);
      expect(responseItemIds(response)).toEqual([
        toGreaderItemId(fixture.sameTimestampStarred.id)
      ]);
    });

    it('[current] orders equal publication timestamps by ID in both directions', async () => {
      const fixture = await createFixture();

      const descending = await getStream(
        fixture.user,
        READING_LIST_STREAM,
        { r: 'd' }
      );
      const ascending = await getStream(
        fixture.user,
        READING_LIST_STREAM,
        { r: 'o' }
      );

      expect(responseItemIds(descending)).toEqual([
        toGreaderItemId(fixture.newUnread.id),
        toGreaderItemId(fixture.sameTimestampStarred.id),
        toGreaderItemId(fixture.sameTimestampRead.id),
        toGreaderItemId(fixture.oldUnread.id)
      ]);
      expect(responseItemIds(ascending)).toEqual([
        toGreaderItemId(fixture.oldUnread.id),
        toGreaderItemId(fixture.sameTimestampRead.id),
        toGreaderItemId(fixture.sameTimestampStarred.id),
        toGreaderItemId(fixture.newUnread.id)
      ]);
    });

    it('[compatible] treats r=n as descending ordering', async () => {
      const fixture = await createFixture();
      const descending = await getStream(
        fixture.user,
        READING_LIST_STREAM,
        { r: 'd' }
      );
      const newest = await getStream(
        fixture.user,
        READING_LIST_STREAM,
        { r: 'n' }
      );

      expect(newest.status).toBe(200);
      expect(responseItemIds(newest)).toEqual(responseItemIds(descending));
    });

    it('[current] applies ot and nt to createdAt and accepts microseconds', async () => {
      const fixture = await createFixture();

      const response = await getStream(fixture.user, READING_LIST_STREAM, {
        ot: toUsec('2026-05-01T10:07:00.000Z'),
        nt: toUsec('2026-05-01T10:09:00.000Z')
      });

      expect(response.status).toBe(200);
      expect(responseItemIds(response)).toEqual([
        toGreaderItemId(fixture.sameTimestampStarred.id)
      ]);
    });

    it('[current] paginates n results with a tie-safe continuation', async () => {
      const fixture = await createFixture();

      const firstPage = await getStream(fixture.user, READING_LIST_STREAM, {
        n: 2,
        r: 'd'
      });
      const secondPage = await getStream(fixture.user, READING_LIST_STREAM, {
        n: 2,
        r: 'd',
        c: firstPage.body.continuation
      });

      expect(responseItemIds(firstPage)).toEqual([
        toGreaderItemId(fixture.newUnread.id),
        toGreaderItemId(fixture.sameTimestampStarred.id)
      ]);
      expect(firstPage.body.continuation).toBe(
        `${new Date(fixture.sameTimestampStarred.publishedAt).getTime()}:` +
        fixture.sameTimestampStarred.id
      );
      expect(responseItemIds(secondPage)).toEqual([
        toGreaderItemId(fixture.sameTimestampRead.id),
        toGreaderItemId(fixture.oldUnread.id)
      ]);
      expect(secondPage.body).not.toHaveProperty('continuation');
    });

    it('[compatible] paginates ascending equal timestamps without gaps or duplicates', async () => {
      const fixture = await createFixture();
      const firstPage = await getStream(fixture.user, READING_LIST_STREAM, {
        n: 2,
        r: 'o'
      });
      const secondPage = await getStream(fixture.user, READING_LIST_STREAM, {
        n: 2,
        r: 'o',
        c: firstPage.body.continuation
      });

      expect([
        ...responseItemIds(firstPage),
        ...responseItemIds(secondPage)
      ]).toEqual([
        toGreaderItemId(fixture.oldUnread.id),
        toGreaderItemId(fixture.sameTimestampRead.id),
        toGreaderItemId(fixture.sameTimestampStarred.id),
        toGreaderItemId(fixture.newUnread.id)
      ]);
    });

    it('[compatible] supports s on pathless contents and rejects path conflicts', async () => {
      const fixture = await createFixture();
      const queryResponse = await request(app)
        .get('/api/greader/reader/api/0/stream/contents')
        .query({ s: STARRED_STREAM })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const conflictResponse = await getStream(
        fixture.user,
        READ_STREAM,
        { s: STARRED_STREAM }
      );

      expect(responseItemIds(queryResponse)).toEqual([
        toGreaderItemId(fixture.sameTimestampStarred.id)
      ]);
      expect(conflictResponse.status).toBe(400);
      expect(conflictResponse.text).toBe(
        'Conflicting path and s stream targets'
      );
    });

    it('[compatible] composes repeated inclusion and exclusion targets', async () => {
      const fixture = await createFixture();
      const response = await getStream(fixture.user, READING_LIST_STREAM, {
        it: [STARRED_STREAM, 'user/-/state/com.google/unread'],
        xt: [
          READ_STREAM,
          `${LABEL_PREFIX}${encodeURIComponent(fixture.primaryCategory.name)}`
        ]
      });

      expect(response.status).toBe(200);
      expect(responseItemIds(response)).toEqual([
        toGreaderItemId(fixture.sameTimestampStarred.id)
      ]);
    });

    it('[compatible] rejects unknown targets, malformed continuations, and invalid counts', async () => {
      const fixture = await createFixture();
      const unknown = await getStream(
        fixture.user,
        'user/-/state/com.google/unknown'
      );
      const malformedContinuation = await getStream(
        fixture.user,
        READING_LIST_STREAM,
        { c: 'not-a-keyset' }
      );
      const malformedCount = await getStream(
        fixture.user,
        READING_LIST_STREAM,
        { n: '-1' }
      );

      expect(unknown.status).toBe(400);
      expect(malformedContinuation.status).toBe(400);
      expect(malformedCount.status).toBe(400);
    });
  });

  describe('item IDs', () => {
    it('[Reeder] accepts the 10,000-item state reconciliation request', async () => {
      const fixture = await createFixture();
      const articleFindAll = vi.spyOn(Article, 'findAll');

      try {
        const response = await request(app)
          .get('/api/greader/reader/api/0/stream/items/ids')
          .query({
            n: MAX_STREAM_ITEM_ID_COUNT,
            s: READING_LIST_STREAM,
            xt: READ_STREAM,
            output: 'json'
          })
          .set('Authorization', greaderAuthHeaderFor(fixture.user));

        expect(response.status).toBe(200);
        expect(articleFindAll).toHaveBeenCalledWith(expect.objectContaining({
          limit: MAX_STREAM_ITEM_ID_COUNT + 1
        }));
      } finally {
        articleFindAll.mockRestore();
      }
    });

    it('[current] emits decimal IDs from stream/items/ids', async () => {
      const fixture = await createFixture();

      const response = await request(app)
        .get('/api/greader/reader/api/0/stream/items/ids')
        .query({ s: READING_LIST_STREAM, n: 2 })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));

      expect(response.status).toBe(200);
      expect(response.body.itemRefs).toEqual([
        { id: String(fixture.newUnread.id) },
        { id: String(fixture.sameTimestampStarred.id) }
      ]);
    });

    it('[compatible] unions repeated s targets in deterministic order', async () => {
      const fixture = await createFixture();
      const response = await request(app)
        .get('/api/greader/reader/api/0/stream/items/ids')
        .query({ s: [READ_STREAM, STARRED_STREAM] })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));

      expect(response.status).toBe(200);
      expect(response.body.itemRefs).toEqual([
        { id: String(fixture.sameTimestampStarred.id) },
        { id: String(fixture.sameTimestampRead.id) }
      ]);
    });

    it('[compatible] matches stream contents population, order, and continuation', async () => {
      const fixture = await createFixture();
      const query = {
        s: READING_LIST_STREAM,
        xt: [READ_STREAM],
        n: 2,
        r: 'd'
      };
      const contents = await request(app)
        .get('/api/greader/reader/api/0/stream/contents')
        .query(query)
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const ids = await request(app)
        .get('/api/greader/reader/api/0/stream/items/ids')
        .query(query)
        .set('Authorization', greaderAuthHeaderFor(fixture.user));

      expect(contents.status).toBe(200);
      expect(ids.status).toBe(200);
      expect(ids.body.itemRefs.map(item => item.id)).toEqual(
        contents.body.items.map(item =>
          String(parseInt(item.id.split('/').at(-1), 16))
        )
      );
      expect(ids.body.continuation).toBe(contents.body.continuation);
    });

    it('[compatible] accepts decimal, bare hexadecimal, and full item IDs', async () => {
      const fixture = await createFixture();

      const response = await getItemContents(fixture.user, [
        String(fixture.oldUnread.id),
        Number(fixture.newUnread.id).toString(16).padStart(16, '0'),
        toGreaderItemId(fixture.sameTimestampStarred.id)
      ]);

      expect(response.status).toBe(200);
      expect(responseItemIds(response)).toEqual([
        toGreaderItemId(fixture.oldUnread.id),
        toGreaderItemId(fixture.newUnread.id),
        toGreaderItemId(fixture.sameTimestampStarred.id)
      ]);
    });

    it('[compatible] rejects malformed item IDs without exposing ownership', async () => {
      const fixture = await createFixture();
      const otherFixture = await createFixture();

      const malformedResponse = await getItemContents(fixture.user, [
        'not-an-item-id',
        'tag:google.com,2005:reader/item/not-hex'
      ]);
      const unownedResponse = await getItemContents(fixture.user, [
        String(otherFixture.oldUnread.id)
      ]);

      expect(malformedResponse.status).toBe(400);
      expect(unownedResponse.status).toBe(200);
      expect(unownedResponse.body.items).toEqual([]);
    });

    it('[current] preserves the requested order for distinct item IDs', async () => {
      const fixture = await createFixture();

      const response = await getItemContents(fixture.user, [
        toGreaderItemId(fixture.newUnread.id),
        String(fixture.oldUnread.id),
        toGreaderItemId(fixture.sameTimestampStarred.id)
      ]);

      expect(responseItemIds(response)).toEqual([
        toGreaderItemId(fixture.newUnread.id),
        toGreaderItemId(fixture.oldUnread.id),
        toGreaderItemId(fixture.sameTimestampStarred.id)
      ]);
    });

    it('[compatible] deduplicates requested IDs at their first occurrence', async () => {
      const fixture = await createFixture();
      const response = await getItemContents(fixture.user, [
        String(fixture.oldUnread.id),
        toGreaderItemId(fixture.sameTimestampStarred.id),
        toGreaderItemId(fixture.oldUnread.id),
        String(fixture.sameTimestampStarred.id)
      ]);

      expect(responseItemIds(response)).toEqual([
        toGreaderItemId(fixture.oldUnread.id),
        toGreaderItemId(fixture.sameTimestampStarred.id)
      ]);
    });
  });

  describe('mutations', () => {
    it('[current] marks an item read and records readAt', async () => {
      const fixture = await createFixture();

      const response = await request(app)
        .post('/api/greader/reader/api/0/edit-tag')
        .type('form')
        .send({
          i: fixture.oldUnread.id,
          a: READ_STREAM,
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      await fixture.oldUnread.reload();

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
      expect(fixture.oldUnread.status).toBe('read');
      expect(fixture.oldUnread.readAt).toBeInstanceOf(Date);
    });

    it('[current] marks an item unread and clears readAt', async () => {
      const fixture = await createFixture();

      const response = await request(app)
        .post('/api/greader/reader/api/0/edit-tag')
        .type('form')
        .send({
          i: fixture.sameTimestampRead.id,
          r: READ_STREAM,
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      await fixture.sameTimestampRead.reload();

      expect(response.status).toBe(200);
      expect(fixture.sameTimestampRead.status).toBe('unread');
      expect(fixture.sameTimestampRead.readAt).toBeNull();
    });

    it('[current] stars and unstars an item', async () => {
      const fixture = await createFixture();

      const starResponse = await request(app)
        .post('/api/greader/reader/api/0/edit-tag')
        .type('form')
        .send({
          i: fixture.oldUnread.id,
          a: STARRED_STREAM,
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      await fixture.oldUnread.reload();
      expect(starResponse.status).toBe(200);
      expect(fixture.oldUnread.favoriteInd).toBe(1);

      const unstarResponse = await request(app)
        .post('/api/greader/reader/api/0/edit-tag')
        .type('form')
        .send({
          i: fixture.oldUnread.id,
          r: STARRED_STREAM,
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      await fixture.oldUnread.reload();

      expect(unstarResponse.status).toBe(200);
      expect(fixture.oldUnread.favoriteInd).toBe(0);
    });

    it('[compatible] applies repeated conflicting tags once with remove precedence', async () => {
      const fixture = await createFixture();
      await fixture.oldUnread.update({ favoriteInd: 1 });
      const updateSpy = vi.spyOn(Article, 'update');

      try {
        const response = await request(app)
          .post('/api/greader/reader/api/0/edit-tag')
          .type('form')
          .send(
            `i=${fixture.oldUnread.id}` +
            `&a=${encodeURIComponent(READ_STREAM)}` +
            `&a=${encodeURIComponent(STARRED_STREAM)}` +
            `&r=${encodeURIComponent(READ_STREAM)}` +
            `&r=${encodeURIComponent(STARRED_STREAM)}` +
            `&T=${greaderActionTokenFor(fixture.user)}`
          )
          .set('Authorization', greaderAuthHeaderFor(fixture.user));
        await fixture.oldUnread.reload();

        expect(response.status).toBe(200);
        expect(updateSpy).toHaveBeenCalledTimes(1);
        expect(fixture.oldUnread.status).toBe('unread');
        expect(fixture.oldUnread.readAt).toBeNull();
        expect(fixture.oldUnread.favoriteInd).toBe(0);
      } finally {
        updateSpy.mockRestore();
      }
    });

    it('[compatible] ignores unknown tags and deliberately handles empty or invalid IDs', async () => {
      const fixture = await createFixture();

      const unknownResponse = await request(app)
        .post('/api/greader/reader/api/0/edit-tag')
        .type('form')
        .send({
          i: fixture.oldUnread.id,
          a: 'user/-/state/com.google/unknown',
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const emptyResponse = await request(app)
        .post('/api/greader/reader/api/0/edit-tag')
        .type('form')
        .send({
          a: READ_STREAM,
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const invalidResponse = await request(app)
        .post('/api/greader/reader/api/0/edit-tag')
        .type('form')
        .send({
          i: 'not-an-item-id',
          a: READ_STREAM,
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      await fixture.oldUnread.reload();

      expect(unknownResponse.status).toBe(200);
      expect(emptyResponse.status).toBe(200);
      expect(invalidResponse.status).toBe(400);
      expect(fixture.oldUnread.status).toBe('unread');
    });

    it('[compatible] rolls back every edit-tag state when its bulk update fails', async () => {
      const fixture = await createFixture();
      const hookName = `greader-edit-tag-rollback-${fixture.user.id}`;
      Article.addHook('afterBulkUpdate', hookName, () => {
        throw new Error('Forced mutation failure');
      });

      try {
        const response = await request(app)
          .post('/api/greader/reader/api/0/edit-tag')
          .type('form')
          .send({
            i: fixture.oldUnread.id,
            a: [READ_STREAM, STARRED_STREAM],
            T: greaderActionTokenFor(fixture.user)
          })
          .set('Authorization', greaderAuthHeaderFor(fixture.user));
        await fixture.oldUnread.reload();

        expect(response.status).toBe(500);
        expect(response.headers['content-type']).toMatch(/^text\/plain/);
        expect(response.text).toBe('Internal Server Error');
        expect(response.text).not.toContain('Forced mutation failure');
        expect(fixture.oldUnread.status).toBe('unread');
        expect(fixture.oldUnread.readAt).toBeNull();
        expect(fixture.oldUnread.favoriteInd).toBe(0);
      } finally {
        Article.removeHook('afterBulkUpdate', hookName);
      }
    });

    it('[compatible] scopes edit-tag IDs to canonical articles owned by the user', async () => {
      const fixture = await createFixture();
      const otherFixture = await createFixture();

      const response = await request(app)
        .post('/api/greader/reader/api/0/edit-tag')
        .type('form')
        .send({
          i: [
            fixture.duplicate.id,
            fixture.filtered.id,
            otherFixture.oldUnread.id
          ],
          a: READ_STREAM,
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      await Promise.all([
        fixture.duplicate.reload(),
        fixture.filtered.reload(),
        otherFixture.oldUnread.reload()
      ]);

      expect(response.status).toBe(200);
      expect(fixture.duplicate.status).toBe('duplicate');
      expect(fixture.filtered.status).toBe('unread');
      expect(otherFixture.oldUnread.status).toBe('unread');
    });

    it.each([
      ['reading list', _fixture => READING_LIST_STREAM, 4],
      [
        'feed',
        fixture => `feed/${encodeURIComponent(fixture.primaryFeed.url)}`,
        2
      ],
      [
        'category',
        fixture => `${LABEL_PREFIX}${encodeURIComponent(fixture.primaryCategory.name)}`,
        2
      ]
    ])('[current] marks all canonical items read for a %s stream', async (
      _label,
      streamFor,
      expectedReadCount
    ) => {
      const fixture = await createFixture();

      const response = await request(app)
        .post('/api/greader/reader/api/0/mark-all-as-read')
        .type('form')
        .send({
          s: streamFor(fixture),
          ts: toUsec('2026-05-02T00:00:00.000Z'),
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const readCount = await Article.count({
        where: {
          id: fixture.canonicalArticles.map(article => article.id),
          status: 'read'
        }
      });
      await fixture.duplicate.reload();
      await fixture.filtered.reload();

      expect(response.status).toBe(200);
      expect(readCount).toBe(expectedReadCount);
      expect(fixture.duplicate.status).toBe('duplicate');
      expect(fixture.filtered.status).toBe('unread');
    });

    it('[compatible] uses crawl time and leaves already-read rows untouched', async () => {
      const fixture = await createFixture();
      const originalReadAt = fixture.sameTimestampRead.readAt.getTime();

      const response = await request(app)
        .post('/api/greader/reader/api/0/mark-all-as-read')
        .type('form')
        .send({
          s: READING_LIST_STREAM,
          ts: toUsec('2026-05-01T10:07:00.000Z'),
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      await Promise.all(fixture.canonicalArticles.map(article => article.reload()));

      expect(response.status).toBe(200);
      expect(fixture.oldUnread.status).toBe('read');
      expect(fixture.sameTimestampRead.readAt.getTime()).toBe(originalReadAt);
      expect(fixture.sameTimestampStarred.status).toBe('unread');
      expect(fixture.newUnread.status).toBe('unread');
    });

    it('[compatible] rejects malformed mark-all timestamps without changing state', async () => {
      const fixture = await createFixture();

      const response = await request(app)
        .post('/api/greader/reader/api/0/mark-all-as-read')
        .type('form')
        .send({
          s: READING_LIST_STREAM,
          ts: 'not-a-timestamp',
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      await fixture.oldUnread.reload();

      expect(response.status).toBe(400);
      expect(fixture.oldUnread.status).toBe('unread');
    });

    it('[compatible] rejects malformed and missing category mutation labels', async () => {
      const fixture = await createFixture();
      const token = greaderActionTokenFor(fixture.user);
      const invalidPrefix = await request(app)
        .post('/api/greader/reader/api/0/rename-tag')
        .type('form')
        .send({ s: 'plain-tag', dest: `${LABEL_PREFIX}Renamed`, T: token })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const emptyLabel = await request(app)
        .post('/api/greader/reader/api/0/rename-tag')
        .type('form')
        .send({ s: LABEL_PREFIX, dest: `${LABEL_PREFIX}Renamed`, T: token })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const missingCategory = await request(app)
        .post('/api/greader/reader/api/0/rename-tag')
        .type('form')
        .send({
          s: `${LABEL_PREFIX}Missing`,
          dest: `${LABEL_PREFIX}Renamed`,
          T: token
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const conflictingSources = await request(app)
        .post('/api/greader/reader/api/0/rename-tag')
        .type('form')
        .send(
          `s=${encodeURIComponent(`${LABEL_PREFIX}First`)}` +
          `&s=${encodeURIComponent(`${LABEL_PREFIX}Second`)}` +
          `&dest=${encodeURIComponent(`${LABEL_PREFIX}Renamed`)}` +
          `&T=${token}`
        )
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const missingDisableLabel = await request(app)
        .post('/api/greader/reader/api/0/disable-tag')
        .type('form')
        .send({ T: token })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const emptyDisableLabel = await request(app)
        .post('/api/greader/reader/api/0/disable-tag')
        .type('form')
        .send({ s: LABEL_PREFIX, T: token })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));

      expect(invalidPrefix.status).toBe(400);
      expect(emptyLabel.status).toBe(400);
      expect(missingCategory.status).toBe(400);
      expect(missingCategory.text).toBe('Category not found');
      expect(conflictingSources.status).toBe(400);
      expect(conflictingSources.text).toBe('Conflicting s parameters');
      expect(missingDisableLabel.status).toBe(400);
      expect(emptyDisableLabel.status).toBe(400);
    });

    it('[compatible] merges a category rename collision atomically', async () => {
      const fixture = await createFixture();

      const response = await request(app)
        .post('/api/greader/reader/api/0/rename-tag')
        .type('form')
        .send({
          s: `${LABEL_PREFIX}${encodeURIComponent(fixture.primaryCategory.name)}`,
          dest: `${LABEL_PREFIX}${encodeURIComponent(fixture.secondaryCategory.name)}`,
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const source = await Category.findByPk(fixture.primaryCategory.id);
      await fixture.primaryFeed.reload();

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
      expect(source).toBeNull();
      expect(fixture.primaryFeed.categoryId).toBe(
        fixture.secondaryCategory.id
      );
    });

    it('[compatible] disables repeated categories into one established default', async () => {
      const fixture = await createFixture();

      const response = await request(app)
        .post('/api/greader/reader/api/0/disable-tag')
        .type('form')
        .send(
          `s=${encodeURIComponent(
            `${LABEL_PREFIX}${encodeURIComponent(fixture.primaryCategory.name)}`
          )}` +
          `&s=${encodeURIComponent(
            `${LABEL_PREFIX}${encodeURIComponent(fixture.secondaryCategory.name)}`
          )}` +
          `&T=${greaderActionTokenFor(fixture.user)}`
        )
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const defaultCategories = await Category.findAll({
        where: { userId: fixture.user.id, name: 'Uncategorized' }
      });
      await Promise.all([
        fixture.primaryFeed.reload(),
        fixture.secondaryFeed.reload()
      ]);

      expect(response.status).toBe(200);
      expect(defaultCategories).toHaveLength(1);
      expect(fixture.primaryFeed.categoryId).toBe(defaultCategories[0].id);
      expect(fixture.secondaryFeed.categoryId).toBe(defaultCategories[0].id);
      expect(await Category.findByPk(fixture.primaryCategory.id)).toBeNull();
      expect(await Category.findByPk(fixture.secondaryCategory.id)).toBeNull();
    });

    it('[compatible] rolls back category reassignment when disable fails', async () => {
      const fixture = await createFixture();
      const originalCategoryId = fixture.primaryFeed.categoryId;
      const hookName = `greader-disable-rollback-${fixture.user.id}`;
      Feed.addHook('afterBulkUpdate', hookName, () => {
        throw new Error('Forced category failure');
      });

      try {
        const response = await request(app)
          .post('/api/greader/reader/api/0/disable-tag')
          .type('form')
          .send({
            s: `${LABEL_PREFIX}${encodeURIComponent(fixture.primaryCategory.name)}`,
            T: greaderActionTokenFor(fixture.user)
          })
          .set('Authorization', greaderAuthHeaderFor(fixture.user));
        await fixture.primaryFeed.reload();

        expect(response.status).toBe(500);
        expect(response.text).toBe('Internal Server Error');
        expect(fixture.primaryFeed.categoryId).toBe(originalCategoryId);
        expect(await Category.findByPk(fixture.primaryCategory.id)).not.toBeNull();
      } finally {
        Feed.removeHook('afterBulkUpdate', hookName);
      }
    });
  });

  describe('subscription operations', () => {
    it('[compatible] rejects imports without OPML content and exports subscriptions', async () => {
      const fixture = await createFixture();
      const missingImport = await request(app)
        .post('/api/greader/reader/api/0/subscription/import')
        .type('form')
        .send({ T: greaderActionTokenFor(fixture.user) })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const exported = await request(app)
        .get('/api/greader/reader/api/0/subscription/export')
        .set('Authorization', greaderAuthHeaderFor(fixture.user));

      expect(missingImport.status).toBe(400);
      expect(missingImport.text).toBe('No OPML file provided');
      expect(exported.status).toBe(200);
      expect(exported.headers['content-type']).toMatch(/^application\/xml/);
      expect(exported.headers['content-disposition']).toBe(
        'attachment; filename="subscriptions.opml"'
      );
      expect(exported.text).toContain('<opml');
      expect(exported.text).toContain(fixture.primaryFeed.url);
    });

    it('[compatible] leaves subscription htmlUrl empty without publisher metadata', async () => {
      const fixture = await createFixture();
      const response = await request(app)
        .get('/api/greader/reader/api/0/subscription/list')
        .query({ output: 'json' })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));

      expect(response.status).toBe(200);
      expect(response.body.subscriptions).not.toHaveLength(0);
      expect(response.body.subscriptions.every(
        subscription => subscription.htmlUrl === ''
      )).toBe(true);
    });

    it('[compatible] imports bounded OPML through guarded feed discovery', async () => {
      const fixture = await createFixture();
      const canonicalUrl = 'https://canonical-opml.example.test/feed.xml';
      mocked.discoverRssLink.mockResolvedValue({
        url: canonicalUrl,
        parsedFeed: {
          title: 'Discovered OPML Feed',
          description: 'Discovered through the shared flow',
          format: 'rss',
          faviconUrl: 'https://canonical-opml.example.test/favicon.ico',
          entries: []
        }
      });
      const opml = `<?xml version="1.0"?>
        <opml version="2.0"><body>
          <outline text="Imported">
            <outline type="rss" text="Requested title"
              xmlUrl="https://opml.example.test/discover" />
            <outline type="rss" text="Duplicate"
              xmlUrl="https://opml.example.test/discover" />
          </outline>
        </body></opml>`;

      const response = await request(app)
        .post('/api/greader/reader/api/0/subscription/import')
        .field('T', greaderActionTokenFor(fixture.user))
        .attach('subscriptions_file', Buffer.from(opml), 'subscriptions.opml')
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const feeds = await Feed.findAll({
        where: { userId: fixture.user.id, url: canonicalUrl }
      });
      const category = await Category.findOne({
        where: { userId: fixture.user.id, name: 'Imported' }
      });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toMatch(/^text\/plain/);
      expect(response.text).toBe('OK');
      expect(feeds).toHaveLength(1);
      expect(feeds[0].categoryId).toBe(category.id);
      expect(feeds[0].feedName).toBe('Requested title');
      expect(feeds[0].favicon).toBe(
        'https://canonical-opml.example.test/favicon.ico'
      );
    });

    it('[compatible] rejects oversized OPML before parsing or discovery', async () => {
      const fixture = await createFixture();

      const response = await request(app)
        .post('/api/greader/reader/api/0/subscription/import')
        .field('T', greaderActionTokenFor(fixture.user))
        .attach(
          'subscriptions_file',
          Buffer.alloc(1024 * 1024 + 1, 65),
          'oversized.opml'
        )
        .set('Authorization', greaderAuthHeaderFor(fixture.user));

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid OPML upload');
      expect(mocked.discoverRssLink).not.toHaveBeenCalled();
    });

    it('[compatible] accepts a bounded raw application/xml OPML body', async () => {
      const fixture = await createFixture();
      const feedUrl = 'https://raw-opml.example.test/feed.xml';
      const opml = `<?xml version="1.0"?>
        <opml version="2.0"><body>
          <outline type="rss" text="Raw XML" xmlUrl="${feedUrl}" />
        </body></opml>`;

      const response = await request(app)
        .post('/api/greader/reader/api/0/subscription/import')
        .query({ T: greaderActionTokenFor(fixture.user) })
        .set('Content-Type', 'application/xml')
        .set('Authorization', greaderAuthHeaderFor(fixture.user))
        .send(opml);

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
      expect(await Feed.findOne({
        where: { userId: fixture.user.id, url: feedUrl }
      })).not.toBeNull();
    });

    it('[compatible] rejects an oversized raw XML body before discovery', async () => {
      const fixture = await createFixture();
      const response = await request(app)
        .post('/api/greader/reader/api/0/subscription/import')
        .query({ T: greaderActionTokenFor(fixture.user) })
        .set('Content-Type', 'text/xml')
        .set('Authorization', greaderAuthHeaderFor(fixture.user))
        .send(Buffer.alloc(1024 * 1024 + 1, 65));

      expect(response.status).toBe(400);
      expect(response.text).toBe('Invalid OPML upload');
      expect(mocked.discoverRssLink).not.toHaveBeenCalled();
    });

    it('[current] subscribes a new feed in the requested category', async () => {
      const fixture = await createFixture();
      const feedUrl = 'https://new.example.test/rss';

      const response = await request(app)
        .post('/api/greader/reader/api/0/subscription/edit')
        .type('form')
        .send({
          s: `feed/${encodeURIComponent(feedUrl)}`,
          ac: 'subscribe',
          t: 'New Feed',
          a: `${LABEL_PREFIX}${encodeURIComponent(fixture.secondaryCategory.name)}`,
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const feed = await Feed.findOne({
        where: { userId: fixture.user.id, url: feedUrl }
      });

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
      expect(feed.feedName).toBe('New Feed');
      expect(feed.categoryId).toBe(fixture.secondaryCategory.id);
    });

    it('[compatible] updates supplied metadata when subscribing an existing feed', async () => {
      const fixture = await createFixture();

      const response = await request(app)
        .post('/api/greader/reader/api/0/subscription/edit')
        .type('form')
        .send({
          s: `feed/${encodeURIComponent(fixture.primaryFeed.url)}`,
          ac: 'subscribe',
          t: 'Reader Rename',
          a: `${LABEL_PREFIX}${encodeURIComponent(fixture.secondaryCategory.name)}`,
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      await fixture.primaryFeed.reload();

      expect(response.status).toBe(200);
      expect(response.text).toBe('OK');
      expect(fixture.primaryFeed.feedName).toBe('Reader Rename');
      expect(fixture.primaryFeed.categoryId).toBe(fixture.secondaryCategory.id);
    });

    it('[current] unsubscribes an existing feed', async () => {
      const fixture = await createFixture();

      const response = await request(app)
        .post('/api/greader/reader/api/0/subscription/edit')
        .type('form')
        .send({
          s: `feed/${encodeURIComponent(fixture.primaryFeed.url)}`,
          ac: 'unsubscribe',
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));

      expect(response.status).toBe(200);
      expect(await Feed.findByPk(fixture.primaryFeed.id)).toBeNull();
      expect(await Article.findByPk(fixture.oldUnread.id)).toBeNull();
    });

    it('[current] renames and moves a subscription', async () => {
      const fixture = await createFixture();

      const response = await request(app)
        .post('/api/greader/reader/api/0/subscription/edit')
        .type('form')
        .send({
          s: `feed/${encodeURIComponent(fixture.primaryFeed.url)}`,
          ac: 'edit',
          t: 'Renamed Feed',
          a: `${LABEL_PREFIX}${encodeURIComponent(fixture.secondaryCategory.name)}`,
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      await fixture.primaryFeed.reload();

      expect(response.status).toBe(200);
      expect(fixture.primaryFeed.feedName).toBe('Renamed Feed');
      expect(fixture.primaryFeed.categoryId).toBe(fixture.secondaryCategory.id);
    });

    it('[compatible] subscribes repeated streams and aligns titles by position', async () => {
      const fixture = await createFixture();
      const urls = [
        'https://repeat-one.example.test/feed.xml',
        'https://repeat-two.example.test/feed.xml'
      ];
      const response = await request(app)
        .post('/api/greader/reader/api/0/subscription/edit')
        .type('form')
        .send(
          urls.map(url => `s=${encodeURIComponent(`feed/${url}`)}`).join('&') +
          '&ac=subscribe&t=Repeated+One&t=Repeated+Two' +
          `&T=${greaderActionTokenFor(fixture.user)}`
        )
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const feeds = await Feed.findAll({
        where: { userId: fixture.user.id, url: { [Op.in]: urls } },
        order: [['url', 'ASC']]
      });

      expect(response.status).toBe(200);
      expect(feeds.map(feed => feed.feedName)).toEqual([
        'Repeated One',
        'Repeated Two'
      ]);
    });

    it('[compatible] edits repeated streams and normalizes doubled feed prefixes', async () => {
      const fixture = await createFixture();
      const response = await request(app)
        .post('/api/greader/reader/api/0/subscription/edit')
        .type('form')
        .send(
          `s=${encodeURIComponent(`feed/feed/${fixture.primaryFeed.url}`)}` +
          `&s=${encodeURIComponent(`feed/${fixture.secondaryFeed.url}`)}` +
          '&ac=edit&t=Primary+Renamed&t=Secondary+Renamed' +
          `&a=${encodeURIComponent(
            `${LABEL_PREFIX}${fixture.secondaryCategory.name}`
          )}` +
          `&T=${greaderActionTokenFor(fixture.user)}`
        )
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      await Promise.all([
        fixture.primaryFeed.reload(),
        fixture.secondaryFeed.reload()
      ]);

      expect(response.status).toBe(200);
      expect(fixture.primaryFeed.feedName).toBe('Primary Renamed');
      expect(fixture.secondaryFeed.feedName).toBe('Secondary Renamed');
      expect(fixture.primaryFeed.categoryId).toBe(fixture.secondaryCategory.id);
      expect(fixture.secondaryFeed.categoryId).toBe(fixture.secondaryCategory.id);
    });

    it('[compatible] unsubscribes every repeated stream', async () => {
      const fixture = await createFixture();
      const response = await request(app)
        .post('/api/greader/reader/api/0/subscription/edit')
        .type('form')
        .send(
          `s=${encodeURIComponent(`feed/${fixture.primaryFeed.url}`)}` +
          `&s=${encodeURIComponent(`feed/${fixture.secondaryFeed.url}`)}` +
          `&ac=unsubscribe&T=${greaderActionTokenFor(fixture.user)}`
        )
        .set('Authorization', greaderAuthHeaderFor(fixture.user));

      expect(response.status).toBe(200);
      expect(await Feed.count({
        where: {
          id: { [Op.in]: [fixture.primaryFeed.id, fixture.secondaryFeed.id] }
        }
      })).toBe(0);
    });

    it('[current] moves a subscription to Uncategorized when removing its category', async () => {
      const fixture = await createFixture();

      const response = await request(app)
        .post('/api/greader/reader/api/0/subscription/edit')
        .type('form')
        .send({
          s: `feed/${encodeURIComponent(fixture.primaryFeed.url)}`,
          ac: 'edit',
          r: `${LABEL_PREFIX}${encodeURIComponent(fixture.primaryCategory.name)}`,
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      await fixture.primaryFeed.reload();
      const category = await fixture.primaryFeed.getCategory();

      expect(response.status).toBe(200);
      expect(category.name).toBe('Uncategorized');
    });

    it('[current] quick-adds a new feed and reports an existing feed', async () => {
      const fixture = await createFixture();
      const newUrl = 'https://quick.example.test/feed.xml';

      const newResponse = await request(app)
        .post('/api/greader/reader/api/0/subscription/quickadd')
        .type('form')
        .send({
          quickadd: newUrl,
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const existingResponse = await request(app)
        .post('/api/greader/reader/api/0/subscription/quickadd')
        .type('form')
        .send({
          quickadd: fixture.primaryFeed.url,
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));

      expect(newResponse.status).toBe(200);
      expect(newResponse.body).toMatchObject({
        query: newUrl,
        numResults: 1,
        streamId: `feed/${encodeURIComponent(newUrl)}`
      });
      expect(existingResponse.status).toBe(200);
      expect(existingResponse.body).toMatchObject({
        query: fixture.primaryFeed.url,
        numResults: 1,
        streamId: `feed/${encodeURIComponent(fixture.primaryFeed.url)}`
      });
    });

    it('[current] uses the first repeated add category and gives add precedence over remove', async () => {
      const fixture = await createFixture();

      const response = await request(app)
        .post('/api/greader/reader/api/0/subscription/edit')
        .type('form')
        .send(
          `s=${encodeURIComponent(`feed/${fixture.primaryFeed.url}`)}` +
          '&ac=edit' +
          `&a=${encodeURIComponent(`${LABEL_PREFIX}${fixture.secondaryCategory.name}`)}` +
          `&a=${encodeURIComponent(`${LABEL_PREFIX}Ignored`)}` +
          `&r=${encodeURIComponent(`${LABEL_PREFIX}${fixture.primaryCategory.name}`)}` +
          `&T=${greaderActionTokenFor(fixture.user)}`
        )
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      await fixture.primaryFeed.reload();

      expect(response.status).toBe(200);
      expect(fixture.primaryFeed.categoryId).toBe(
        fixture.secondaryCategory.id
      );
    });
  });

  describe('real-client setup and synchronization smoke fixtures', () => {
    it('[NetNewsWire fixture] logs in, lists subscriptions, and fetches a bare item ID', async () => {
      const fixture = await createFixture();
      const login = await request(app)
        .post('/api/greader/accounts/ClientLogin')
        .type('form')
        .send({ Email: fixture.user.username, Passwd: TEST_PASSWORD });
      const subscriptions = await request(app)
        .get('/api/greader/reader/api/0/subscription/list')
        .query({ output: 'json' })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const contents = await getItemContents(fixture.user, [
        Number(fixture.oldUnread.id).toString(16).padStart(16, '0')
      ]);

      expect(login.status).toBe(200);
      expect(subscriptions.status).toBe(200);
      expect(contents.status).toBe(200);
      expect(responseItemIds(contents)).toEqual([
        toGreaderItemId(fixture.oldUnread.id)
      ]);
    });

    it('[Reeder fixture] obtains a token, reads state, and marks an item read', async () => {
      const fixture = await createFixture();
      const token = await request(app)
        .get('/api/greader/reader/api/0/token')
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const unread = await request(app)
        .get('/api/greader/reader/api/0/unread-count')
        .query({ output: 'json' })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const mutation = await request(app)
        .post('/api/greader/reader/api/0/edit-tag')
        .type('form')
        .send({
          i: fixture.oldUnread.id,
          a: READ_STREAM,
          T: token.text.trim()
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));

      expect(token.status).toBe(200);
      expect(unread.status).toBe(200);
      expect(mutation.status).toBe(200);
    });

    it('[FeedMe fixture] keeps action-token enforcement during quick add', async () => {
      const fixture = await createFixture();
      const withoutToken = await request(app)
        .post('/api/greader/reader/api/0/subscription/quickadd')
        .type('form')
        .send({ quickadd: 'https://feedme.example.test/feed.xml' })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const withToken = await request(app)
        .post('/api/greader/reader/api/0/subscription/quickadd')
        .type('form')
        .send({
          quickadd: 'https://feedme.example.test/feed.xml',
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));

      expect(withoutToken.status).toBe(401);
      expect(withoutToken.headers['google-bad-token']).toBe('true');
      expect(withToken.status).toBe(200);
      expect(withToken.body.numResults).toBe(1);
    });

    it('[Fluent Reader fixture] synchronizes a doubled feed stream with r=n', async () => {
      const fixture = await createFixture();
      const response = await getStream(
        fixture.user,
        `feed/feed/${encodeURIComponent(fixture.primaryFeed.url)}`,
        { r: 'n', n: 20 }
      );

      expect(response.status).toBe(200);
      expect(responseItemIds(response)).toEqual([
        toGreaderItemId(fixture.sameTimestampRead.id),
        toGreaderItemId(fixture.oldUnread.id)
      ]);
    });

    it('[NewsFlash fixture] lists IDs, fetches contents, and marks the stream read', async () => {
      const fixture = await createFixture();
      const ids = await request(app)
        .get('/api/greader/reader/api/0/stream/items/ids')
        .query({ s: READING_LIST_STREAM, xt: READ_STREAM, n: 2 })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));
      const contents = await getItemContents(
        fixture.user,
        ids.body.itemRefs.map(item => item.id)
      );
      const mutation = await request(app)
        .post('/api/greader/reader/api/0/mark-all-as-read')
        .type('form')
        .send({
          s: READING_LIST_STREAM,
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));

      expect(ids.status).toBe(200);
      expect(contents.status).toBe(200);
      expect(contents.body.items).toHaveLength(2);
      expect(mutation.status).toBe(200);
    });
  });

  describe('serialization contract', () => {
    it('[current] serializes milliseconds, microseconds, categories, origin, alternate URL, and sanitized HTML', async () => {
      const fixture = await createFixture();

      const response = await getItemContents(fixture.user, [
        fixture.sameTimestampStarred.id,
        fixture.oldUnread.id
      ]);
      const starredItem = response.body.items[0];
      const oldItem = response.body.items[1];

      expect(starredItem).toMatchObject({
        id: toGreaderItemId(fixture.sameTimestampStarred.id),
        crawlTimeMsec: String(
          new Date(fixture.sameTimestampStarred.createdAt).getTime()
        ),
        timestampUsec: toUsec(fixture.sameTimestampStarred.publishedAt),
        published: Math.floor(
          new Date(fixture.sameTimestampStarred.publishedAt).getTime() / 1000
        ),
        title: 'Starred article',
        categories: [
          READING_LIST_STREAM,
          STARRED_STREAM,
          `${LABEL_PREFIX}${encodeURIComponent(fixture.secondaryCategory.name)}`
        ],
        origin: {
          streamId: `feed/${encodeURIComponent(fixture.secondaryFeed.url)}`,
          title: fixture.secondaryFeed.feedName,
          htmlUrl: ''
        },
        canonical: [{
          href: fixture.sameTimestampStarred.url
        }],
        alternate: [{
          href: fixture.sameTimestampStarred.url,
          type: 'text/html'
        }]
      });
      expect(oldItem.summary.content).toBe('<p>Sanitized old body</p>');
      expect(JSON.stringify(response.body)).not.toContain('publisherPayload');
    });

    it('[compatible] uses crawl time independently and never emits raw description HTML', async () => {
      const fixture = await createFixture();

      const response = await getItemContents(fixture.user, [
        fixture.newUnread.id
      ]);
      const item = response.body.items[0];

      expect(item.crawlTimeMsec).toBe(
        String(new Date(fixture.newUnread.createdAt).getTime())
      );
      expect(item.summary.content).toBe('');
      expect(item.author).toBe('');
    });

    it.todo(
      '[product decision] define serialization behavior for a null publishedAt, which the model currently forbids'
    );
    it.todo(
      '[product decision] decide whether the API must re-sanitize persisted contentHtml at serialization time'
    );
    it('[compatible] leaves origin.htmlUrl empty without persisted publisher-site metadata', async () => {
      const fixture = await createFixture();
      const response = await getItemContents(fixture.user, [
        fixture.oldUnread.id
      ]);

      expect(response.body.items[0].origin.htmlUrl).toBe('');
    });
  });
});
