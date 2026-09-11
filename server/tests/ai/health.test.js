import { describe, expect, it, vi } from 'vitest';
import { createAIHealth } from '../../services/ai/health.js';
import { getAIPermissions, getAIOperations } from '../../services/ai/capabilities.js';

import { inferenceCapabilities } from './fixtures/inferenceCapabilities.js';

const enabled = { INFERENCE_AI_ENABLED: 'true', INFERENCE_ASSISTANT_ENABLED: 'false' };
const provider = () => ({
  getCapabilities: vi.fn().mockImplementation(async () => inferenceCapabilities()),
  getHealth: vi.fn().mockResolvedValue({ ok: true, body: { status: 'ok' } }),
  getReadiness: vi.fn().mockResolvedValue({ ok: true, body: { state: 'ready', acceptingWork: true } })
});

describe('AI configuration and observed health', () => {
  it('distinguishes capability permission from article-specific skips', () => {
    const environment = { ...enabled, SKIP_ARTICLE_EMBEDDINGS: 'true', SKIP_SEMANTIC_LABELING: 'true' };
    expect(getAIPermissions(environment)).toEqual({ embeddings: true, generation: true, classification: true, assistant: false });
    expect(getAIOperations(environment)).toEqual({ articleEmbeddings: false, articleClassification: true, semanticLabels: false });
    expect(getAIPermissions({ ...enabled, INFERENCE_ASSISTANT_ENABLED: 'true' }).assistant).toBe(true);
    expect(getAIPermissions({ INFERENCE_AI_ENABLED: 'false', INFERENCE_ASSISTANT_ENABLED: 'true' }))
      .toEqual({ embeddings: false, generation: false, classification: false, assistant: false });
  });
  it('does not contact disabled inference', async () => {
    const inference = provider();
    const result = await createAIHealth(inference, { INFERENCE_AI_ENABLED: 'false' })();
    expect(result).toMatchObject({ enabled: false, reachable: null, ready: false, state: 'disabled' });
    expect(inference.getHealth).not.toHaveBeenCalled();
    expect(inference.getReadiness).not.toHaveBeenCalled();
  });
  it('combines discovery and both health endpoints with readiness and independent configured capabilities', async () => {
    const inference = provider();
    const options = { signal: new AbortController().signal, requestId: 'health-request' };
    const result = await createAIHealth(inference, enabled)(options);
    expect(result).toMatchObject({ reachable: true, ready: true, state: 'ready', capabilities: { embeddings: true, assistant: false } });
    expect(inference.getHealth).toHaveBeenCalledWith({ timeoutMs: 3000, ...options });
    expect(inference.getReadiness).toHaveBeenCalledWith({ timeoutMs: 3000, ...options });
  });
  it('reports reachable but unavailable models during startup', async () => {
    const inference = provider();
    inference.getReadiness.mockResolvedValue({ ok: false, status: 503, body: { state: 'starting', acceptingWork: false } });
    const result = await createAIHealth(inference, enabled)();
    expect(result).toMatchObject({ reachable: true, ready: false, state: 'starting', configured: { embeddings: true }, capabilities: { embeddings: false } });
  });
  it('does not infer readiness from a successful response with malformed body', async () => {
    const inference = provider();
    inference.getReadiness.mockResolvedValue({ ok: true, body: { state: 'secret-invalid-state' } });
    const result = await createAIHealth(inference, enabled)();
    expect(result).toMatchObject({ ready: false, state: 'unknown' });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('isolates readiness errors and does not leak endpoint credentials', async () => {
    const inference = provider();
    inference.getReadiness.mockRejectedValue(new Error('https://private/?token=secret'));
    expect(await createAIHealth(inference, enabled)()).toMatchObject({ reachable: true, ready: false });
    inference.getHealth.mockRejectedValue(new Error('secret'));
    const result = await createAIHealth(inference, enabled)();
    expect(result).toMatchObject({ reachable: false, ready: false });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('reports unknown reachability when circuits prevented both probes', async () => {
    const inference = provider();
    const error = Object.assign(new Error('circuit open'), { code: 'INFERENCE_CIRCUIT_OPEN' });
    inference.getHealth.mockRejectedValue(error);
    inference.getReadiness.mockRejectedValue(error);
    expect(await createAIHealth(inference, enabled)()).toMatchObject({ reachable: null, ready: false });
  });

});
