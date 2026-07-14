import { describe, expect, it, vi } from 'vitest';

const fetchURL = vi.fn();

vi.mock('../../utils/fetchURL.js', () => ({
  fetchURL
}));

const { process } = await import('../../services/feeds/parser.js');

describe('feed parser', () => {
  it('preserves feed fetch errors instead of relabeling them as parse errors', async () => {
    fetchURL.mockResolvedValue({
      ok: false,
      status: 429
    });

    await expect(process('https://www.reddit.com/.rss')).rejects.toMatchObject({
      code: 'FEED_FETCH_ERROR',
      message: 'Feed fetch failed (HTTP 429)'
    });
  });

  it('preserves invalid URL errors', async () => {
    await expect(process()).rejects.toMatchObject({
      code: 'INVALID_FEED_URL',
      message: 'Missing feed URL'
    });
  });
});
