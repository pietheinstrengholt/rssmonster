import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  articleFindAll: vi.fn(),
  bcryptCompare: vi.fn(),
  bcryptHash: vi.fn(),
  briefingBuild: vi.fn(),
  briefingFindOne: vi.fn(),
  briefingUpsert: vi.fn(),
  jwtSign: vi.fn(),
  settingFindOne: vi.fn(),
  settingFindOrCreate: vi.fn(),
  userCount: vi.fn(),
  userCreate: vi.fn(),
  userFindOne: vi.fn()
}));

vi.mock('bcryptjs', () => ({
  default: {
    compare: mocked.bcryptCompare,
    hash: mocked.bcryptHash
  }
}));

vi.mock('jsonwebtoken', () => ({
  default: {
    sign: mocked.jwtSign
  }
}));

vi.mock('../../config/auth.js', () => ({
  getJwtSecret: vi.fn(() => 'test-secret')
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: {
      findAll: mocked.articleFindAll
    },
    BriefingPreference: {
      build: mocked.briefingBuild,
      findOne: mocked.briefingFindOne,
      upsert: mocked.briefingUpsert
    },
    Category: { name: 'Category' },
    Feed: { name: 'Feed' },
    Setting: {
      findOne: mocked.settingFindOne,
      findOrCreate: mocked.settingFindOrCreate
    },
    User: {
      count: mocked.userCount,
      create: mocked.userCreate,
      findOne: mocked.userFindOne
    }
  }
}));

const authController = (await import('../../controllers/auth.js')).default;
const briefingController = (await import('../../controllers/briefing.js')).default;
const rssController = (await import('../../controllers/rss.js')).default;

// Builds the response methods shared by the directly invoked controllers.
const createResponse = () => {
  const res = {
    json: vi.fn(),
    send: vi.fn(),
    set: vi.fn(),
    status: vi.fn()
  };
  res.json.mockReturnValue(res);
  res.send.mockReturnValue(res);
  res.set.mockReturnValue(res);
  res.status.mockReturnValue(res);
  return res;
};

// Builds an authenticated request with HTTP metadata suitable for RSS generation.
const createRequest = (overrides = {}) => ({
  body: {},
  get: vi.fn(() => 'rss.example.test'),
  originalUrl: '/rss',
  protocol: 'https',
  query: {},
  userData: { userId: 42 },
  ...overrides
});

// Supplies a complete valid preference replacement for validation-focused tests.
const validPreferences = (overrides = {}) => ({
  includeOnlyUnreadArticles: false,
  markAsReadOnScroll: false,
  includeDevelopingEvents: false,
  showOnlyInterestMatchedArticles: false,
  showOnlyDevelopingEventArticles: false,
  minDistinctSources: 1,
  prioritizeHighTrust: false,
  selectionPeriod: '7d',
  ...overrides
});

// Resets dependency behavior before each controller edge-case test.
const resetMocks = () => {
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
};

