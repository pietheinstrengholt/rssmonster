import { describe, expect, it, vi } from 'vitest';

const fetchURL = vi.fn();

vi.mock('../../utils/fetchURL.js', () => ({
  fetchURL
}));

const {
  default: parser,
  parseFeedSource,
  process
} = await import('../../services/feeds/parser.js');

describe('feed parser', () => {
  it('keeps the compatibility exports wired to the canonical parser', () => {
    const parsed = parseFeedSource(
      '<rss version="2.0"><channel><title>Publisher</title></channel></rss>'
    );

    expect(parser).toEqual({ parseFeedSource, process });
    expect(parsed).toMatchObject({
      title: 'Publisher',
      format: 'rss',
      entries: []
    });
  });

  it('downloads and parses a valid feed', async () => {
    fetchURL.mockResolvedValue({
      ok: true,
      text: async () =>
        '<feed xmlns="http://www.w3.org/2005/Atom"><title>News</title></feed>'
    });

    await expect(process('https://example.com/feed.xml')).resolves.toMatchObject({
      title: 'News',
      format: 'atom'
    });
  });

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

  it('reports empty responses and unsupported feed formats with stable codes', async () => {
    fetchURL
      .mockResolvedValueOnce({
        ok: true,
        text: async () => ''
      })
      .mockResolvedValueOnce({
        ok: true,
        text: async () => '<html>Not a feed</html>'
      });

    await expect(process('https://example.com/empty')).rejects.toMatchObject({
      code: 'EMPTY_FEED_RESPONSE',
      message: 'Empty feed response'
    });
    await expect(process('https://example.com/html')).rejects.toMatchObject({
      code: 'INVALID_FEED',
      message: 'Invalid or unsupported feed format'
    });
  });

  it('preserves unexpected fetch failures as parser errors', async () => {
    fetchURL.mockRejectedValue(new Error('network unavailable'));

    await expect(process('https://example.com/feed.xml')).rejects.toMatchObject({
      code: 'FEED_PARSE_ERROR',
      message: 'network unavailable'
    });
  });
});
