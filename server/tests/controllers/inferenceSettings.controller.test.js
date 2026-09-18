import { INFERENCE_RUNTIME_FIELDS } from '../../services/inference/runtimeConfiguration.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getInferenceStatus, testInferenceConfiguration } from '../../services/inference/status.js';
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
  it.each(['false', 'true'])('includes assistant permission %s in loaded and tested status', async enabled => {
    vi.stubEnv('INFERENCE_AI_ENABLED', 'true');
    vi.stubEnv('INFERENCE_ASSISTANT_ENABLED', enabled);
    const status = { state: 'ready', ready: true, capabilities: {
      assistant: { configured: true, available: true, provider: 'openai-compatible', model: 'gpt-4o-mini' }
    } };
    getInferenceStatus.mockResolvedValue(status);
    testInferenceConfiguration.mockResolvedValue(status);
    const auth = authorization(admin);
    const read = await request(app).get('/api/setting/inference').set('Authorization', auth);
    expect(read.status).toBe(200);
    expect(read.body.status.permissions.assistant).toBe(enabled === 'true');
    expect(read.body.status.capabilities.assistant).toEqual(status.capabilities.assistant);
    for (const input of [{}, { baseUrl: 'http://inference', apiKeyAction: 'remove' }]) {
      const probe = await request(app).post('/api/setting/inference/test').set('Authorization', auth).send(input);
      expect(probe.status).toBe(200);
      expect(probe.body.permissions.assistant).toBe(enabled === 'true');
    }
  });
  it('rejects writes and clears when the environment owns the connection', async () => {
    vi.stubEnv('INFERENCE_BASE_URL', 'http://deployment');
    for (const method of ['put', 'delete']) {
      const response = await request(app)[method]('/api/setting/inference').set('Authorization', authorization(admin)).send({ baseUrl: 'http://other', apiKeyAction: 'remove' });
      expect(response.status).toBe(409);
    }
  });
});

describe('inference runtime settings API', () => {
  it.each(['get', 'put', 'delete'])('requires administrator authorization for %s', async method => {
    const response = await request(app)[method]('/api/setting/inference/runtime').set('Authorization', authorization(user));
    expect(response.status).toBe(403);
  });
  it('overrides environment-managed deployments, reports permissions, and restores defaults', async () => {
    vi.stubEnv('INFERENCE_BASE_URL', 'http://environment.example');
    vi.stubEnv('INFERENCE_AI_ENABLED', 'true');
    const auth = authorization(admin);
    const values = Object.fromEntries(INFERENCE_RUNTIME_FIELDS.map(field => [field.key, field.defaultValue]));
    values.INFERENCE_AI_ENABLED = false;
    expect((await request(app).put('/api/setting/inference/runtime').set('Authorization', auth).send({ overridden: true, values })).status).toBe(200);
    const read = await request(app).get('/api/setting/inference/runtime').set('Authorization', auth);
    expect(read.body.overridden).toBe(true);
    expect(read.body.fields).toHaveLength(9);
    const status = await request(app).get('/api/setting/inference').set('Authorization', auth);
    expect(status.body.status.permissions).toEqual({ embeddings: false, generation: false, classification: false, assistant: false });
    expect((await db.InferenceSetting.findByPk(1)).runtimeOverrides).toEqual(values);
    expect((await request(app).delete('/api/setting/inference/runtime').set('Authorization', auth)).body.overridden).toBe(false);
    expect((await request(app).get('/api/setting/inference').set('Authorization', auth)).body.status.permissions.embeddings).toBe(true);
  });
  it('returns validation errors and never includes saved credentials', async () => {
    const auth = authorization(admin);
    await request(app).put('/api/setting/inference').set('Authorization', auth).send({ baseUrl: 'http://saved.example', apiKeyAction: 'replace', apiKey: 'private-runtime-test' });
    expect((await request(app).put('/api/setting/inference/runtime').set('Authorization', auth).send({ overridden: true, values: {} })).status).toBe(400);
    const read = await request(app).get('/api/setting/inference/runtime').set('Authorization', auth);
    const ciphertext = (await db.InferenceSetting.unscoped().findByPk(1)).apiKeyEncrypted;
    expect(JSON.stringify(read.body)).not.toContain('private-runtime-test');
    expect(JSON.stringify(read.body)).not.toContain(ciphertext);
  });
});
