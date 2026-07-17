import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchURL } from '../../utils/fetchURL.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('fetchURL', () => {
  it('retries a quick transient failure within the same total budget', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const response = { ok: true, url: 'https://example.com/feed' };
    vi.spyOn(global, 'fetch')
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(response);

    const resultPromise = fetchURL('https://example.com/feed', 1, 5000);
    await vi.advanceTimersByTimeAsync(500);

    await expect(resultPromise).resolves.toBe(response);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('does not reset the timeout budget after a timed-out attempt', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 5000);
      const error = new Error('The operation timed out');
      error.name = 'TimeoutError';
      throw error;
    });

    await expect(
      fetchURL('https://example.com/feed', 1, 5000)
    ).rejects.toMatchObject({ name: 'TimeoutError' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the timeout active while the response body is read', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/rss+xml' });
      response.write('<rss>');
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();

    try {
      const response = await fetchURL(
        `http://127.0.0.1:${port}/feed`,
        0,
        200
      );
      await expect(response.text()).rejects.toMatchObject({
        name: 'TimeoutError'
      });
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
});
