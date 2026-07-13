import { describe, it, expect, vi } from 'vitest';

const fetchURL = vi.fn();

vi.mock('../utils/fetchURL.js', () => ({
  fetchURL
}));

const { discoverRssLink } = await import('../services/feeds/discoverRssLink.js');

describe('discoverRssLink', () => {
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
    expect(fetchURL).toHaveBeenCalledWith(rssUrl, 2);
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
      feed: { title: 'Reddit' }
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
    expect(fetchURL).toHaveBeenCalledWith(rssUrl, 2);
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
    expect(fetchURL).toHaveBeenCalledWith(rssUrl, 2);
  });
});
