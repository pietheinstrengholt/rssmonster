import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAI } from '../../services/ai/registry.js';
import { createAIHealth } from '../../services/ai/health.js';
import { validateInferenceCapabilities } from '../../services/ai/capabilities.js';
import { resetInferenceCircuitBreakerForTests, getInferenceCircuitSnapshot } from '../../services/inference/inferenceClient.js';
import { inferenceCapabilities } from './fixtures/inferenceCapabilities.js';

beforeEach(() => {
  vi.stubEnv('INFERENCE_AI_ENABLED', 'true');
  vi.stubEnv('INFERENCE_CIRCUIT_FAILURE_THRESHOLD', '1');
  resetInferenceCircuitBreakerForTests();
});
afterEach(() => vi.unstubAllEnvs());

describe('versioned capability consumer', () => {
  it('retrieves a validated contract through the adapter and preserves request options', async () => {
    const fetchImplementation = vi.fn(async () => new Response(JSON.stringify(inferenceCapabilities())));
    const result = await createAI().getCapabilities({ fetchImplementation, requestId: 'discovery-request', timeoutMs: 100 });
    expect(result).toEqual(inferenceCapabilities());
    expect(fetchImplementation.mock.calls[0][0]).toMatch(/\/api\/capabilities$/);
    expect(fetchImplementation.mock.calls[0][1]).toMatchObject({ method: 'GET', headers: { 'X-Request-ID': 'discovery-request' } });
  });
  it('preserves disabled and temporarily unavailable capability states', () => {
    const response = inferenceCapabilities();
    response.capabilities.assistant = { configured: false, available: false, provider: null, model: null };
    response.capabilities.generation.available = false;
    expect(validateInferenceCapabilities(response)).toEqual(response);
  });
  it('ignores unknown additive fields and capabilities without forwarding them', () => {
    const response = inferenceCapabilities();
    response.private = 'secret';
    response.capabilities.future = { arbitrary: 'secret' };
    response.capabilities.embeddings.endpoint = 'secret';
    expect(validateInferenceCapabilities(response)).toEqual(inferenceCapabilities());
  });
  it.each([
    () => null, value => { delete value.apiVersion; return value; },
    value => ({ ...value, apiVersion: 1 }), value => ({ ...value, capabilities: [] }),
    value => ({ ...value, service: 'other' }), value => ({ ...value, version: 'https://secret' }),
    value => ({ ...value, status: 'secret' }),
    value => { delete value.capabilities.assistant; return value; },
    value => { value.capabilities.embeddings.dimensions = 0; return value; },
    value => { delete value.capabilities.embeddings.dimensions; return value; },
    value => { value.capabilities.generation.configured = 'true'; return value; },
    value => { value.capabilities.generation.available = 1; return value; },
    value => { value.capabilities.generation.provider = 'openai'; return value; },
    value => { value.capabilities.generation.model = ''; return value; },
    value => { value.capabilities.generation.model = 'https://secret'; return value; },
    value => { value.capabilities.assistant.configured = false; return value; },
    value => ({ ...value, status: 'starting' })
  ])('rejects invalid shapes and inconsistent states with safe errors', mutate => {
    const response = mutate(inferenceCapabilities());
    expect(() => validateInferenceCapabilities(response)).toThrow(expect.objectContaining({ code: 'INFERENCE_CONTRACT_INVALID' }));
  });
  it('rejects unsupported versions distinctly', () => {
    expect(() => validateInferenceCapabilities({ ...inferenceCapabilities(), apiVersion: '999' }))
      .toThrow(expect.objectContaining({ code: 'INFERENCE_CONTRACT_VERSION_UNSUPPORTED' }));
  });
  it('does not contact inference when globally disabled', async () => {
    vi.stubEnv('INFERENCE_AI_ENABLED', 'false');
    const fetchImplementation = vi.fn();
    await expect(createAI().getCapabilities({ fetchImplementation })).rejects.toMatchObject({ code: 'INFERENCE_DISABLED' });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
  it('propagates transport failures and isolates the discovery circuit', async () => {
    const fetchImplementation = vi.fn().mockRejectedValue(new Error('private-url'));
    await expect(createAI().getCapabilities({ fetchImplementation })).rejects.toMatchObject({ code: 'INFERENCE_UNAVAILABLE' });
    await expect(createAI().getCapabilities({ fetchImplementation })).rejects.toMatchObject({ code: 'INFERENCE_CIRCUIT_OPEN' });
    expect(fetchImplementation).toHaveBeenCalledOnce();
    expect(getInferenceCircuitSnapshot('embeddings')).toBeNull();
  });
  it('preserves timeouts and caller cancellation', async () => {
    const fetchImplementation = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    await expect(createAI().getCapabilities({ fetchImplementation, timeoutMs: 10 })).rejects.toMatchObject({ code: 'INFERENCE_TIMEOUT', timeoutMs: 10 });
    resetInferenceCircuitBreakerForTests();
    const controller = new AbortController();
    const pending = createAI().getCapabilities({ fetchImplementation, signal: controller.signal });
    const reason = new Error('cancelled');
    const rejection = expect(pending).rejects.toBe(reason);
    controller.abort(reason);
    await rejection;
  });
  it('keeps malformed JSON transport errors safe', async () => {
    await expect(createAI().getCapabilities({ fetchImplementation: async () => new Response('private-invalid-json') }))
      .rejects.toThrow('Inference response is not valid JSON');
  });
  it('never derives remote availability from server permission flags or readiness alone', async () => {
    const response = inferenceCapabilities();
    response.capabilities.embeddings.available = false;
    const inference = {
      getCapabilities: vi.fn().mockResolvedValue(response),
      getHealth: async () => ({ ok: true, body: { status: 'ok' } }),
      getReadiness: async () => ({ ok: true, body: { state: 'ready', acceptingWork: true } })
    };
    const health = createAIHealth(inference, { INFERENCE_AI_ENABLED: 'true', INFERENCE_ASSISTANT_ENABLED: 'true' });
    expect(await health()).toMatchObject({ ready: true, capabilities: { embeddings: false, generation: true, assistant: true } });
    inference.getCapabilities.mockRejectedValue(new Error('private-error'));
    const result = await health();
    expect(Object.values(result.capabilities).every(value => value === false)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private-error');
  });
});
