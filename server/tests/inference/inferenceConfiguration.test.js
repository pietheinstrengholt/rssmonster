import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { getEffectiveInferenceConfiguration, saveInferenceConfiguration, clearInferenceConfiguration,
  getInferenceConfigurationMetadata, serializeInferenceConfiguration } from '../../services/inference/configuration.js';
import { getInferenceStatus, clearInferenceStatus, testInferenceConfiguration } from '../../services/inference/status.js';
import { requestInferenceJson, resetInferenceCircuitBreakerForTests } from '../../services/inference/inferenceClient.js';
import { inferenceCapabilities } from '../ai/fixtures/inferenceCapabilities.js';
const secret = 'test-only stored secret +/=';
beforeEach(async () => {
  vi.stubEnv('INFERENCE_BASE_URL', ''); vi.stubEnv('INFERENCE_URL', ''); vi.stubEnv('INFERENCE_API_KEY', '');
  await db.InferenceSetting.destroy({ where: {} }); clearInferenceStatus(); resetInferenceCircuitBreakerForTests();
});
afterEach(async () => { await db.InferenceSetting.destroy({ where: {} }); vi.unstubAllEnvs(); clearInferenceStatus(); });
const save = (extra = {}) => saveInferenceConfiguration({ baseUrl: 'http://inference.example/', apiKeyAction: 'replace', apiKey: secret, ...extra });

