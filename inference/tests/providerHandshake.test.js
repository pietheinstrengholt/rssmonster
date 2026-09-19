import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkAssistantHandshake, checkGenerationHandshake } from '../src/providerHandshake.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe.each([
  ['GENERATION', checkGenerationHandshake, 'Generation'],
  ['ASSISTANT', checkAssistantHandshake, 'Assistant']
])('development %s handshake', (capability, checkHandshake, label) => {
  const environment = {
    INFERENCE_DEBUG: 'true',
    GENERATION_PROVIDER: 'openai-compatible',
    GENERATION_BASE_URL: 'http://generation.example/v1',
    GENERATION_MODEL: 'different-model',
    GENERATION_API_KEY: 'different-key',
    [`${capability}_PROVIDER`]: 'openai-compatible',
    [`${capability}_BASE_URL`]: 'http://ollama.example:11434/v1',
    [`${capability}_MODEL`]: 'qwen3:0.6b',
    [`${capability}_API_KEY`]: 'private-test-key'
  };

  it('logs success when the authenticated endpoint lists the configured model', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: [{ id: 'qwen3:0.6b' }] }));
    vi.stubGlobal('fetch', fetch);
    const logger = { log: vi.fn(), warn: vi.fn() };

    await checkHandshake({ environment, logger });

    const [url, options] = fetch.mock.calls[0];
    expect(String(url)).toBe('http://ollama.example:11434/v1/models');
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer private-test-key');
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining(`${label} handshake succeeded`));
    expect(logger.warn).not.toHaveBeenCalled();
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain('private-test-key');
  });

  it.each([
    [{ data: [] }, 'was not listed'],
    [{ unexpected: true }, 'was not listed'],
    [{ data: {} }, 'invalid model-list response']
  ])('warns when a response does not confirm model availability', async (body, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body)));
    const logger = { log: vi.fn(), warn: vi.fn() };
    await checkHandshake({ environment, logger });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(message));
    expect(logger.log).not.toHaveBeenCalledWith(expect.stringContaining('succeeded'));
  });

  it('reports HTTP failures without exposing provider response content or retrying', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: { message: 'private-test-key' } }, { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    const logger = { log: vi.fn(), warn: vi.fn() };
    await expect(checkHandshake({ environment, logger })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('failed'), expect.objectContaining({ status: 401 }));
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('private-test-key');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('reports unreachable endpoints without rejecting startup or retrying', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('connection failed', { cause: { code: 'ECONNREFUSED' } }));
    vi.stubGlobal('fetch', fetch);
    const logger = { log: vi.fn(), warn: vi.fn() };
    await expect(checkHandshake({ environment, logger })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('failed'), expect.any(Object));
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('stops after five seconds and reports a timeout without retrying', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    vi.stubGlobal('fetch', fetch);
    const logger = { log: vi.fn(), warn: vi.fn() };
    const handshake = checkHandshake({ environment, logger });
    await vi.advanceTimersByTimeAsync(5000);
    await handshake;
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('failed'), expect.objectContaining({ code: 'ETIMEDOUT' }));
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    { INFERENCE_DEBUG: 'false' },
    ...(capability === 'GENERATION' ? [{ GENERATION_PROVIDER: 'local' }] : [])
  ])('skips requests outside remote development diagnostics', async overrides => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const logger = { log: vi.fn(), warn: vi.fn() };
    await checkHandshake({ environment: { ...environment, ...overrides }, logger });
    expect(fetch).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});


describe('optional assistant handshake', () => {
  it('uses legacy assistant credentials and the default assistant model', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: [{ id: 'gpt-4o-mini' }] }));
    vi.stubGlobal('fetch', fetch);
    const logger = { log: vi.fn(), warn: vi.fn() };
    await checkAssistantHandshake({
      environment: {
        INFERENCE_DEBUG: 'true', OPENAI_API_KEY: 'legacy-key',
        OPENAI_BASE_URL: 'http://legacy.example/v1'
      }, logger
    });
    const [url, options] = fetch.mock.calls[0];
    expect(String(url)).toBe('http://legacy.example/v1/models');
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer legacy-key');
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('Assistant handshake succeeded'));
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('skips an unconfigured assistant even when generation has credentials', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const logger = { log: vi.fn(), warn: vi.fn() };
    await checkAssistantHandshake({
      environment: { INFERENCE_DEBUG: 'true', GENERATION_API_KEY: 'generation-key' }, logger
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('warns when explicitly configured assistant credentials are missing', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const logger = { log: vi.fn(), warn: vi.fn() };
    await checkAssistantHandshake({
      environment: {
        INFERENCE_DEBUG: 'true', ASSISTANT_PROVIDER: 'openai-compatible',
        ASSISTANT_BASE_URL: 'http://ollama.example/v1', ASSISTANT_MODEL: 'qwen3:0.6b'
      }, logger
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Assistant handshake failed'), expect.any(Object));
  });
});
