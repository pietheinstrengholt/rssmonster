import { afterEach, describe, it, expect, vi } from 'vitest';

const fetchURL = vi.fn();

vi.mock('../../utils/fetchURL.js', () => ({
  fetchURL
}));

const { discoverRssLink } = await import('../../services/feeds/discoverRssLink.js');
const {
  getYoutubeRssFromHandle,
  isYoutubeUrl
} = await import('../../services/feeds/getYoutubeRssFromHandle.js');

// This function builds a fetch response with the headers used by discovery.
const responseFor = ({
  ok = true,
  url,
  status = 200,
  contentType = 'text/html',
  server = '',
  body = ''
}) => ({
  ok,
  url,
  status,
  headers: {
    get: name => {
      if (name === 'content-type') return contentType;
      if (name === 'server') return server;
      return null;
    }
  },
  text: async () => body
});

afterEach(() => {
  vi.useRealTimers();
});

describe('discoverRssLink', () => {
  it('recognizes only explicitly allowed YouTube hosts', () => {
    expect(isYoutubeUrl('https://youtube.com/channel/example')).toBe(true);
    expect(isYoutubeUrl('https://www.youtube.com/@example')).toBe(true);
    expect(isYoutubeUrl('https://youtu.be/example')).toBe(true);
    expect(isYoutubeUrl('https://youtube.com.evil.example/@example')).toBe(false);
    expect(isYoutubeUrl('https://evil.example/youtube.com/@example')).toBe(false);
    expect(isYoutubeUrl('https://evil.example/?next=youtube.com')).toBe(false);
    expect(isYoutubeUrl('https://youtube.com@evil.example/@example')).toBe(false);
    expect(isYoutubeUrl('not a URL')).toBe(false);
  });

  it('rejects malformed, non-YouTube, and video URLs in the YouTube resolver', async () => {
    fetchURL.mockReset();

    await expect(
      getYoutubeRssFromHandle({ startsWith: () => true })
    ).resolves.toBeUndefined();
    await expect(
      getYoutubeRssFromHandle(
        'https://youtube.com@evil.example/channel/UC12345678901234567890'
      )
    ).resolves.toBeUndefined();
    await expect(
      getYoutubeRssFromHandle('https://youtu.be/video-id')
    ).resolves.toBeUndefined();
    await expect(
      getYoutubeRssFromHandle('https://www.youtube.com/watch?v=video-id')
    ).resolves.toBeUndefined();

    expect(fetchURL).not.toHaveBeenCalled();
  });

  it('converts direct YouTube channel URLs without fetching HTML', async () => {
    fetchURL.mockReset();

    await expect(
      getYoutubeRssFromHandle(
        'https://www.youtube.com/channel/UC12345678901234567890'
      )
    ).resolves.toBe(
      'https://www.youtube.com/feeds/videos.xml?channel_id=UC12345678901234567890'
    );

    expect(fetchURL).not.toHaveBeenCalled();
  });

  it('resolves YouTube handles from page metadata', async () => {
    fetchURL.mockReset();
    fetchURL.mockResolvedValue(responseFor({
      url: 'https://www.youtube.com/@rssmonster',
      body: '<script>{"channelId":"UC12345678901234567890"}</script>'
    }));

    await expect(
      getYoutubeRssFromHandle('rssmonster')
    ).resolves.toBe(
      'https://www.youtube.com/feeds/videos.xml?channel_id=UC12345678901234567890'
    );
    expect(fetchURL).toHaveBeenCalledWith(
      'https://www.youtube.com/@rssmonster'
    );
  });

  it('uses a resolved YouTube channel feed without general fallback discovery', async () => {
    fetchURL.mockReset();
    const profileUrl = 'https://www.youtube.com/@rssmonster';
    const rssUrl =
      'https://www.youtube.com/feeds/videos.xml?channel_id=UC12345678901234567890';
    const feed = {
      url: profileUrl,
      update: vi.fn().mockResolvedValue(undefined)
    };
    fetchURL.mockResolvedValue(responseFor({
      url: profileUrl,
      body: '<script>{"channelId":"UC12345678901234567890"}</script>'
    }));

    await expect(discoverRssLink(profileUrl, feed)).resolves.toBe(rssUrl);
    expect(feed.update).toHaveBeenCalledWith({ url: rssUrl });
    expect(fetchURL).toHaveBeenCalledTimes(1);
  });

  it('returns no YouTube feed when the profile request or metadata is unusable', async () => {
    fetchURL.mockReset();
    fetchURL
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(responseFor({
        ok: false,
        url: 'https://www.youtube.com/@missing'
      }))
      .mockResolvedValueOnce(responseFor({
        url: 'https://www.youtube.com/@missing',
        body: '<html>No channel metadata</html>'
      }));

    await expect(
      getYoutubeRssFromHandle('offline')
    ).resolves.toBeUndefined();
    await expect(
      getYoutubeRssFromHandle('missing')
    ).resolves.toBeUndefined();
    await expect(
      getYoutubeRssFromHandle('missing')
    ).resolves.toBeUndefined();
  });

  it('records invalid discovery input without throwing on persistence failure', async () => {
    fetchURL.mockReset();
    const feed = {
      errorCount: 25,
      update: vi.fn().mockRejectedValue(new Error('database unavailable'))
    };

    await expect(discoverRssLink('invalid', feed)).resolves.toBeUndefined();

    expect(feed.update).toHaveBeenCalledWith({
      errorCount: 26,
      errorMessage: 'Invalid URL',
      status: 'error'
    });
    expect(fetchURL).not.toHaveBeenCalled();
  });

  it('reports Cloudflare protection and increments the feed error state', async () => {
    fetchURL.mockReset();
    const url = 'https://protected.example.com';
    const feed = {
      errorCount: 0,
      update: vi.fn().mockResolvedValue(undefined)
    };
    fetchURL.mockResolvedValue(responseFor({
      ok: false,
      url,
      status: 503,
      server: 'cloudflare'
    }));

    await expect(discoverRssLink(url, feed)).resolves.toEqual({
      cloudflare: true,
      url
    });
    expect(feed.update).toHaveBeenCalledWith({
      errorCount: 1,
      errorMessage: 'Cloudflare bot protection detected'
    });
  });

  it('accepts Reddit RSS URL directly', async () => {
    fetchURL.mockReset();
    const rssUrl = 'https://www.reddit.com/.rss';

    fetchURL.mockImplementation(async (candidate) => {
      if (candidate === rssUrl) {
        return {
          ok: true,
          url: rssUrl,
          headers: {
            get: (name) => (name === 'content-type' ? 'application/rss+xml; charset=utf-8' : null)
          },
          text: async () => '<rss version="2.0"><channel><title>Reddit</title></channel></rss>'
        };
      }

      return {
        ok: false,
        url: candidate,
        headers: {
          get: () => null
        },
        text: async () => ''
      };
    });

    await expect(discoverRssLink(rssUrl)).resolves.toBe(rssUrl);
    expect(fetchURL).toHaveBeenCalledWith(rssUrl, 1, 5000);
  });

  it('returns the parsed direct feed without fetching it twice', async () => {
    fetchURL.mockReset();
    const rssUrl = 'https://www.reddit.com/.rss';

    fetchURL.mockResolvedValue({
      ok: true,
      url: rssUrl,
      headers: {
        get: (name) => (name === 'content-type' ? 'application/atom+xml; charset=utf-8' : null)
      },
      text: async () => '<feed xmlns="http://www.w3.org/2005/Atom"><title>Reddit</title></feed>'
    });

    const result = await discoverRssLink(
      rssUrl,
      undefined,
      { includeParsedFeed: true }
    );

    expect(result.url).toBe(rssUrl);
    expect(result.parsedFeed).toMatchObject({
      format: 'atom',
      title: 'Reddit',
      entries: []
    });
    expect(fetchURL).toHaveBeenCalledTimes(1);
  });

  it('discovers and persists a relative feed link from an HTML head', async () => {
    fetchURL.mockReset();
    const pageUrl = 'https://example.com/articles/latest';
    const feedUrl = 'https://example.com/rss.xml';
    const feed = {
      url: pageUrl,
      update: vi.fn().mockResolvedValue(undefined)
    };
    fetchURL.mockImplementation(async candidate => {
      if (candidate === pageUrl) {
        return responseFor({
          url: pageUrl,
          body: '<html><head><link type="application/rss+xml" href="/rss.xml"></head></html>'
        });
      }
      if (candidate === feedUrl) {
        return responseFor({
          url: feedUrl,
          contentType: 'application/rss+xml',
          body: '<rss version="2.0"><channel><title>Publisher</title></channel></rss>'
        });
      }
      return responseFor({ ok: false, url: candidate, status: 404 });
    });

    await expect(
      discoverRssLink(pageUrl, feed, { includeParsedFeed: true })
    ).resolves.toMatchObject({
      url: feedUrl,
      parsedFeed: { title: 'Publisher', format: 'rss' }
    });
    expect(feed.update).toHaveBeenCalledWith({ url: feedUrl });
  });

  it('follows a meta refresh discovered in the initial HTML page', async () => {
    fetchURL.mockReset();
    const pageUrl = 'https://example.com/news';
    const feedUrl = 'https://example.com/feeds/news.xml';
    fetchURL.mockImplementation(async candidate => {
      if (candidate === pageUrl) {
        return responseFor({
          url: pageUrl,
          body: '<meta http-equiv="refresh" content="0; url=/feeds/news.xml">'
        });
      }
      if (candidate === feedUrl) {
        return responseFor({
          url: feedUrl,
          body: '<feed xmlns="http://www.w3.org/2005/Atom"><title>News</title></feed>'
        });
      }
      return responseFor({ ok: false, url: candidate, status: 404 });
    });

    await expect(discoverRssLink(pageUrl)).resolves.toBe(feedUrl);
  });

  it('follows a meta refresh returned by a fallback candidate', async () => {
    fetchURL.mockReset();
    const pageUrl = 'https://example.com/start';
    const baseUrl = 'https://example.com';
    const feedUrl = 'https://example.com/actual.xml';
    fetchURL.mockImplementation(async candidate => {
      if (candidate === pageUrl) {
        return responseFor({ ok: false, url: pageUrl, status: 404 });
      }
      if (candidate === baseUrl) {
        return responseFor({
          url: baseUrl,
          body: '<meta http-equiv="refresh" content="0; url=/actual.xml">'
        });
      }
      if (candidate === feedUrl) {
        return responseFor({
          url: feedUrl,
          body: '<rss version="2.0"><channel><title>Actual</title></channel></rss>'
        });
      }
      return responseFor({ ok: false, url: candidate, status: 404 });
    });

    await expect(discoverRssLink(pageUrl)).resolves.toBe(feedUrl);
  });

  it('does not rewrite a feed that already has the discovered URL', async () => {
    fetchURL.mockReset();
    const rssUrl = 'https://example.com/feed.xml';
    const feed = {
      url: rssUrl,
      update: vi.fn()
    };
    fetchURL.mockResolvedValue(responseFor({
      url: rssUrl,
      contentType: 'application/xml',
      body: '<rss version="2.0"><channel><title>Same URL</title></channel></rss>'
    }));

    await expect(discoverRssLink(rssUrl, feed)).resolves.toBe(rssUrl);
    expect(feed.update).not.toHaveBeenCalled();
  });

  it('discovers Bluesky profile RSS by appending /rss', async () => {
    fetchURL.mockReset();
    const profileUrl =
      'https://bsky.app/profile/did:plc:njcr3moahtid7crxdjtu26jp';
    const rssUrl = `${profileUrl}/rss`;

    fetchURL.mockImplementation(async (candidate) => {
      if (candidate === rssUrl) {
        return {
          ok: true,
          url: rssUrl,
          text: async () => '<rss version="2.0"><channel><title>Bluesky</title></channel></rss>'
        };
      }

      return {
        ok: false,
        url: candidate
      };
    });

    await expect(discoverRssLink(profileUrl)).resolves.toBe(rssUrl);
    expect(fetchURL).toHaveBeenCalledWith(rssUrl, 0, 3000);
  });

  it('discovers Mastodon profile RSS by appending .rss', async () => {
    fetchURL.mockReset();
    const profileUrl = 'https://mastodon.social/@Gargron';
    const rssUrl = `${profileUrl}.rss`;

    fetchURL.mockImplementation(async (candidate) => {
      if (candidate === rssUrl) {
        return {
          ok: true,
          url: rssUrl,
          text: async () => '<rss version="2.0"><channel><title>Mastodon</title></channel></rss>'
        };
      }

      return {
        ok: false,
        url: candidate
      };
    });

    await expect(discoverRssLink(profileUrl)).resolves.toBe(rssUrl);
    expect(fetchURL).toHaveBeenCalledWith(rssUrl, 0, 3000);
  });

  it('does not fetch the original URL again after the initial attempt', async () => {
    fetchURL.mockReset();
    const pageUrl = 'https://example.com/news';

    fetchURL.mockRejectedValue(new Error('fetch failed'));

    await expect(discoverRssLink(pageUrl)).resolves.toBeUndefined();

    const originalCalls = fetchURL.mock.calls.filter(([candidate]) => (
      candidate === pageUrl
    ));
    expect(originalCalls).toHaveLength(1);
  });

  it('limits all candidate fetches to the overall discovery budget', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    fetchURL.mockReset();

    fetchURL.mockImplementation(async (_candidate, _retries, timeoutMs) => {
      vi.setSystemTime(Date.now() + timeoutMs);
      const error = new Error('The fetch operation timed out');
      error.name = 'TimeoutError';
      throw error;
    });

    await expect(
      discoverRssLink('https://example.com/news')
    ).resolves.toBeUndefined();

    const allocatedMs = fetchURL.mock.calls.reduce(
      (total, call) => total + call[2],
      0
    );
    expect(allocatedMs).toBe(15000);
    expect(fetchURL.mock.calls[0]).toEqual([
      'https://example.com/news',
      1,
      5000
    ]);
    expect(fetchURL.mock.calls.slice(1).every((call) => call[1] === 0)).toBe(true);

  });
});
