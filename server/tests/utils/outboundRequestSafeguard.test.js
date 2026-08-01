import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchWithOutboundRequestSafeguard } from '../../utils/outboundRequestSafeguard.js';

// Creates the minimal fetch response contract needed by redirect handling.
function response(status, location, cancel = vi.fn()) {
  return {
    status,
    headers: { get: vi.fn(name => name === 'location' ? location : null) },
    body: { cancel }
  };
}

describe('fetchWithOutboundRequestSafeguard', () => {
  // Clears internal-destination exceptions after each policy scenario.
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // Rejects malformed, unsupported, credentialed, and private literal destinations before fetch.
  it.each([
    ['not a URL', 'the URL is invalid'],
    ['file:///tmp/feed.xml', 'only HTTP and HTTPS'],
    ['https://alice:secret@example.com/feed', 'URL credentials'],
    ['http://127.0.0.1/feed', 'not publicly routable'],
    ['http://[::1]/feed', 'not publicly routable']
  ])('blocks unsafe URL %s', async (url, message) => {
    const fetchImplementation = vi.fn();

    await expect(fetchWithOutboundRequestSafeguard(url, {}, 2, fetchImplementation))
      .rejects.toMatchObject({ code: 'SSRF_BLOCKED', message: expect.stringContaining(message) });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  // Supports global, host-port, IPv6, and CIDR exceptions for intentional internal targets.
  it.each([
    ['*', 'http://127.0.0.1/feed'],
    ['127.0.0.1:8080', 'http://127.0.0.1:8080/feed'],
    ['[::1]:8080', 'http://[::1]:8080/feed'],
    ['127.0.0.0/8', 'http://127.0.0.2/feed']
  ])('allows internal URL %s through exception %s', async (allowlist, url) => {
    vi.stubEnv('RSSMONSTER_INTERNAL_HOST_ALLOWLIST', allowlist);
    const terminalResponse = response(200);
    const fetchImplementation = vi.fn().mockResolvedValue(terminalResponse);

    await expect(fetchWithOutboundRequestSafeguard(url, {}, 2, fetchImplementation))
      .resolves.toBe(terminalResponse);
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  // Rejects malformed allowlist entries instead of silently widening network access.
  it.each([
    '[::1',
    'localhost:not-a-port',
    'localhost:0',
    '127.0.0.1/33',
    'not-an-address/8'
  ])('rejects invalid internal-host exception %s', async allowlist => {
    vi.stubEnv('RSSMONSTER_INTERNAL_HOST_ALLOWLIST', allowlist);

    await expect(fetchWithOutboundRequestSafeguard('http://127.0.0.1/feed', {}, 2, vi.fn()))
      .rejects.toThrow('RSSMONSTER_INTERNAL_HOST_ALLOWLIST contains an invalid');
  });

  // Follows relative redirects manually while cancelling discarded response bodies.
  it('validates and follows each redirect hop', async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const redirected = response(302, '/next', cancel);
    const terminal = response(204);
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce(redirected)
      .mockResolvedValueOnce(terminal);

    const result = await fetchWithOutboundRequestSafeguard(
      'https://example.com/start',
      { headers: { accept: 'application/rss+xml' } },
      2,
      fetchImplementation
    );

    expect(result).toBe(terminal);
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchImplementation.mock.calls[1][0].href).toBe('https://example.com/next');
    expect(fetchImplementation.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  // Returns redirect responses that do not provide a next location.
  it('returns a redirect response without a location header', async () => {
    const redirect = response(301, null);

    await expect(fetchWithOutboundRequestSafeguard(
      'https://example.com/start', {}, 2, vi.fn().mockResolvedValue(redirect)
    )).resolves.toBe(redirect);
  });

  // Enforces redirect limits even when response-body cancellation itself fails.
  it('blocks excessive redirects after best-effort cancellation', async () => {
    const cancel = vi.fn().mockRejectedValue(new Error('already closed'));
    const redirect = response(308, '/again', cancel);

    await expect(fetchWithOutboundRequestSafeguard(
      'https://example.com/start', {}, 0, vi.fn().mockResolvedValue(redirect)
    )).rejects.toMatchObject({ code: 'SSRF_BLOCKED', message: expect.stringContaining('redirect limit') });
    expect(cancel).toHaveBeenCalledOnce();
  });

  // Rejects a malformed redirect target after cancelling its response body.
  it('blocks invalid redirect URLs', async () => {
    const cancel = vi.fn();
    const redirect = response(307, 'http://[', cancel);

    await expect(fetchWithOutboundRequestSafeguard(
      'https://example.com/start', {}, 2, vi.fn().mockResolvedValue(redirect)
    )).rejects.toMatchObject({ code: 'SSRF_BLOCKED', message: expect.stringContaining('redirect URL is invalid') });
    expect(cancel).toHaveBeenCalledOnce();
  });

  // Restores nested SSRF errors while leaving unrelated fetch errors unchanged.
  it.each([
    [Object.assign(new Error('blocked'), { code: 'SSRF_BLOCKED' }), 'SSRF_BLOCKED'],
    [new TypeError('fetch failed', { cause: Object.assign(new Error('blocked'), { code: 'SSRF_BLOCKED' }) }), 'SSRF_BLOCKED'],
    [new Error('network failed'), undefined]
  ])('unwraps fetch rejection %#', async (error, expectedCode) => {
    const promise = fetchWithOutboundRequestSafeguard(
      'https://example.com/feed', {}, 2, vi.fn().mockRejectedValue(error)
    );

    if (expectedCode) {
      await expect(promise).rejects.toMatchObject({ code: expectedCode });
    } else {
      await expect(promise).rejects.toBe(error);
    }
  });
});