describe('auth controller edge cases', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('rejects a duplicate registration before hashing credentials', async () => {
    mocked.userFindOne.mockResolvedValue({ id: 1 });
    const res = createResponse();

    await authController.register(
      createRequest({ body: { username: 'existing', password: 'secret' } }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(409);
    expect(mocked.bcryptHash).not.toHaveBeenCalled();
  });

  it('reports registration persistence failures', async () => {
    mocked.userFindOne.mockRejectedValue(new Error('registration failed'));
    const res = createResponse();

    await authController.register(
      createRequest({ body: { username: 'new-user', password: 'secret' } }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'registration failed' });
  });

  it('rejects unknown users and incorrect passwords', async () => {
    const missingRes = createResponse();
    mocked.userFindOne.mockResolvedValueOnce(null);
    await authController.login(
      createRequest({ body: { username: 'missing', password: 'secret' } }),
      missingRes
    );
    expect(missingRes.status).toHaveBeenCalledWith(401);

    const mismatchRes = createResponse();
    mocked.userFindOne.mockResolvedValueOnce({ password: 'hash' });
    mocked.bcryptCompare.mockResolvedValueOnce(false);
    await authController.login(
      createRequest({ body: { username: 'known', password: 'wrong' } }),
      mismatchRes
    );
    expect(mismatchRes.status).toHaveBeenCalledWith(401);
    expect(mocked.jwtSign).not.toHaveBeenCalled();
  });

  it('reports login failures without leaking controller state', async () => {
    mocked.userFindOne.mockRejectedValue(new Error('login failed'));
    const res = createResponse();

    await authController.login(
      createRequest({ body: { username: 'known', password: 'secret' } }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'login failed' });
  });

  it('rejects missing validated users and reports lookup failures', async () => {
    mocked.userFindOne.mockResolvedValueOnce(null);
    const missingRes = createResponse();
    await authController.validate(createRequest(), missingRes);
    expect(missingRes.status).toHaveBeenCalledWith(401);

    mocked.userFindOne.mockRejectedValueOnce(new Error('validation failed'));
    const failureRes = createResponse();
    await authController.validate(createRequest(), failureRes);
    expect(failureRes.status).toHaveBeenCalledWith(500);
    expect(failureRes.json).toHaveBeenCalledWith({ message: 'validation failed' });
  });
});

describe('briefing controller edge cases', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('enforces controller-level authentication on reads and writes', async () => {
    const request = createRequest({ userData: {} });
    const readRes = createResponse();
    const writeRes = createResponse();

    await briefingController.getBriefingPreferences(request, readRes);
    await briefingController.updateBriefingPreferences(request, writeRes);

    expect(readRes.status).toHaveBeenCalledWith(401);
    expect(writeRes.status).toHaveBeenCalledWith(401);
    expect(mocked.briefingFindOne).not.toHaveBeenCalled();
  });

  it.each([
    [null, 'preferences must be an object'],
    [validPreferences({ includeOnlyUnreadArticles: 1 }), 'Briefing preference flags must be boolean values'],
    [validPreferences({ markAsReadOnScroll: true }), 'markAsReadOnScroll requires includeOnlyUnreadArticles'],
    [validPreferences({ minDistinctSources: 0 }), 'minDistinctSources must be an integer between 1 and 127']
  ])('rejects malformed preference payloads', async (preferences, error) => {
    const res = createResponse();

    await briefingController.updateBriefingPreferences(
      createRequest({ body: { preferences } }),
      res
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error });
    expect(mocked.briefingUpsert).not.toHaveBeenCalled();
  });

  it('reports preference read and write failures with stable errors', async () => {
    mocked.briefingFindOne.mockRejectedValueOnce(new Error('read failed'));
    const readRes = createResponse();
    await briefingController.getBriefingPreferences(createRequest(), readRes);
    expect(readRes.status).toHaveBeenCalledWith(500);
    expect(readRes.json).toHaveBeenCalledWith({
      error: 'Unable to load Briefing Preferences'
    });

    mocked.briefingUpsert.mockRejectedValueOnce(new Error('write failed'));
    const writeRes = createResponse();
    await briefingController.updateBriefingPreferences(
      createRequest({ body: { preferences: validPreferences() } }),
      writeRes
    );
    expect(writeRes.status).toHaveBeenCalledWith(500);
    expect(writeRes.json).toHaveBeenCalledWith({
      error: 'Unable to save Briefing Preferences'
    });
  });
});

describe('RSS controller edge cases', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('requires controller-level authentication', async () => {
    const res = createResponse();

    await rssController.generateRss(
      createRequest({ userData: {} }),
      res,
      vi.fn()
    );

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mocked.articleFindAll).not.toHaveBeenCalled();
  });

  it('applies RSS filters, caps the limit, and emits feed metadata', async () => {
    mocked.articleFindAll.mockResolvedValue([{
      id: 7,
      userId: 42,
      title: '',
      url: 'https://example.test/article',
      content: 'Fallback content',
      createdAt: new Date('2026-07-01T10:00:00Z'),
      feed: { feedName: 'Technology' }
    }]);
    const res = createResponse();

    await rssController.generateRss(
      createRequest({
        originalUrl: '/rss?feedId=9&categoryId=3&limit=500&starred=true&unread=true',
        query: {
          categoryId: '3',
          feedId: '9',
          limit: '500',
          starred: 'true',
          unread: 'true'
        }
      }),
      res,
      vi.fn()
    );

    expect(mocked.articleFindAll).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        favoriteInd: 1,
        feedId: '9',
        status: 'unread',
        userId: 42
      }),
      include: [expect.objectContaining({
        required: true,
        where: { categoryId: '3' }
      })],
      limit: 200
    }));
    expect(res.set).toHaveBeenCalledWith('Content-Type', 'application/rss+xml');
    expect(res.set).toHaveBeenCalledWith(
      'Content-Location',
      'https://rss.example.test/rss?feedId=9&categoryId=3&limit=500&starred=true&unread=true'
    );
    expect(res.send.mock.calls[0][0]).toContain('<title>No title</title>');
    expect(res.send.mock.calls[0][0]).toContain('Fallback content');
    expect(res.send.mock.calls[0][0]).toContain('Technology');
  });

  it('uses the default limit for invalid input and forwards query failures', async () => {
    mocked.articleFindAll.mockResolvedValueOnce([]);
    const successRes = createResponse();
    await rssController.generateRss(
      createRequest({ query: { limit: 'invalid' } }),
      successRes,
      vi.fn()
    );
    expect(mocked.articleFindAll.mock.calls[0][0].limit).toBe(50);

    const error = new Error('RSS query failed');
    mocked.articleFindAll.mockRejectedValueOnce(error);
    const next = vi.fn();
    await rssController.generateRss(createRequest(), createResponse(), next);
    expect(next).toHaveBeenCalledWith(error);
  });

  it.each(['0', '-1', '-500'])(
    'clamps non-positive RSS limit %s to one',
    async limit => {
      mocked.articleFindAll.mockResolvedValueOnce([]);

      await rssController.generateRss(
        createRequest({ query: { limit } }),
        createResponse(),
        vi.fn()
      );

      expect(mocked.articleFindAll).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 1 })
      );
    }
  );
});
