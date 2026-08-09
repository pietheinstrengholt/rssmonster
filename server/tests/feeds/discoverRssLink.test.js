import { afterEach, describe, it, expect, vi } from 'vitest';

const fetchURL = vi.fn();
const mockedHttp = vi.hoisted(() => ({ requests: [] }));

vi.mock('../../services/feeds/http/acquireHttp.js', () => ({
  acquireHttp: request => {
    mockedHttp.requests.push(request);
    return fetchURL(request.url, request.retries, request.timeoutMs);
  }
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
  type: ok ? 'changed' : 'permanent_failure',
  response: {
    url,
    status,
    headers: {
      'content-type': contentType,
      server
    },
    redirects: [],
    body: null
  },
  bodyText: body,
  error: ok ? undefined : {
    type: 'permanent_failure',
    message: `Server returned HTTP ${status}`,
    status
  }
});

afterEach(() => {
  vi.useRealTimers();
  mockedHttp.requests.length = 0;
});

describe('discoverRssLink', () => {
  it('resolves and validates a relative Atom self URL against the final response URL', async () => {
    fetchURL.mockReset();
    const sourceUrl = 'https://origin.example.test/start';
    const finalUrl = 'https://cdn.example.test/feeds/current/feed.xml';
    const selfUrl = 'https://cdn.example.test/feeds/canonical.xml';
    // Builds equivalent source and validation feeds with different self declarations.
    const atom = selfDeclaration => `
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Redirected publisher</title>
        <id>urn:feed:redirected</id>
        <updated>2026-08-09T10:00:00Z</updated>
        <link rel="self" href="${selfDeclaration}" />
        <entry>
          <title>Stable entry</title>
          <id>entry-1</id>
          <updated>2026-08-09T10:00:00Z</updated>
          <link href="https://publisher.example.test/articles/1" />
        </entry>
      </feed>`;
    fetchURL
      .mockResolvedValueOnce(responseFor({
        url: finalUrl,
        contentType: 'application/atom+xml',
        body: atom('../canonical.xml')
      }))
      .mockResolvedValueOnce(responseFor({
        url: selfUrl,
        contentType: 'application/atom+xml',
        body: atom(selfUrl)
      }));

    const result = await discoverRssLink(sourceUrl, undefined, {
      includeParsedFeed: true
    });

    expect(result.publisherSelf).toMatchObject({
      accepted: true,
      resolvedUrl: selfUrl,
      status: 'validated',
      fetched: true,
      evidence: { sameOrigin: true, sharedEntries: 1 }
    });
    expect(fetchURL).toHaveBeenCalledTimes(2);
    expect(fetchURL.mock.calls[1][0]).toBe(selfUrl);
  });

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
      'https://www.youtube.com/@rssmonster',
      undefined,
      undefined
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
      .mockResolvedValueOnce({
        type: 'transient_failure',
        error: { type: 'transient_failure', message: 'offline' }
      })
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

  it('applies the shared response limit to YouTube discovery pages', async () => {
    const previousLimit = process.env.FEED_RESPONSE_MAX_BYTES;
    process.env.FEED_RESPONSE_MAX_BYTES = '8';
    fetchURL.mockReset();
    fetchURL.mockResolvedValue({
      type: 'too_large',
      error: {
        type: 'too_large',
        message: 'Response body exceeds the configured limit of 8 bytes'
      }
    });

    try {
      await expect(
        getYoutubeRssFromHandle('oversized')
      ).rejects.toMatchObject({ code: 'RESPONSE_TOO_LARGE' });
    } finally {
      if (previousLimit === undefined) {
        delete process.env.FEED_RESPONSE_MAX_BYTES;
      } else {
        process.env.FEED_RESPONSE_MAX_BYTES = previousLimit;
      }
    }
  });

  it('does not persist shared-limit failures inside discovery', async () => {
    const previousLimit = process.env.FEED_RESPONSE_MAX_BYTES;
    process.env.FEED_RESPONSE_MAX_BYTES = '8';
    fetchURL.mockReset();
    const pageUrl = 'https://example.com/news';
    const feed = {
      errorCount: 0,
      update: vi.fn().mockResolvedValue(undefined)
    };
    fetchURL.mockResolvedValue({
      type: 'too_large',
      error: {
        type: 'too_large',
        message: 'Response body exceeds the configured limit of 8 bytes'
      }
    });

    try {
      await expect(discoverRssLink(pageUrl, feed)).resolves.toBeUndefined();
      expect(feed.update).not.toHaveBeenCalled();
    } finally {
      if (previousLimit === undefined) {
        delete process.env.FEED_RESPONSE_MAX_BYTES;
      } else {
        process.env.FEED_RESPONSE_MAX_BYTES = previousLimit;
      }
    }
  });

  it('returns invalid discovery input without mutating feed failure state', async () => {
    fetchURL.mockReset();
    const feed = {
      errorCount: 25,
      update: vi.fn().mockRejectedValue(new Error('database unavailable'))
    };

    await expect(discoverRssLink('invalid', feed)).resolves.toBeUndefined();

    expect(feed.update).not.toHaveBeenCalled();
    expect(fetchURL).not.toHaveBeenCalled();
  });

  it('reports Cloudflare protection without mutating feed failure state', async () => {
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
    expect(feed.update).not.toHaveBeenCalled();
  });

  it('accepts Reddit RSS URL directly', async () => {
    fetchURL.mockReset();
    const rssUrl = 'https://www.reddit.com/.rss';

    fetchURL.mockImplementation(async (candidate) => {
      if (candidate === rssUrl) {
        return responseFor({
          url: rssUrl,
          contentType: 'application/rss+xml; charset=utf-8',
          body: '<rss version="2.0"><channel><title>Reddit</title></channel></rss>'
        });
      }

      return responseFor({
        ok: false,
        url: candidate,
        contentType: '',
        body: ''
      });
    });

    await expect(discoverRssLink(rssUrl)).resolves.toBe(rssUrl);
    expect(fetchURL).toHaveBeenCalledWith(rssUrl, 1, 5000);
  });

  it('returns the parsed direct feed without fetching it twice', async () => {
    fetchURL.mockReset();
    const rssUrl = 'https://www.reddit.com/.rss';

    fetchURL.mockResolvedValue(responseFor({
      url: rssUrl,
      contentType: 'application/atom+xml; charset=utf-8',
      body: '<feed xmlns="http://www.w3.org/2005/Atom"><title>Reddit</title></feed>'
    }));

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

  it.each(['unchanged', 'not_modified'])(
    'returns a direct %s outcome without parsing or fallback requests',
    async type => {
      fetchURL.mockReset();
      const rssUrl = 'https://example.com/feed.xml';
      const conditionalRequest = {
        headers: { 'if-none-match': '"feed-v2"' },
        previousContentHash: 'accepted-hash'
      };
      fetchURL.mockResolvedValue({
        type,
        response: {
          status: type === 'not_modified' ? 304 : 200,
          url: rssUrl,
          headers: {},
          redirects: [],
          body: null
        },
        bodyHash: 'accepted-hash'
      });

      await expect(discoverRssLink(rssUrl, undefined, {
        includeParsedFeed: true,
        conditionalRequest
      })).resolves.toMatchObject({
        url: rssUrl,
        parsedFeed: null,
        fetchOutcome: { type }
      });
      expect(fetchURL).toHaveBeenCalledTimes(1);
      expect(mockedHttp.requests[0]).toMatchObject(conditionalRequest);
    }
  );

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

  it('discovers a declared feed from the homepage after a stored endpoint disappears', async () => {
    fetchURL.mockReset();
    const oldFeedUrl = 'https://publisher.example.test/obsolete.xml';
    const homepageUrl = 'https://publisher.example.test';
    const recoveredUrl = 'https://publisher.example.test/feeds/current.atom';
    const feed = {
      url: oldFeedUrl,
      update: vi.fn().mockResolvedValue(undefined)
    };
    fetchURL.mockImplementation(async candidate => {
      if (candidate === oldFeedUrl) {
        return responseFor({ ok: false, url: candidate, status: 404 });
      }
      if (candidate === homepageUrl) {
        return responseFor({
          url: homepageUrl,
          body: '<html><head><link rel="alternate" ' +
            'type="application/atom+xml" href="/feeds/current.atom"></head></html>'
        });
      }
      if (candidate === recoveredUrl) {
        return responseFor({
          url: recoveredUrl,
          contentType: 'application/atom+xml',
          body: '<feed xmlns="http://www.w3.org/2005/Atom"><title>Recovered</title></feed>'
        });
      }
      return responseFor({ ok: false, url: candidate, status: 404 });
    });

    await expect(discoverRssLink(oldFeedUrl, feed)).resolves.toBe(recoveredUrl);
    expect(fetchURL.mock.calls.map(([candidate]) => candidate)).toEqual([
      oldFeedUrl,
      homepageUrl,
      recoveredUrl
    ]);
    expect(feed.update).toHaveBeenCalledWith({ url: recoveredUrl });
  });

  it('checks the homepage when a stored endpoint becomes an HTML placeholder', async () => {
    fetchURL.mockReset();
    const oldFeedUrl = 'https://publisher.example.test/retired-feed';
    const homepageUrl = 'https://publisher.example.test';
    const recoveredUrl = 'https://publisher.example.test/feed.json';
    const feed = {
      url: oldFeedUrl,
      update: vi.fn().mockResolvedValue(undefined)
    };
    fetchURL.mockImplementation(async candidate => {
      if (candidate === oldFeedUrl) {
        return responseFor({
          url: candidate,
          body: '<html><body>This feed endpoint has moved.</body></html>'
        });
      }
      if (candidate === homepageUrl) {
        return responseFor({
          url: homepageUrl,
          body: '<html><head><link rel="alternate" ' +
            'type="application/feed+json" href="/feed.json"></head></html>'
        });
      }
      if (candidate === recoveredUrl) {
        return responseFor({
          url: recoveredUrl,
          contentType: 'application/feed+json',
          body: JSON.stringify({
            version: 'https://jsonfeed.org/version/1.1',
            title: 'Recovered JSON Feed',
            items: []
          })
        });
      }
      return responseFor({ ok: false, url: candidate, status: 404 });
    });

    await expect(discoverRssLink(oldFeedUrl, feed)).resolves.toBe(recoveredUrl);
    expect(fetchURL.mock.calls.map(([candidate]) => candidate)).toEqual([
      oldFeedUrl,
      homepageUrl,
      recoveredUrl
    ]);
    expect(feed.update).toHaveBeenCalledWith({ url: recoveredUrl });
  });

  it.each([
    ['rate limiting', {
      type: 'rate_limited',
      response: { status: 429, headers: {}, redirects: [], body: null },
      error: { type: 'rate_limited', status: 429, message: 'HTTP 429' }
    }],
    ['transient network failure', {
      type: 'transient_failure',
      error: { type: 'transient_failure', message: 'connection reset' }
    }],
    ['security rejection', {
      type: 'security_rejected',
      error: { type: 'security_rejected', message: 'blocked' }
    }]
  ])('does not probe fallback endpoints after %s', async (_label, outcome) => {
    fetchURL.mockReset().mockResolvedValue(outcome);

    await expect(
      discoverRssLink('https://example.com/old-feed.xml')
    ).resolves.toBeUndefined();

    expect(fetchURL).toHaveBeenCalledTimes(1);
  });

  it('limits missing-endpoint recovery to five conventional paths', async () => {
    fetchURL.mockReset();
    const oldFeedUrl = 'https://example.com/old-feed.xml';
    const homepageUrl = 'https://example.com';
    fetchURL.mockImplementation(async candidate => responseFor({
      ok: false,
      url: candidate,
      status: 404
    }));

    await expect(discoverRssLink(oldFeedUrl)).resolves.toBeUndefined();

    expect(fetchURL.mock.calls.map(([candidate]) => candidate)).toEqual([
      oldFeedUrl,
      homepageUrl,
      'https://example.com/feed',
      'https://example.com/feed.xml',
      'https://example.com/rss',
      'https://example.com/rss.xml',
      'https://example.com/atom.xml'
    ]);
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
        return responseFor({
          url: rssUrl,
          body: '<rss version="2.0"><channel><title>Bluesky</title></channel></rss>'
        });
      }

      return responseFor({ ok: false, url: candidate, status: 404 });
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
        return responseFor({
          url: rssUrl,
          body: '<rss version="2.0"><channel><title>Mastodon</title></channel></rss>'
        });
      }

      return responseFor({ ok: false, url: candidate, status: 404 });
    });

    await expect(discoverRssLink(profileUrl)).resolves.toBe(rssUrl);
    expect(fetchURL).toHaveBeenCalledWith(rssUrl, 0, 3000);
  });

  it('does not fetch the original URL again after the initial attempt', async () => {
    fetchURL.mockReset();
    const pageUrl = 'https://example.com/news';

    fetchURL.mockResolvedValue({
      type: 'transient_failure',
      error: { type: 'transient_failure', message: 'fetch failed' }
    });

    await expect(discoverRssLink(pageUrl)).resolves.toBeUndefined();

    const originalCalls = fetchURL.mock.calls.filter(([candidate]) => (
      candidate === pageUrl
    ));
    expect(originalCalls).toHaveLength(1);
  });

  it('stops discovery after the initial request times out', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    fetchURL.mockReset();

    fetchURL.mockImplementation(async (_candidate, _retries, timeoutMs) => {
      vi.setSystemTime(Date.now() + timeoutMs);
      return {
        type: 'timed_out',
        error: { type: 'timed_out', message: 'The fetch operation timed out' }
      };
    });

    await expect(
      discoverRssLink('https://example.com/news')
    ).resolves.toBeUndefined();

    const allocatedMs = fetchURL.mock.calls.reduce(
      (total, call) => total + call[2],
      0
    );
    expect(allocatedMs).toBe(5000);
    expect(fetchURL.mock.calls[0]).toEqual([
      'https://example.com/news',
      1,
      5000
    ]);
    expect(fetchURL).toHaveBeenCalledTimes(1);

  });

  it('reports primary and speculative failure provenance separately', async () => {
    fetchURL.mockReset();
    const primaryUrl = 'https://example.com/section.xml';
    const fetchEvents = [];
    const parseEvents = [];
    fetchURL.mockImplementation(async candidate => {
      if (candidate === primaryUrl) {
        return responseFor({
          url: primaryUrl,
          contentType: 'application/rss+xml',
          body: '<rss><channel><item></rss>'
        });
      }
      return responseFor({ ok: false, url: candidate, status: 404 });
    });

    await expect(discoverRssLink(primaryUrl, undefined, {
      onFetchOutcome: (outcome, provenance) => {
        fetchEvents.push({ outcome, provenance });
      },
      onParseFailure: (diagnostic, provenance) => {
        parseEvents.push({ diagnostic, provenance });
      }
    })).resolves.toBeUndefined();

    expect(fetchEvents[0]).toMatchObject({
      outcome: { type: 'changed' },
      provenance: {
        role: 'primary',
        kind: 'primary',
        requestedUrl: primaryUrl
      }
    });
    expect(parseEvents[0]).toMatchObject({
      diagnostic: { code: 'MALFORMED_FEED_BODY' },
      provenance: { role: 'primary', kind: 'primary' }
    });
    expect(fetchEvents.slice(1).every(event => (
      event.provenance.role === 'candidate' &&
      event.provenance.kind === 'conventional_path' &&
      event.provenance.speculative === true
    ))).toBe(true);
  });
});
