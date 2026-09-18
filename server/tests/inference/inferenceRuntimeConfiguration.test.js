import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import db from '../../models/index.js';
import { INFERENCE_RUNTIME_FIELDS, getInferenceRuntimeSettings, saveInferenceRuntimeSettings, clearInferenceRuntimeSettings, getInferenceEnvironment, withInferenceRuntimeSettings } from '../../services/inference/runtimeConfiguration.js';
import { getEffectiveInferenceConfiguration, saveInferenceConfiguration, clearInferenceConfiguration } from '../../services/inference/configuration.js';
import { requestInferenceJson, requestInferenceStream, getInferenceCircuitSnapshot, resetInferenceCircuitBreakerForTests } from '../../services/inference/inferenceClient.js';
import { isInferenceEnabled, isAssistantEnabled } from '../../config/intelligentFeatures.js';
import analyzeArticleContent from '../../services/crawl/enrichment/analyzeArticleContent.js';
import { embedArticle } from '../../services/articles/embedArticle.js';
import { populateGeneratedSemanticLabelsForUser } from '../../services/semanticLabels/semanticLabeling.js';

const defaults = () => Object.fromEntries(INFERENCE_RUNTIME_FIELDS.map(field => [field.key, field.defaultValue]));
const save = values => saveInferenceRuntimeSettings({ overridden: true, values: { ...defaults(), ...values } });
beforeEach(async () => {
  await db.InferenceSetting.destroy({ where: {} });
  resetInferenceCircuitBreakerForTests();
  vi.stubEnv('INFERENCE_BASE_URL', 'http://inference.example');
  vi.stubEnv('INFERENCE_AI_ENABLED', 'true');
  vi.stubEnv('INFERENCE_ASSISTANT_ENABLED', 'true');
});
afterEach(async () => { await db.InferenceSetting.destroy({ where: {} }); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('inference runtime overrides', () => {
  it('stores all nine values only in inference_settings and restores current environment values', async () => {
    const serverRows = await db.ServerSetting.count();
    vi.stubEnv('INFERENCE_TIMEOUT_MS', '17000');
    expect((await getInferenceRuntimeSettings()).overridden).toBe(false);
    const values = { ...defaults(), INFERENCE_TIMEOUT_MS: 9000, INFERENCE_AI_ENABLED: false };
    await save(values);
    expect((await db.InferenceSetting.findByPk(1)).runtimeOverrides).toEqual(values);
    expect(await db.ServerSetting.count()).toBe(serverRows);
    expect(await getInferenceEnvironment()).toMatchObject({ INFERENCE_TIMEOUT_MS: '9000', INFERENCE_AI_ENABLED: 'false' });
    expect(process.env.INFERENCE_TIMEOUT_MS).toBe('17000');
    await clearInferenceRuntimeSettings();
    expect(await getInferenceEnvironment()).toMatchObject({ INFERENCE_TIMEOUT_MS: '17000', INFERENCE_AI_ENABLED: 'true' });
    expect((await getInferenceRuntimeSettings()).overridden).toBe(false);
  });

  it('supports a settings-only row and preserves settings and credentials across independent updates', async () => {
    vi.stubEnv('INFERENCE_BASE_URL', ''); vi.stubEnv('INFERENCE_URL', '');
    await save({ INFERENCE_TIMEOUT_MS: 12000 });
    expect((await getEffectiveInferenceConfiguration()).source).toBe('none');
    await saveInferenceConfiguration({ baseUrl: 'http://saved.example', apiKeyAction: 'replace', apiKey: 'private-key' });
    expect((await getInferenceEnvironment()).INFERENCE_TIMEOUT_MS).toBe('12000');
    await save({ INFERENCE_TIMEOUT_MS: 13000 });
    expect((await getEffectiveInferenceConfiguration()).apiKey).toBe('private-key');
    await clearInferenceRuntimeSettings();
    expect((await getEffectiveInferenceConfiguration()).apiKey).toBe('private-key');
    await save({ INFERENCE_TIMEOUT_MS: 14000 });
    await clearInferenceConfiguration();
    expect((await getEffectiveInferenceConfiguration()).source).toBe('none');
    expect((await getInferenceEnvironment()).INFERENCE_TIMEOUT_MS).toBe('14000');
  });

  it.each([0, -1, 1.5, '30000', null, 2147483648])('rejects invalid numeric override %j without changing the saved value', async value => {
    await save({ INFERENCE_TIMEOUT_MS: 12000 });
    await expect(save({ INFERENCE_TIMEOUT_MS: value })).rejects.toMatchObject({ status: 400 });
    expect((await getInferenceEnvironment()).INFERENCE_TIMEOUT_MS).toBe('12000');
  });
  it('rejects partial, unknown, and non-boolean inputs', async () => {
    await expect(saveInferenceRuntimeSettings({ overridden: true, values: { INFERENCE_TIMEOUT_MS: 1000 } })).rejects.toThrow();
    await expect(save({ unexpected: 1 })).rejects.toThrow();
    await expect(save({ SKIP_ARTICLE_EMBEDDINGS: 'false' })).rejects.toThrow();
    await expect(save({ SKIP_SEMANTIC_LABELING: null })).rejects.toThrow();
    await expect(saveInferenceRuntimeSettings({ overridden: false, values: defaults() })).rejects.toThrow();
  });
  it('overrides disabled environment permissions and supports automatic permission', async () => {
    vi.stubEnv('INFERENCE_AI_ENABLED', 'false'); vi.stubEnv('INFERENCE_ASSISTANT_ENABLED', 'false');
    await save({ INFERENCE_AI_ENABLED: true, INFERENCE_ASSISTANT_ENABLED: true });
    expect(isAssistantEnabled(await getInferenceEnvironment())).toBe(true);
    await save({ INFERENCE_AI_ENABLED: null, INFERENCE_ASSISTANT_ENABLED: null });
    expect(isAssistantEnabled(await getInferenceEnvironment())).toBe(true);
    await save({ INFERENCE_AI_ENABLED: false, INFERENCE_ASSISTANT_ENABLED: true });
    expect(isInferenceEnabled(await getInferenceEnvironment())).toBe(false);
    const fetchImplementation = vi.fn();
    await expect(requestInferenceJson('/api/embeddings', {}, { fetchImplementation })).rejects.toMatchObject({ code: 'INFERENCE_DISABLED' });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
  it('uses saved request and assistant deadlines and blocks disabled streaming assistants', async () => {
    const timeouts = vi.spyOn(AbortSignal, 'timeout');
    const fetchImplementation = vi.fn(async () => new Response('{}'));
    await save({ INFERENCE_TIMEOUT_MS: 12345, INFERENCE_AGENT_TIMEOUT_MS: 54321 });
    await requestInferenceJson('/api/embeddings', {}, { fetchImplementation });
    expect(timeouts).toHaveBeenLastCalledWith(12345);
    await requestInferenceJson('/api/assistant/model', {}, { circuitKey: 'assistant', fetchImplementation });
    expect(timeouts).toHaveBeenLastCalledWith(54321);
    const streamFetch = vi.fn(async () => new Response('{"type":"done"}\n'));
    for await (const event of requestInferenceStream('/api/assistant/model/stream', {}, { circuitKey: 'assistant', fetchImplementation: streamFetch })) expect(event.type).toBe('done');
    expect(timeouts).toHaveBeenLastCalledWith(54321);
    await save({ INFERENCE_ASSISTANT_ENABLED: false });
    await expect(requestInferenceStream('/api/assistant/model/stream', {}, { circuitKey: 'assistant', fetchImplementation }).next()).rejects.toMatchObject({ code: 'INFERENCE_DISABLED' });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
  });
  it('applies changed circuit thresholds and cooldowns to existing capability circuits', async () => {
    const options = { circuitKey: 'embeddings', logger: { warn() {} }, fetchImplementation: async () => { throw new Error('unavailable'); } };
    await save({ INFERENCE_CIRCUIT_FAILURE_THRESHOLD: 2, INFERENCE_CIRCUIT_COOLDOWN_MS: 45000 });
    await expect(requestInferenceJson('/api/embeddings', {}, options)).rejects.toMatchObject({ code: 'INFERENCE_UNAVAILABLE' });
    expect(getInferenceCircuitSnapshot('embeddings').state).toBe('closed');
    await expect(requestInferenceJson('/api/embeddings', {}, options)).rejects.toMatchObject({ code: 'INFERENCE_UNAVAILABLE' });
    const circuit = getInferenceCircuitSnapshot('embeddings');
    expect(circuit.state).toBe('open');
    expect(circuit.retryAt - circuit.openedAt).toBe(45000);
    await save({ INFERENCE_CIRCUIT_FAILURE_THRESHOLD: 1, INFERENCE_CIRCUIT_COOLDOWN_MS: 1000 });
    await expect(requestInferenceJson('/api/embeddings', {}, options)).rejects.toMatchObject({ code: 'INFERENCE_UNAVAILABLE' });
    expect(getInferenceCircuitSnapshot('embeddings').consecutiveFailures).toBe(1);
  });
  it('skips article classification, embedding, and labels without contacting inference', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not call inference'));
    await save({ SKIP_ARTICLE_CLASSIFICATION_ANALYSIS: true, SKIP_ARTICLE_EMBEDDINGS: true, SKIP_SEMANTIC_LABELING: true });
    expect(await analyzeArticleContent({ text: 'Article content' })).toMatchObject({ tags: [], contentSummaryBullets: [] });
    expect(await embedArticle({ title: 'An article', contentText: 'Article content' })).toBeNull();
    expect(await populateGeneratedSemanticLabelsForUser(1, { eventIds: [1] })).toMatchObject({ eventCount: 0, islandCount: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('keeps a batch snapshot isolated and reads changes in the next batch', async () => {
    await save({ INFERENCE_TIMEOUT_MS: 1000 });
    await withInferenceRuntimeSettings(async () => {
      expect((await getInferenceEnvironment()).INFERENCE_TIMEOUT_MS).toBe('1000');
      await save({ INFERENCE_TIMEOUT_MS: 2000 });
      expect((await getInferenceEnvironment()).INFERENCE_TIMEOUT_MS).toBe('1000');
    });
    expect((await getInferenceEnvironment()).INFERENCE_TIMEOUT_MS).toBe('2000');
  });
});
