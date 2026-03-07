import { describe, it, expect, vi } from 'vitest';

const fetchURL = vi.fn();

vi.mock('../util/fetchURL.js', () => ({
  fetchURL
}));

const { discoverRssLink } = await import('../util/discoverRssLink.js');

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
    expect(fetchURL).toHaveBeenCalledWith(rssUrl);
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
          text: async () => '<rss version="2.0"></rss>'
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
          text: async () => '<rss version="2.0"></rss>'
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
