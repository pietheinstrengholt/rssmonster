import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { testInferenceConfiguration } from '../../services/inference/status.js';
import { getJwtSecret } from '../../config/auth.js';
vi.mock('../../services/inference/status.js', () => ({ clearInferenceStatus: vi.fn(), testInferenceConfiguration: vi.fn(async () => ({ state: 'ready', ready: true })), getInferenceStatus: vi.fn(async () => ({ state: 'not_configured', ready: false })), getAvailableInferenceCapabilities: vi.fn(async () => ({})) }));
let app;
let admin;
let user;
const authorization = person => `Bearer ${jwt.sign({ userId: person.id }, getJwtSecret())}`;
beforeAll(async () => {
  process.env.DISABLE_LISTENER = 'true'; app = (await import('../../app.js')).default;
  const create = role => db.User.create({ username: `inference-${role}-${Date.now()}`, password: 'test-hash', feverCredentialHash: `hash-${role}-${Date.now()}`, role });
  admin = await create('admin'); user = await create('user');
});
beforeEach(async () => { vi.stubEnv('INFERENCE_BASE_URL', ''); vi.stubEnv('INFERENCE_URL', ''); await db.InferenceSetting.destroy({ where: {} }); });
afterEach(async () => { await db.InferenceSetting.destroy({ where: {} }); vi.unstubAllEnvs(); });
describe('administrator inference settings API', () => {
  it.each([['get', '/inference'], ['put', '/inference'], ['delete', '/inference'], ['post', '/inference/test']])('rejects non-admin %s %s', async (method, path) => {
    const response = await request(app)[method](`/api/setting${path}`).set('Authorization', authorization(user)).send({ baseUrl: 'http://host', apiKeyAction: 'remove' });
    expect(response.status).toBe(403);
  });
  it('requires authentication and current database administrator role', async () => {
    expect((await request(app).get('/api/setting/inference')).status).toBe(400);
    const token = authorization(admin);
    await admin.update({ role: 'user' });
    expect((await request(app).get('/api/setting/inference').set('Authorization', token)).status).toBe(403);
    await admin.update({ role: 'admin' });
  });
  it('saves, reads, tests and removes configuration without returning secrets', async () => {
    const auth = authorization(admin);
    const saved = await request(app).put('/api/setting/inference').set('Authorization', auth)
      .send({ baseUrl: 'http://test.example/', apiKeyAction: 'replace', apiKey: 'test-private-secret' });
    expect(saved.status).toBe(200); expect(saved.body.apiKeyConfigured).toBe(true);
    const read = await request(app).get('/api/setting/inference').set('Authorization', auth);
    expect(read.body.baseUrl).toBe('http://test.example'); expect(JSON.stringify([saved.body, read.body])).not.toContain('test-private-secret');
    expect((await request(app).post('/api/setting/inference/test').set('Authorization', auth)).status).toBe(200);
    expect((await request(app).delete('/api/setting/inference').set('Authorization', auth)).body.configurationSource).toBe('none');
  });
  it('passes an unauthenticated draft to the probe without saving', async () => {
    const draft = { baseUrl: 'http://127.0.0.1:3001/', apiKeyAction: 'replace', apiKey: '' };
    const response = await request(app).post('/api/setting/inference/test').set('Authorization', authorization(admin)).send(draft);
    expect(response.status).toBe(200);
    expect(response.body.ready).toBe(true);
    expect(testInferenceConfiguration).toHaveBeenCalledWith(draft);
    expect(await db.InferenceSetting.count()).toBe(0);
  });
  it('rejects writes and clears when the environment owns the connection', async () => {
    vi.stubEnv('INFERENCE_BASE_URL', 'http://deployment');
    for (const method of ['put', 'delete']) {
      const response = await request(app)[method]('/api/setting/inference').set('Authorization', authorization(admin)).send({ baseUrl: 'http://other', apiKeyAction: 'remove' });
      expect(response.status).toBe(409);
    }
  });
});
