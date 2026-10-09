import { beforeAll, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { decryptSecret } from '../../services/secretEncryption.js';
import { getJwtSecret } from '../../config/auth.js';

const { Category, Feed, User, Webhook, WebhookCondition, sequelize } = db;
let app;
let sequence = 0;
const createUser = () => User.create({
  username: `webhook-user-${Date.now()}-${++sequence}`,
  password: 'hashed-password',
  feverCredentialHash: `webhook-hash-${Date.now()}-${sequence}`,
  role: 'user'
});
const auth = user => `Bearer ${jwt.sign({ username: user.username, userId: user.id }, getJwtSecret())}`;
const definition = overrides => ({
  name: 'Alerts', endpointUrl: 'https://example.com/hook', enabled: true, matchMode: 'ALL',
  conditions: [{ field: 'title', operator: 'contains', value: 'RSSMonster' }], ...overrides
});
const post = (user, payload = definition()) => request(app).post('/api/webhooks')
  .set('Authorization', auth(user)).send(payload);

describe('Webhook management API', () => {
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.DISABLE_LISTENER = 'true';
    process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    app = (await import('../../app.js')).default;
    await sequelize.authenticate();
  }, 50_000);

  it('requires authentication and scopes list/detail/update/delete to the owner', async () => {
    const owner = await createUser();
    const other = await createUser();
    const created = await post(owner);
    const id = created.body.webhook.id;
    const unauthenticated = await request(app).get('/api/webhooks');
    expect(unauthenticated.status).toBe(401);

    const list = await request(app).get('/api/webhooks').set('Authorization', auth(other));
    const detail = await request(app).get(`/api/webhooks/${id}`).set('Authorization', auth(other));
    const updated = await request(app).put(`/api/webhooks/${id}`).set('Authorization', auth(other)).send(definition());
    const deleted = await request(app).delete(`/api/webhooks/${id}`).set('Authorization', auth(other));
    expect(list.body).toEqual({ total: 0, webhooks: [] });
    expect([detail.status, updated.status, deleted.status]).toEqual([404, 404, 404]);
    expect(await Webhook.count({ where: { id, userId: owner.id } })).toBe(1);
  });

  it('creates, lists, loads, updates, and deletes a webhook with ordered conditions', async () => {
    const user = await createUser();
    const category = await Category.create({ userId: user.id, name: 'Technology' });
    const created = await post(user, definition({
      secret: 'saved-secret',
      conditions: [
        { field: 'category', operator: 'is', value: String(category.id) },
        { field: 'title', operator: 'contains', value: 'RSSMonster' }
      ]
    }));
    expect(created.status).toBe(201);
    expect(created.body.webhook.conditions.map(item => item.field)).toEqual(['category', 'title']);
    expect(created.body.webhook).not.toHaveProperty('secret');
    expect(created.body.webhook).not.toHaveProperty('userId');
    const id = created.body.webhook.id;
    const stored = await Webhook.unscoped().findByPk(id);
    expect(stored.secret).not.toBe('saved-secret');
    expect(decryptSecret(stored.secret)).toBe('saved-secret');

    const listed = await request(app).get('/api/webhooks').set('Authorization', auth(user));
    const loaded = await request(app).get(`/api/webhooks/${id}`).set('Authorization', auth(user));
    expect(listed.body.webhooks.map(item => item.id)).toContain(id);
    expect(loaded.body.webhook.conditions).toHaveLength(2);

    const updated = await request(app).put(`/api/webhooks/${id}`).set('Authorization', auth(user))
      .send(definition({ name: 'Changed', enabled: false, matchMode: 'ANY',
        conditions: [{ field: 'author', operator: 'is_not', value: 'Bot' }] }));
    expect(updated.status).toBe(200);
    expect(updated.body.webhook).toMatchObject({ name: 'Changed', enabled: false, matchMode: 'ANY' });
    expect(updated.body.webhook.conditions).toMatchObject([{ field: 'author', value: 'Bot' }]);
    expect(await WebhookCondition.count({ where: { webhookId: id } })).toBe(1);
    expect(decryptSecret((await Webhook.unscoped().findByPk(id)).secret)).toBe('saved-secret');

    const deleted = await request(app).delete(`/api/webhooks/${id}`).set('Authorization', auth(user));
    expect(deleted.status).toBe(204);
    expect(await Webhook.findByPk(id)).toBeNull();
    expect(await WebhookCondition.count({ where: { webhookId: id } })).toBe(0);
  });

  it('rejects invalid definitions and foreign feed/category values', async () => {
    const user = await createUser();
    const other = await createUser();
    const category = await Category.create({ userId: other.id, name: 'Private' });
    const feed = await Feed.create({ userId: other.id, categoryId: category.id,
      feedName: 'Private feed', url: `https://example.com/${other.id}.xml` });
    const cases = [
      [definition({ matchMode: 'SOME' }), 'MATCH_MODE_INVALID'],
      [definition({ endpointUrl: 'file:///tmp/hook' }), 'ENDPOINT_URL_INVALID'],
      [definition({ endpointUrl: 'https://user:password@example.com/hook' }), 'ENDPOINT_URL_INVALID'],
      [definition({ conditions: [{ field: 'island', operator: 'is', value: '1' }] }), 'CONDITION_INVALID'],
      [definition({ conditions: [{ field: 'title', operator: 'matches', value: 'x' }] }), 'CONDITION_INVALID'],
      [definition({ conditions: 'bad' }), 'CONDITIONS_INVALID'],
      [definition({ conditions: [{ field: 'feed', operator: 'is', value: String(feed.id) }] }), 'CONDITION_VALUE_NOT_FOUND'],
      [definition({ conditions: [{ field: 'category', operator: 'is', value: String(category.id) }] }), 'CONDITION_VALUE_NOT_FOUND']
    ];
    for (const [payload, code] of cases) {
      const response = await post(user, payload);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe(code);
    }
    expect(await Webhook.count({ where: { userId: user.id } })).toBe(0);
  });

  it('accepts an empty condition set and reports missing webhook ids', async () => {
    const user = await createUser();
    const created = await post(user, definition({ conditions: [] }));
    expect(created.status).toBe(201);
    expect(created.body.webhook.conditions).toEqual([]);

    const missingId = 2147483647;
    const loaded = await request(app).get(`/api/webhooks/${missingId}`).set('Authorization', auth(user));
    const updated = await request(app).put(`/api/webhooks/${missingId}`)
      .set('Authorization', auth(user)).send(definition());
    const deleted = await request(app).delete(`/api/webhooks/${missingId}`).set('Authorization', auth(user));
    expect([loaded.status, updated.status, deleted.status]).toEqual([404, 404, 404]);
  });

  it('accepts a deterministic domain condition', async () => {
    const user = await createUser();
    const created = await post(user, definition({
      conditions: [{ field: 'domain', operator: 'is', value: 'news.example.com' }]
    }));
    expect(created.status).toBe(201);
    expect(created.body.webhook.conditions).toMatchObject([
      { field: 'domain', operator: 'is', value: 'news.example.com' }
    ]);
  });

  it('rolls back create and update when condition insertion fails', async () => {
    const user = await createUser();
    const failure = vi.spyOn(WebhookCondition, 'bulkCreate').mockRejectedValueOnce(new Error('condition failure'));
    const failedCreate = await post(user);
    expect(failedCreate.status).toBe(500);
    expect(await Webhook.count({ where: { userId: user.id } })).toBe(0);
    failure.mockRestore();

    const created = await post(user);
    const id = created.body.webhook.id;
    const originalConditionId = created.body.webhook.conditions[0].id;
    const updateFailure = vi.spyOn(WebhookCondition, 'bulkCreate').mockRejectedValueOnce(new Error('condition failure'));
    const failedUpdate = await request(app).put(`/api/webhooks/${id}`)
      .set('Authorization', auth(user)).send(definition({ name: 'Failed replacement',
        conditions: [{ field: 'author', operator: 'is', value: 'Bot' }] }));
    expect(failedUpdate.status).toBe(500);
    expect((await Webhook.findByPk(id)).name).toBe('Alerts');
    expect((await WebhookCondition.findAll({ where: { webhookId: id } })).map(item => item.id))
      .toEqual([originalConditionId]);
    updateFailure.mockRestore();
  });
});
