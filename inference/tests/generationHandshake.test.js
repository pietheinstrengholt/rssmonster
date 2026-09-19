import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkGenerationHandshake } from '../src/generationHandshake.js';

const environment = {
  INFERENCE_DEBUG: 'true',
  GENERATION_PROVIDER: 'openai-compatible',
  GENERATION_BASE_URL: 'http://ollama.example:11434/v1',
  GENERATION_MODEL: 'qwen3:0.6b',
  GENERATION_API_KEY: 'private-test-key'
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('development generation handshake', () => {
  it('logs success when the authenticated endpoint lists the configured model', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: [{ id: 'qwen3:0.6b' }] }));
    vi.stubGlobal('fetch', fetch);
    const logger = { log: vi.fn(), warn: vi.fn() };

    await checkGenerationHandshake({ environment, logger });

    const [url, options] = fetch.mock.calls[0];
    expect(String(url)).toBe('http://ollama.example:11434/v1/models');
    expect(new Headers(options.headers).get('authorization')).toBe('Bearer private-test-key');
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('handshake succeeded'));
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
    await checkGenerationHandshake({ environment, logger });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining(message));
    expect(logger.log).not.toHaveBeenCalledWith(expect.stringContaining('succeeded'));
  });

  it('reports HTTP failures without exposing provider response content or retrying', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ error: { message: 'private-test-key' } }, { status: 401 }));
    vi.stubGlobal('fetch', fetch);
    const logger = { log: vi.fn(), warn: vi.fn() };
    await expect(checkGenerationHandshake({ environment, logger })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('failed'), expect.objectContaining({ status: 401 }));
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('private-test-key');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('reports unreachable endpoints without rejecting startup or retrying', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('connection failed', { cause: { code: 'ECONNREFUSED' } }));
    vi.stubGlobal('fetch', fetch);
    const logger = { log: vi.fn(), warn: vi.fn() };
    await expect(checkGenerationHandshake({ environment, logger })).resolves.toBeUndefined();
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
    const handshake = checkGenerationHandshake({ environment, logger });
    await vi.advanceTimersByTimeAsync(5000);
    await handshake;
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('failed'), expect.objectContaining({ code: 'ETIMEDOUT' }));
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    { INFERENCE_DEBUG: 'false' },
    { GENERATION_PROVIDER: 'local' }
  ])('skips requests outside remote development diagnostics', async overrides => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const logger = { log: vi.fn(), warn: vi.fn() };
    await checkGenerationHandshake({ environment: { ...environment, ...overrides }, logger });
    expect(fetch).not.toHaveBeenCalled();
    expect(logger.log).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
