import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

const { BriefingPreference, User, sequelize } = db;

let app;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// This function creates a signed authorization header for test requests.
const authHeaderFor = user => {
  const token = jwt.sign(
    { username: user.username, userId: user.id },
    getJwtSecret()
  );

  return `Bearer ${token}`;
};

// This function creates a user for Briefing Preferences endpoint tests.
const createUser = () => User.create({
  username: uniqueName('briefing-preferences-user'),
  password: 'hashed-password',
  hash: uniqueName('briefing-preferences-hash'),
  role: 'user'
});

describe('Briefing Preferences API', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('returns stored preferences', async () => {
    const user = await createUser();
    await BriefingPreference.create({
      userId: user.id,
      includeOnlyUnreadArticles: false,
      includeDevelopingEvents: false,
      showOnlyInterestMatchedArticles: true,
      showOnlyDevelopingEventArticles: false,
      minDistinctSources: 4,
      prioritizeHighTrust: false,
      selectionPeriod: '24h'
    });

    const response = await request(app)
      .get('/api/briefing/preferences')
      .set('Authorization', authHeaderFor(user));

    expect(response.status).toBe(200);
    expect(response.body.preferences).toEqual({
      includeOnlyUnreadArticles: false,
      includeDevelopingEvents: false,
      showOnlyInterestMatchedArticles: true,
      showOnlyDevelopingEventArticles: false,
      minDistinctSources: 4,
      prioritizeHighTrust: false,
      selectionPeriod: '24h'
    });
    expect(response.body).not.toHaveProperty('interestIslands');
  });

  it('returns effective defaults without persisting a preference row', async () => {
    const user = await createUser();

    const response = await request(app)
      .get('/api/briefing/preferences')
      .set('Authorization', authHeaderFor(user));

    expect(response.status).toBe(200);
    expect(response.body.preferences).toEqual({
      includeOnlyUnreadArticles: false,
      includeDevelopingEvents: false,
      showOnlyInterestMatchedArticles: false,
      showOnlyDevelopingEventArticles: false,
      minDistinctSources: 1,
      prioritizeHighTrust: false,
      selectionPeriod: '7d'
    });
    expect(response.body).not.toHaveProperty('interestIslands');
    expect(await BriefingPreference.count({ where: { userId: user.id } })).toBe(0);
  });

  it('replaces preferences', async () => {
    const user = await createUser();

    await BriefingPreference.create({ userId: user.id });

    const response = await request(app)
      .put('/api/briefing/preferences')
      .set('Authorization', authHeaderFor(user))
      .send({
        preferences: {
          includeOnlyUnreadArticles: false,
          includeDevelopingEvents: false,
          showOnlyInterestMatchedArticles: true,
          showOnlyDevelopingEventArticles: false,
          minDistinctSources: 5,
          prioritizeHighTrust: false,
          selectionPeriod: '24h'
        }
      });

    expect(response.status).toBe(200);
    expect(response.body.preferences).toEqual({
      includeOnlyUnreadArticles: false,
      includeDevelopingEvents: false,
      showOnlyInterestMatchedArticles: true,
      showOnlyDevelopingEventArticles: false,
      minDistinctSources: 5,
      prioritizeHighTrust: false,
      selectionPeriod: '24h'
    });
    expect(response.body).not.toHaveProperty('interestIslands');

    const storedPreferences = await BriefingPreference.findOne({
      where: { userId: user.id },
      raw: true
    });
    expect(Boolean(storedPreferences.includeOnlyUnreadArticles)).toBe(false);
    expect(Boolean(storedPreferences.includeDevelopingEvents)).toBe(false);
    expect(Boolean(storedPreferences.showOnlyInterestMatchedArticles)).toBe(true);
    expect(Boolean(storedPreferences.showOnlyDevelopingEventArticles)).toBe(false);
    expect(Boolean(storedPreferences.prioritizeHighTrust)).toBe(false);
    expect(storedPreferences).toMatchObject({
      minDistinctSources: 5,
      selectionPeriod: '24h'
    });
  });

  it('rejects an invalid complete preference replacement', async () => {
    const user = await createUser();

    const response = await request(app)
      .put('/api/briefing/preferences')
      .set('Authorization', authHeaderFor(user))
      .send({
        preferences: {
          includeOnlyUnreadArticles: true,
          includeDevelopingEvents: true,
          showOnlyInterestMatchedArticles: false,
          showOnlyDevelopingEventArticles: false,
          minDistinctSources: 2,
          prioritizeHighTrust: true,
          selectionPeriod: 'today'
        }
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'selectionPeriod must be 24h or 7d' });
    expect(await BriefingPreference.count({ where: { userId: user.id } })).toBe(0);
  });

  it('rejects enabling both exclusive article-type filters', async () => {
    const user = await createUser();

    const response = await request(app)
      .put('/api/briefing/preferences')
      .set('Authorization', authHeaderFor(user))
      .send({
        preferences: {
          includeOnlyUnreadArticles: false,
          includeDevelopingEvents: false,
          showOnlyInterestMatchedArticles: true,
          showOnlyDevelopingEventArticles: true,
          minDistinctSources: 1,
          prioritizeHighTrust: false,
          selectionPeriod: '7d'
        }
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Only one article-type filter can be enabled' });
    expect(await BriefingPreference.count({ where: { userId: user.id } })).toBe(0);
  });
});