describe('deployment inference configuration', () => {
  it('resolves none, ignores a key alone, and never assumes localhost', async () => {
    vi.stubEnv('INFERENCE_API_KEY', secret);
    expect(await getEffectiveInferenceConfiguration()).toEqual({ source: 'none', baseUrl: null, apiKey: null, configurable: true });
    await expect(requestInferenceJson('/api/test', {})).rejects.toMatchObject({ code: 'INFERENCE_DISABLED' });
  });
  it.each(['keep', 'replace', 'remove'])('probes an unsaved endpoint without authentication using %s', async apiKeyAction => {
    const fetchImplementation = vi.fn(async url => new Response(JSON.stringify(url.endsWith('/ready')
      ? { state: 'ready', acceptingWork: true } : url.endsWith('/health') ? { status: 'ok' } : inferenceCapabilities())));
    const result = await testInferenceConfiguration({ baseUrl: 'http://127.0.0.1:3001/', apiKeyAction,
      ...(apiKeyAction === 'replace' ? { apiKey: '' } : {}) }, { fetchImplementation });
    expect(result.ready).toBe(true);
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    for (const [url, options] of fetchImplementation.mock.calls) {
      expect(url).toMatch(/^http:\/\/127.0.0.1:3001\//);
      expect(options.headers['X-Inference-API-Key']).toBeUndefined();
    }
    expect(await db.InferenceSetting.count()).toBe(0);
    expect((await getInferenceStatus()).state).toBe('not_configured');
  });
  it('keeps the saved configuration and status cache unchanged after a draft probe', async () => {
    await save();
    const fetchImplementation = vi.fn(async url => new Response(JSON.stringify(url.endsWith('/ready')
      ? { state: 'ready', acceptingWork: true } : url.endsWith('/health') ? { status: 'ok' } : inferenceCapabilities())));
    const savedStatus = await getInferenceStatus({ fetchImplementation });
    await testInferenceConfiguration({ baseUrl: 'http://draft.example', apiKeyAction: 'keep' }, { fetchImplementation });
    expect(fetchImplementation.mock.calls[3][1].headers['X-Inference-API-Key']).toBe(secret);
    expect(await getEffectiveInferenceConfiguration()).toMatchObject({ baseUrl: 'http://inference.example', apiKey: secret });
    expect(await getInferenceStatus({ fetchImplementation })).toEqual(savedStatus);
    expect(fetchImplementation).toHaveBeenCalledTimes(6);
  });
  it('stores encrypted global configuration and never serializes its secret', async () => {
    const result = await save();
    expect(result).toEqual({ configurationSource: 'database', configurable: true, baseUrl: 'http://inference.example', apiKeyConfigured: true });
    expect((await getEffectiveInferenceConfiguration()).apiKey).toBe(secret);
    vi.stubEnv('INFERENCE_API_KEY', 'ignored-environment-key');
    expect((await getEffectiveInferenceConfiguration()).apiKey).toBe(secret);
    const row = await db.InferenceSetting.unscoped().findByPk(1);
    expect(row.apiKeyEncrypted).not.toContain(secret);
    expect(row.apiKeyEncrypted).toMatch(/^v1\./);
    expect(JSON.stringify(row)).not.toContain(row.apiKeyEncrypted);
    expect((await db.InferenceSetting.findByPk(1)).apiKeyEncrypted).toBeUndefined();
    expect(await db.InferenceSetting.count()).toBe(1);
    await expect(db.InferenceSetting.create({ id: 2, baseUrl: 'http://other' })).rejects.toThrow();
  });
  it('implements keep, replace, empty replacement, remove and clear without stale state', async () => {
    await save();
    await saveInferenceConfiguration({ baseUrl: 'https://new.example/path/', apiKeyAction: 'keep' });
    expect(await getEffectiveInferenceConfiguration()).toMatchObject({ baseUrl: 'https://new.example/path', apiKey: secret });
    await save({ apiKey: 'replacement' });
    expect((await getEffectiveInferenceConfiguration()).apiKey).toBe('replacement');
    await save({ apiKey: '' });
    expect((await getEffectiveInferenceConfiguration()).apiKey).toBeNull();
    await save();
    await saveInferenceConfiguration({ baseUrl: 'http://inference.example', apiKeyAction: 'remove' });
    expect((await getEffectiveInferenceConfiguration()).apiKey).toBeNull();
    await clearInferenceConfiguration();
    expect((await getEffectiveInferenceConfiguration()).source).toBe('none');
  });
  it.each(['INFERENCE_BASE_URL', 'INFERENCE_URL'])('prioritizes %s and rejects direct writes without reading stale DB credentials', async name => {
    await save();
    await db.InferenceSetting.unscoped().update({ apiKeyEncrypted: 'corrupt' }, { where: { id: 1 } });
    vi.stubEnv(name, 'http://deployment.example');
    expect(await getEffectiveInferenceConfiguration()).toMatchObject({ source: 'environment', apiKey: null, configurable: false });
    vi.stubEnv('INFERENCE_API_KEY', secret);
    expect((await getEffectiveInferenceConfiguration()).apiKey).toBe(secret);
    await expect(save()).rejects.toMatchObject({ status: 409 });
    await expect(clearInferenceConfiguration()).rejects.toMatchObject({ status: 409 });
  });
  it('sanitizes environment URLs and never includes the key in metadata', () => {
    expect(serializeInferenceConfiguration({ source: 'environment', baseUrl: 'https://user:password@example.com/path?token=secret#secret', apiKey: secret, configurable: false }))
      .toEqual({ configurationSource: 'environment', baseUrl: 'https://example.com/path', configurable: false, apiKeyConfigured: true });
  });
  it.each(['file:///tmp/model', 'javascript:alert(1)', 'ftp://host', 'http://user:pass@host', 'https://host?key=secret', 'https://host#fragment', 'invalid'])('rejects unsafe endpoint syntax', async baseUrl => {
    await expect(save({ baseUrl })).rejects.toMatchObject({ code: 'INFERENCE_CONFIGURATION_INVALID' });
  });
  it('rejects tampered ciphertext with a safe error and permits replacing it', async () => {
    await save(); await db.InferenceSetting.unscoped().update({ apiKeyEncrypted: 'bad' }, { where: { id: 1 } });
    await expect(getEffectiveInferenceConfiguration()).rejects.toThrow('Stored inference credentials could not be read');
    expect(await getInferenceConfigurationMetadata()).toMatchObject({ configurable: true, apiKeyConfigured: true });
    await save(); expect((await getEffectiveInferenceConfiguration()).apiKey).toBe(secret);
  });
  it('refreshes capability state and circuits on endpoint/key change', async () => {
    await save();
    const fetchImplementation = vi.fn(async url => new Response(JSON.stringify(url.endsWith('/ready')
      ? { state: 'ready', acceptingWork: true } : url.endsWith('/health') ? { status: 'ok' } : inferenceCapabilities())));
    expect((await getInferenceStatus({ fetchImplementation })).ready).toBe(true);
    await getInferenceStatus({ fetchImplementation }); expect(fetchImplementation).toHaveBeenCalledTimes(3);
    await save({ baseUrl: 'http://new.example', apiKey: 'new-key' });
    await getInferenceStatus({ fetchImplementation }); expect(fetchImplementation).toHaveBeenCalledTimes(6);
    expect(fetchImplementation.mock.calls[3][0]).toContain('http://new.example');
    expect(fetchImplementation.mock.calls[3][1].headers['X-Inference-API-Key']).toBe('new-key');
    await getInferenceStatus({ fetchImplementation, refresh: true }); expect(fetchImplementation).toHaveBeenCalledTimes(9);
    await clearInferenceConfiguration(); expect((await getInferenceStatus()).state).toBe('not_configured');
  });
  it.each([
    ['unauthorized', 401, {}], ['incompatible', 200, { apiVersion: '999' }],
    ['incompatible', 200, {}], ['not_ready', 503, inferenceCapabilities()]
  ])('reports safe %s connection states', async (expected, code, contract) => {
    await save();
    const result = await getInferenceStatus({ fetchImplementation: async url => new Response(JSON.stringify(
      url.endsWith('/api/capabilities') ? contract : { state: 'starting', acceptingWork: false }
    ), { status: url.endsWith('/api/capabilities') && code !== 401 ? 200 : code }) });
    expect(result.state).toBe(expected); expect(JSON.stringify(result)).not.toContain(secret);
  });
  it('reports unavailable endpoints and partial capabilities', async () => {
    await save();
    expect((await getInferenceStatus({ fetchImplementation: async () => { throw new Error(secret); } })).state).toBe('unreachable');
    resetInferenceCircuitBreakerForTests(); clearInferenceStatus();
    const contract = inferenceCapabilities(); contract.capabilities.assistant.available = false;
    expect((await getInferenceStatus({ fetchImplementation: async url => new Response(JSON.stringify(
      url.endsWith('/api/capabilities') ? contract : { state: 'ready', acceptingWork: true }
    )) })).state).toBe('partial');
  });
});
