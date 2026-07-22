import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

const { BriefingPreference, Setting, User, sequelize } = db;

let app;

const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// This function creates a signed authorization header for settings endpoint tests.
const authHeaderFor = user => {
  const token = jwt.sign(
    {
      username: user.username,
      userId: user.id
    },
    getJwtSecret()
  );

  return `Bearer ${token}`;
};

// This function creates a persisted user for settings endpoint tests.
const createUser = () => User.create({
  username: uniqueName('settings-user'),
  password: 'hashed-password',
  hash: uniqueName('settings-hash'),
  role: 'user'
});

describe('settings controller', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';

    const mod = await import('../../app.js');
    app = mod.default;

    await sequelize.authenticate();
  }, 50_000);

  it('serializes the false developing-events default', async () => {
    const user = await createUser();

    const response = await request(app)
      .get('/api/setting')
      .set('Authorization', authHeaderFor(user));

    expect(response.status).toBe(200);
    expect(response.body.includeDevelopingEvents).toBe(false);
  });

  it('validates and persists the developing-events setting', async () => {
    const user = await createUser();
    const response = await request(app)
      .post('/api/setting')
      .set('Authorization', authHeaderFor(user))
      .send({
        minAdvertisementScore: 0,
        minSentimentScore: 0,
        minQualityScore: 0,
        includeDevelopingEvents: true
      });

    const settings = await Setting.findOne({ where: { userId: user.id } });
    const hydratedResponse = await request(app)
      .get('/api/setting')
      .set('Authorization', authHeaderFor(user));

    expect(response.status).toBe(200);
    expect(response.body.includeDevelopingEvents).toBe(true);
    expect(Boolean(settings.includeDevelopingEvents)).toBe(true);
    expect(hydratedResponse.status).toBe(200);
    expect(hydratedResponse.body.includeDevelopingEvents).toBe(true);
  });

  it('rejects a non-boolean developing-events setting', async () => {
    const user = await createUser();
    const response = await request(app)
      .post('/api/setting')
      .set('Authorization', authHeaderFor(user))
      .send({
        minAdvertisementScore: 0,
        minSentimentScore: 0,
        minQualityScore: 0,
        includeDevelopingEvents: 'true'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('includeDevelopingEvents must be a boolean');
  });

  it('updates only the current user developing-events setting', async () => {
    const user = await createUser();
    const otherUser = await createUser();
    await Setting.create({
      userId: user.id,
      minAdvertisementScore: 15,
      minSentimentScore: 25,
      minQualityScore: 35,
      includeDevelopingEvents: false
    });
    await BriefingPreference.create({
      userId: user.id,
      includeDevelopingEvents: false,
      minDistinctSources: 4,
      selectionPeriod: '24h'
    });
    await Setting.create({
      userId: otherUser.id,
      includeDevelopingEvents: false
    });
    await BriefingPreference.create({
      userId: otherUser.id,
      includeDevelopingEvents: false
    });

    const response = await request(app)
      .patch('/api/setting/developing-events')
      .set('Authorization', authHeaderFor(user))
      .send({ includeDevelopingEvents: true });

    const settings = await Setting.findOne({ where: { userId: user.id }, raw: true });
    const otherSettings = await Setting.findOne({ where: { userId: otherUser.id }, raw: true });
    const briefingPreference = await BriefingPreference.findOne({
      where: { userId: user.id },
      raw: true
    });
    const otherBriefingPreference = await BriefingPreference.findOne({
      where: { userId: otherUser.id },
      raw: true
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      includeDevelopingEvents: true
    });
    expect(Boolean(settings.includeDevelopingEvents)).toBe(true);
    expect(settings).toMatchObject({
      minAdvertisementScore: 15,
      minSentimentScore: 25,
      minQualityScore: 35
    });
    expect(Boolean(otherSettings.includeDevelopingEvents)).toBe(false);
    expect(Boolean(briefingPreference.includeDevelopingEvents)).toBe(true);
    expect(briefingPreference).toMatchObject({
      minDistinctSources: 4,
      selectionPeriod: '24h'
    });
    expect(Boolean(otherBriefingPreference.includeDevelopingEvents)).toBe(false);
  });

  it('creates current user settings and validates the dedicated payload', async () => {
    const user = await createUser();

    const invalidResponse = await request(app)
      .patch('/api/setting/developing-events')
      .set('Authorization', authHeaderFor(user))
      .send({ includeDevelopingEvents: 'true' });
    const validResponse = await request(app)
      .patch('/api/setting/developing-events')
      .set('Authorization', authHeaderFor(user))
      .send({ includeDevelopingEvents: true });

    const settings = await Setting.findOne({ where: { userId: user.id } });
    const briefingPreference = await BriefingPreference.findOne({ where: { userId: user.id } });

    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.error).toBe('includeDevelopingEvents must be a boolean');
    expect(validResponse.status).toBe(200);
    expect(Boolean(settings.includeDevelopingEvents)).toBe(true);
    expect(Boolean(briefingPreference.includeDevelopingEvents)).toBe(true);
  });
});
