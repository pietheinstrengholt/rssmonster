import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { Op } from 'sequelize';
import db from '../../models/index.js';
import {
  createGreaderAuthToken
} from '../../utils/apiCredentials.js';
import {
  LABEL_PREFIX,
  READ_STREAM,
  READING_LIST_STREAM,
  createGreaderCompatibilityFixture,
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

const { User, sequelize } = db;

let app;
let ownedUserIds = [];

const mutationCases = [
  {
    name: 'edit-tag',
    path: '/api/greader/reader/api/0/edit-tag',
    body: fixture => ({
      i: fixture.oldUnread.id,
      a: READ_STREAM
    })
  },
  {
    name: 'mark-all-as-read',
    path: '/api/greader/reader/api/0/mark-all-as-read',
    body: () => ({
      s: READING_LIST_STREAM,
      ts: '1777680000000000'
    })
  },
  {
    name: 'subscription/edit',
    path: '/api/greader/reader/api/0/subscription/edit',
    body: fixture => ({
      s: `feed/${encodeURIComponent(fixture.primaryFeed.url)}`,
      ac: 'edit',
      t: 'Action Token Rename'
    })
  },
  {
    name: 'subscription/quickadd',
    path: '/api/greader/reader/api/0/subscription/quickadd',
    body: () => ({
      quickadd: 'https://action-token.example.test/feed'
    })
  },
  {
    name: 'rename-tag',
    path: '/api/greader/reader/api/0/rename-tag',
    body: fixture => ({
      s: `${LABEL_PREFIX}${encodeURIComponent(fixture.primaryCategory.name)}`,
      dest: `${LABEL_PREFIX}Renamed`
    })
  },
  {
    name: 'disable-tag',
    path: '/api/greader/reader/api/0/disable-tag',
    body: fixture => ({
      s: `${LABEL_PREFIX}${encodeURIComponent(fixture.primaryCategory.name)}`
    })
  }
];

// This function tracks fixture users so each test removes only its own state.
const trackUser = user => {
  ownedUserIds.push(user.id);
  return user;
};

// This function creates and tracks a complete authentication fixture.
const createFixture = async options => {
  const fixture = await createGreaderCompatibilityFixture(options);
  trackUser(fixture.user);
  return fixture;
};

// This function asserts the uniform Google Reader unauthorized contract.
const expectBadToken = response => {
  expect(response.status).toBe(401);
  expect(response.headers['content-type']).toMatch(/^text\/plain/);
  expect(response.headers['google-bad-token']).toBe('true');
  expect(response.text).toBe('Unauthorized');
};

describe('Google Reader authentication and action tokens', () => {
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

  it.each([
    ['missing authorization', null],
    ['unsupported authorization', 'Bearer token'],
    [
      'unknown username',
      `GoogleLogin auth=missing@example.test/${'0'.repeat(64)}`
    ]
  ])('returns the uniform bad-token response for %s', async (_label, header) => {
    const pendingRequest = request(app)
      .get('/api/greader/reader/api/0/user-info');
    if (header) {
      pendingRequest.set('Authorization', header);
    }

    expectBadToken(await pendingRequest);
  });

  it('returns the same response for a wrong token on an existing username', async () => {
    const user = trackUser(await createGreaderUser());
    const header = `GoogleLogin auth=${user.username}/${'0'.repeat(64)}`;

    const response = await request(app)
      .get('/api/greader/reader/api/0/user-info')
      .set('Authorization', header);

    expectBadToken(response);
  });

  it('adds Google-Bad-Token to invalid ClientLogin credentials', async () => {
    const user = trackUser(await createGreaderUser());

    const response = await request(app)
      .post('/api/greader/accounts/ClientLogin')
      .type('form')
      .send({ Email: user.username, Passwd: 'wrong-password' });

    expectBadToken(response);
  });

  it('parses a slash-containing username against the exact 64-character token suffix', async () => {
    const user = trackUser(
      await createGreaderUser(`reader/name-${Date.now()}@example.test`)
    );

    const response = await request(app)
      .get('/api/greader/reader/api/0/user-info')
      .set('Authorization', greaderAuthHeaderFor(user));

    expect(response.status).toBe(200);
    expect(response.body.userId).toBe(user.username);
  });

  it('rotates login and action credentials after a password change', async () => {
    const user = trackUser(await createGreaderUser());
    const oldHeader = greaderAuthHeaderFor(user);
    const oldActionToken = greaderActionTokenFor(user);
    await user.update({
      password: await bcrypt.hash('rotated-password', 4)
    });

    const oldCredentialResponse = await request(app)
      .get('/api/greader/reader/api/0/token')
      .set('Authorization', oldHeader);
    const newCredentialResponse = await request(app)
      .get('/api/greader/reader/api/0/token')
      .set('Authorization', greaderAuthHeaderFor(user));

    expectBadToken(oldCredentialResponse);
    expect(newCredentialResponse.status).toBe(200);
    expect(newCredentialResponse.text.slice(0, -1)).toHaveLength(57);
    expect(newCredentialResponse.text.slice(0, -1)).not.toBe(oldActionToken);
  });

  it('returns an action token distinct from the login credential', async () => {
    const user = trackUser(await createGreaderUser());
    const authToken = createGreaderAuthToken(user);

    const response = await request(app)
      .get('/api/greader/reader/api/0/token')
      .set('Authorization', greaderAuthHeaderFor(user));

    expect(response.status).toBe(200);
    expect(response.text).toBe(`${greaderActionTokenFor(user)}\n`);
    expect(response.text.slice(0, -1)).toHaveLength(57);
    expect(response.text.slice(0, -1)).not.toBe(authToken);
  });

  it('does not accept another user action token with an authenticated session', async () => {
    const fixture = await createFixture();
    const otherFixture = await createFixture();

    const response = await request(app)
      .post('/api/greader/reader/api/0/edit-tag')
      .type('form')
      .send({
        i: fixture.oldUnread.id,
        a: READ_STREAM,
        T: greaderActionTokenFor(otherFixture.user)
      })
      .set('Authorization', greaderAuthHeaderFor(fixture.user));

    expectBadToken(response);
  });

  it('rejects a non-ASCII action token with the uniform bad-token response', async () => {
    const fixture = await createFixture();

    const response = await request(app)
      .post('/api/greader/reader/api/0/edit-tag')
      .type('form')
      .send({
        i: fixture.oldUnread.id,
        a: READ_STREAM,
        T: 'é'.repeat(57)
      })
      .set('Authorization', greaderAuthHeaderFor(fixture.user));

    expectBadToken(response);
  });

  it.each(mutationCases)(
    'accepts a valid action token for $name',
    async ({ path, body }) => {
      const fixture = await createFixture();

      const response = await request(app)
        .post(path)
        .type('form')
        .send({
          ...body(fixture),
          T: greaderActionTokenFor(fixture.user)
        })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));

      expect(response.status).toBe(200);
    }
  );

  it.each(mutationCases)(
    'rejects a missing action token for $name',
    async ({ path, body }) => {
      const fixture = await createFixture();

      const response = await request(app)
        .post(path)
        .type('form')
        .send(body(fixture))
        .set('Authorization', greaderAuthHeaderFor(fixture.user));

      expectBadToken(response);
    }
  );

  it.each(mutationCases)(
    'rejects an invalid action token for $name',
    async ({ path, body }) => {
      const fixture = await createFixture();

      const response = await request(app)
        .post(path)
        .type('form')
        .send({ ...body(fixture), T: '0'.repeat(57) })
        .set('Authorization', greaderAuthHeaderFor(fixture.user));

      expectBadToken(response);
    }
  );

  it.each([
    ['missing', null],
    ['invalid', '0'.repeat(57)]
  ])('rejects a %s action token for subscription/import', async (
    _label,
    actionToken
  ) => {
    const fixture = await createFixture();
    const pendingRequest = request(app)
      .post('/api/greader/reader/api/0/subscription/import')
      .attach(
        'subscriptions_file',
        Buffer.from(
          '<opml version="2.0"><body><outline xmlUrl="https://example.test/rss"/></body></opml>'
        ),
        'subscriptions.opml'
      )
      .set('Authorization', greaderAuthHeaderFor(fixture.user));
    if (actionToken) pendingRequest.field('T', actionToken);

    expectBadToken(await pendingRequest);
    expect(mocked.discoverRssLink).not.toHaveBeenCalled();
  });

  it('preserves GET subscription/edit compatibility with a query action token', async () => {
    const fixture = await createFixture();

    const response = await request(app)
      .get('/api/greader/reader/api/0/subscription/edit')
      .query({
        s: `feed/${encodeURIComponent(fixture.primaryFeed.url)}`,
        ac: 'edit',
        t: 'GET Rename',
        T: greaderActionTokenFor(fixture.user)
      })
      .set('Authorization', greaderAuthHeaderFor(fixture.user));
    await fixture.primaryFeed.reload();

    expect(response.status).toBe(200);
    expect(fixture.primaryFeed.feedName).toBe('GET Rename');
  });

  it('requires an action token for GET subscription/edit compatibility', async () => {
    const fixture = await createFixture();

    const response = await request(app)
      .get('/api/greader/reader/api/0/subscription/edit')
      .query({
        s: `feed/${encodeURIComponent(fixture.primaryFeed.url)}`,
        ac: 'edit',
        t: 'Rejected Rename'
      })
      .set('Authorization', greaderAuthHeaderFor(fixture.user));

    expectBadToken(response);
  });
});
