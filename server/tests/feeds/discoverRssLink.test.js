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
  });

  it('rejects non-YouTube URLs in the YouTube resolver', async () => {
    fetchURL.mockReset();

    await expect(
      getYoutubeRssFromHandle(
        'https://youtube.com@evil.example/channel/UC12345678901234567890'
      )
    ).resolves.toBeUndefined();

    expect(fetchURL).not.toHaveBeenCalled();
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
