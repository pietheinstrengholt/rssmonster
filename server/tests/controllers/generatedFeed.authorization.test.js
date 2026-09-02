import { beforeAll, describe, expect, it } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';

const { GeneratedFeed, User, sequelize } = db;
let app;

const uniqueName = prefix =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createUser = prefix => {
  const username = uniqueName(prefix);
  return User.create({
    username,
    password: 'hashed-password',
    feverCredentialHash: `${username}-hash`,
    role: 'user'
  });
};

const authHeaderFor = user => `Bearer ${jwt.sign({
  username: user.username,
  userId: user.id
}, getJwtSecret())}`;

const createGeneratedFeed = (user, overrides = {}) => request(app)
  .post('/api/generated-feeds')
  .set('Authorization', authHeaderFor(user))
  .send({
    name: 'Security News',
    description: 'Selected security reporting',
    expression: 'tag:security sort:desc limit:50',
    enabled: true,
    ...overrides
  });

describe('Generated Feed management API', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';
    app = (await import('../../app.js')).default;
    await sequelize.authenticate();
  }, 50_000);

  it('requires authentication for management endpoints', async () => {
    const responses = await Promise.all([
      request(app).get('/api/generated-feeds'),
      request(app).post('/api/generated-feeds').send({}),
      request(app).get('/api/generated-feeds/1'),
      request(app).put('/api/generated-feeds/1').send({ enabled: false }),
      request(app).delete('/api/generated-feeds/1'),
      request(app).post('/api/generated-feeds/1/regenerate-token')
    ]);

    expect(responses.map(response => response.status)).toEqual([400, 400, 400, 400, 400, 400]);
  });

  it('creates, lists, reads, and updates only mutable configuration', async () => {
    const owner = await createUser('generated-feed-owner');
    const created = await createGeneratedFeed(owner, {
      token: 'client-controlled-token'
    });

    expect(created.status).toBe(201);
    expect(created.body.generatedFeed).toMatchObject({
      name: 'Security News',
      description: 'Selected security reporting',
      expression: 'tag:security sort:desc limit:50',
      enabled: true
    });
    expect(created.body.generatedFeed.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.body.generatedFeed.token).not.toBe('client-controlled-token');
    expect(created.body.generatedFeed.rssUrl).toMatch(
      new RegExp(`/rss/generated/${created.body.generatedFeed.token}$`)
    );

    const generatedFeedId = created.body.generatedFeed.id;
    const originalToken = created.body.generatedFeed.token;
    const originalTokenRegeneratedAt = created.body.generatedFeed.tokenRegeneratedAt;
    const listed = await request(app)
      .get('/api/generated-feeds')
      .set('Authorization', authHeaderFor(owner));
    const loaded = await request(app)
      .get(`/api/generated-feeds/${generatedFeedId}`)
      .set('Authorization', authHeaderFor(owner));

    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject({
      total: 1,
      generatedFeeds: [expect.objectContaining({ id: generatedFeedId })]
    });
    expect(loaded.status).toBe(200);
    expect(loaded.body.generatedFeed.id).toBe(generatedFeedId);

    const updated = await request(app)
      .put(`/api/generated-feeds/${generatedFeedId}`)
      .set('Authorization', authHeaderFor(owner))
      .send({
        name: 'Updated Security',
        description: ' Updated description ',
        expression: 'unread:true tag:security limit:25',
        enabled: false,
        token: 'replacement-from-client'
      });

    expect(updated.status).toBe(200);
    expect(updated.body.generatedFeed).toMatchObject({
      id: generatedFeedId,
      name: 'Updated Security',
      description: 'Updated description',
      expression: 'unread:true tag:security limit:25',
      enabled: false,
      token: originalToken
    });
    expect(Math.abs(
      new Date(updated.body.generatedFeed.tokenRegeneratedAt).getTime()
      - new Date(originalTokenRegeneratedAt).getTime()
    )).toBeLessThan(1000);
  });

  it('validates create and update expressions without changing persisted state', async () => {
    const owner = await createUser('generated-feed-validation');
    const invalidCreate = await createGeneratedFeed(owner, {
      expression: 'quallity:>=0.7'
    });

    expect(invalidCreate.status).toBe(400);
    expect(invalidCreate.body).toEqual({
      error: {
        code: 'EXPRESSION_UNKNOWN_FILTER',
        message: 'Unknown expression field: "quallity".'
      }
    });
    expect(await GeneratedFeed.count({ where: { userId: owner.id } })).toBe(0);

    const created = await createGeneratedFeed(owner);
    const generatedFeedId = created.body.generatedFeed.id;
    const invalidUpdate = await request(app)
      .put(`/api/generated-feeds/${generatedFeedId}`)
      .set('Authorization', authHeaderFor(owner))
      .send({ expression: '@2026-02-31' });

    expect(invalidUpdate.status).toBe(400);
    expect(invalidUpdate.body.error.code).toBe('EXPRESSION_INVALID_TOKEN');
    expect((await GeneratedFeed.findByPk(generatedFeedId)).expression)
      .toBe('tag:security sort:desc limit:50');
  });

  it('rejects invalid management fields and unsupported updates', async () => {
    const owner = await createUser('generated-feed-field-validation');
    const invalidCreateCases = [
      [{ name: '   ' }, 'NAME_REQUIRED'],
      [{ name: 'n'.repeat(256) }, 'NAME_TOO_LONG'],
      [{ expression: 17 }, 'EXPRESSION_REQUIRED'],
      [{ description: { text: 'invalid' } }, 'DESCRIPTION_INVALID'],
      [{ description: 'd'.repeat(2001) }, 'DESCRIPTION_TOO_LONG'],
      [{ enabled: 'true' }, 'ENABLED_INVALID']
    ];

    for (const [overrides, expectedCode] of invalidCreateCases) {
      const response = await createGeneratedFeed(owner, overrides);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(expectedCode);
    }
    expect(await GeneratedFeed.count({ where: { userId: owner.id } })).toBe(0);

    const created = await createGeneratedFeed(owner);
    const unsupportedUpdate = await request(app)
      .put(`/api/generated-feeds/${created.body.generatedFeed.id}`)
      .set('Authorization', authHeaderFor(owner))
      .send({ token: 'client-token', userId: 999 });

    expect(unsupportedUpdate.status).toBe(400);
    expect(unsupportedUpdate.body.error.code).toBe('UPDATE_EMPTY');
    expect((await GeneratedFeed.findByPk(created.body.generatedFeed.id))).toMatchObject({
      name: 'Security News',
      token: created.body.generatedFeed.token,
      userId: owner.id
    });
  });

  it('lists owned feeds in deterministic name and id order', async () => {
    const owner = await createUser('generated-feed-list-order');
    await createGeneratedFeed(owner, { name: 'Zulu' });
    await createGeneratedFeed(owner, { name: 'Alpha' });
    await createGeneratedFeed(owner, { name: 'Alpha' });

    const response = await request(app)
      .get('/api/generated-feeds')
      .set('Authorization', authHeaderFor(owner));

    expect(response.status).toBe(200);
    expect(response.body.generatedFeeds.map(feed => feed.name))
      .toEqual(['Alpha', 'Alpha', 'Zulu']);
    expect(response.body.generatedFeeds.slice(0, 2).map(feed => feed.id))
      .toEqual([...response.body.generatedFeeds.slice(0, 2).map(feed => feed.id)].sort((a, b) => a - b));
  });

  it('does not reveal or mutate another user\'s Generated Feed', async () => {
    const owner = await createUser('generated-feed-private-owner');
    const otherUser = await createUser('generated-feed-private-viewer');
    const created = await createGeneratedFeed(owner);
    const generatedFeedId = created.body.generatedFeed.id;
    const originalToken = created.body.generatedFeed.token;
    const authorization = authHeaderFor(otherUser);

    const responses = await Promise.all([
      request(app).get(`/api/generated-feeds/${generatedFeedId}`).set('Authorization', authorization),
      request(app).put(`/api/generated-feeds/${generatedFeedId}`)
        .set('Authorization', authorization)
        .send({ name: 'Foreign update' }),
      request(app).delete(`/api/generated-feeds/${generatedFeedId}`).set('Authorization', authorization),
      request(app).post(`/api/generated-feeds/${generatedFeedId}/regenerate-token`)
        .set('Authorization', authorization)
    ]);

    for (const response of responses) {
      expect(response.status).toBe(404);
      expect(response.body).toEqual({ message: 'Generated Feed not found' });
    }

    const otherList = await request(app)
      .get('/api/generated-feeds')
      .set('Authorization', authorization);
    const persisted = await GeneratedFeed.findByPk(generatedFeedId);

    expect(otherList.body).toEqual({ total: 0, generatedFeeds: [] });
    expect(persisted).toMatchObject({
      name: 'Security News',
      token: originalToken
    });
  });

  it('regenerates the token and immediately removes the previous lookup value', async () => {
    const owner = await createUser('generated-feed-regeneration');
    const created = await createGeneratedFeed(owner);
    const generatedFeedId = created.body.generatedFeed.id;
    const oldToken = created.body.generatedFeed.token;

    const regenerated = await request(app)
      .post(`/api/generated-feeds/${generatedFeedId}/regenerate-token`)
      .set('Authorization', authHeaderFor(owner));

    expect(regenerated.status).toBe(200);
    expect(regenerated.body.generatedFeed.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(regenerated.body.generatedFeed.token).not.toBe(oldToken);
    expect(await GeneratedFeed.findOne({ where: { token: oldToken } })).toBeNull();
    expect(await GeneratedFeed.findOne({
      where: { token: regenerated.body.generatedFeed.token }
    })).not.toBeNull();
  });

  it('deletes only the owned Generated Feed configuration', async () => {
    const owner = await createUser('generated-feed-delete');
    const created = await createGeneratedFeed(owner);
    const generatedFeedId = created.body.generatedFeed.id;

    const deleted = await request(app)
      .delete(`/api/generated-feeds/${generatedFeedId}`)
      .set('Authorization', authHeaderFor(owner));

    expect(deleted.status).toBe(204);
    expect(await GeneratedFeed.findByPk(generatedFeedId)).toBeNull();
  });
});
