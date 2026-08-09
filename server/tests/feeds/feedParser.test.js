import { describe, expect, it, vi } from 'vitest';

const fetchURL = vi.fn();

vi.mock('../../services/feeds/http/acquireHttp.js', () => ({
  acquireHttp: request => fetchURL(request)
}));

const {
  acquireFeedSource,
  default: parser,
  parseFeedSource,
  process
} = await import('../../services/feeds/parser.js');

describe('feed parser', () => {
  it('keeps the compatibility exports wired to the canonical parser', () => {
    const parsed = parseFeedSource(
      '<rss version="2.0"><channel><title>Publisher</title></channel></rss>'
    );

    expect(parser).toEqual({ acquireFeedSource, parseFeedSource, process });
    expect(parsed).toMatchObject({
      title: 'Publisher',
      format: 'rss',
      entries: []
    });
  });

  it('downloads and parses a valid feed', async () => {
    fetchURL.mockResolvedValue({
      type: 'changed',
      bodyText:
        '<feed xmlns="http://www.w3.org/2005/Atom"><title>News</title></feed>'
    });

    await expect(process('https://example.com/feed.xml')).resolves.toMatchObject({
      title: 'News',
      format: 'atom'
    });
  });

  it.each(['unchanged', 'not_modified'])(
    'skips parsing for %s responses',
    async type => {
      fetchURL.mockResolvedValue({ type, bodyText: '<invalid-feed>' });

      await expect(acquireFeedSource(
        'https://example.com/feed.xml',
        { previousContentHash: 'accepted-hash' }
      )).resolves.toMatchObject({ type });
    }
  );

  it('preserves feed fetch errors instead of relabeling them as parse errors', async () => {
    fetchURL.mockResolvedValue({
      type: 'rate_limited',
      response: { status: 429 }
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
        type: 'changed',
        bodyText: ''
      })
      .mockResolvedValueOnce({
        type: 'changed',
        bodyText: '<html>Not a feed</html>'
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
    fetchURL.mockResolvedValue({
      type: 'transient_failure',
      error: { type: 'transient_failure', message: 'network unavailable' }
    });

    await expect(process('https://example.com/feed.xml')).rejects.toMatchObject({
      code: 'FEED_PARSE_ERROR',
      message: 'network unavailable'
    });
  });

  it('returns the stable oversized-response error from feed downloads', async () => {
    const previousLimit = globalThis.process.env.FEED_RESPONSE_MAX_BYTES;
    globalThis.process.env.FEED_RESPONSE_MAX_BYTES = '8';
    fetchURL.mockResolvedValue({
      type: 'too_large',
      error: {
        type: 'too_large',
        message: 'Response body exceeds the configured limit of 8 bytes'
      }
    });

    try {
      await expect(
        process('https://example.com/oversized.xml')
      ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
    } finally {
      if (previousLimit === undefined) {
        delete globalThis.process.env.FEED_RESPONSE_MAX_BYTES;
      } else {
        globalThis.process.env.FEED_RESPONSE_MAX_BYTES = previousLimit;
      }
    }
  });
});
