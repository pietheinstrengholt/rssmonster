import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  discoverRssLink: vi.fn(),
  findAlias: vi.fn(),
  findFeed: vi.fn(),
  parseFeed: vi.fn(),
  registerAliases: vi.fn()
}));

vi.mock('../../models/index.js', () => ({
  default: {
    Article: {},
    Category: {},
    Feed: {
      findOne: mocked.findFeed
    },
    User: {},
    sequelize: {}
  }
}));

vi.mock('../../services/feeds/discoverRssLink.js', () => ({
  default: {
    discoverRssLink: mocked.discoverRssLink
  }
}));

vi.mock('../../services/feeds/parser.js', () => ({
  default: {
    process: mocked.parseFeed
  }
}));

vi.mock('../../services/feeds/feedUrlAliases.js', () => ({
  FeedUrlAliasConflictError: class FeedUrlAliasConflictError extends Error {},
  findFeedByUrlAlias: mocked.findAlias,
  registerFeedUrlAliases: mocked.registerAliases
}));

const {
  FeedManagementError,
  discoverFeedSubscription,
  isFeedManagementError,
  normalizeFeedUrl,
  toCrawlSinceDate
} = await import('../../services/feeds/feedManagement.js');

describe('feed management helpers', () => {
  beforeEach(() => {
    mocked.discoverRssLink.mockReset();
    mocked.findAlias.mockReset().mockResolvedValue(null);
    mocked.findFeed.mockReset().mockResolvedValue(null);
    mocked.parseFeed.mockReset();
    mocked.registerAliases.mockReset();
  });

  it('normalizes safe feed URLs and rejects malformed, credentialed, or non-HTTP URLs', () => {
    expect(normalizeFeedUrl(' https://example.com/feed.xml#latest ')).toBe(
      'https://example.com/feed.xml'
    );

    for (const input of [
      'not a URL',
      'ftp://example.com/feed.xml',
      'https://user:secret@example.com/feed.xml'
    ]) {
      expect(() => normalizeFeedUrl(input)).toThrow(FeedManagementError);
    }
  });

  it('maps every supported crawl-history selector and safe fallback', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T12:00:00.000Z'));

    expect(toCrawlSinceDate('7d')).toEqual(
      new Date('2026-07-24T12:00:00.000Z')
    );
    expect(toCrawlSinceDate('1m')).toEqual(
      new Date('2026-07-01T12:00:00.000Z')
    );
    expect(toCrawlSinceDate('3m')).toEqual(
      new Date('2026-05-01T12:00:00.000Z')
    );
    expect(toCrawlSinceDate('1y')).toEqual(
      new Date('2025-07-31T12:00:00.000Z')
    );
    expect(toCrawlSinceDate('all')).toBeNull();
    expect(toCrawlSinceDate('2026-01-15')).toEqual(
      new Date('2026-01-15')
    );
    expect(toCrawlSinceDate('unsupported')).toEqual(
      new Date('2026-07-24T12:00:00.000Z')
    );

    vi.useRealTimers();
  });

  it('falls back to seven days when the selector cannot be converted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-31T12:00:00.000Z'));

    expect(toCrawlSinceDate(Symbol('invalid'))).toEqual(
      new Date('2026-07-24T12:00:00.000Z')
    );

    vi.useRealTimers();
  });

  it('identifies public feed-management errors', () => {
    expect(isFeedManagementError(
      new FeedManagementError('INVALID_URL', 'Invalid')
    )).toBe(true);
    expect(isFeedManagementError(new Error('Invalid'))).toBe(false);
  });

  it('returns an existing feed without outbound discovery', async () => {
    const existingFeed = {
      url: 'https://example.com/feed.xml',
      feedName: 'Existing',
      feedDesc: 'Description',
      feedType: 'rss',
      favicon: 'https://example.com/favicon.ico'
    };
    mocked.findFeed.mockResolvedValue(existingFeed);

    await expect(discoverFeedSubscription({
      userId: 42,
      inputUrl: existingFeed.url
    })).resolves.toMatchObject({
      query: existingFeed.url,
      feedUrl: existingFeed.url,
      feedName: 'Existing',
      existingFeed
    });
    expect(mocked.discoverRssLink).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a discovery exception',
      () => mocked.discoverRssLink.mockRejectedValue(new Error('offline')),
      'DISCOVERY_FAILED'
    ],
    [
      'an empty discovery result',
      () => mocked.discoverRssLink.mockResolvedValue(undefined),
      'DISCOVERY_FAILED'
    ],
    [
      'Cloudflare protection',
      () => mocked.discoverRssLink.mockResolvedValue({
        cloudflare: true,
        url: 'https://example.com'
      }),
      'CLOUDFLARE_BLOCKED'
    ]
  ])('maps %s to a public error', async (_label, arrange, expectedCode) => {
    arrange();

    await expect(discoverFeedSubscription({
      userId: 42,
      inputUrl: 'https://example.com'
    })).rejects.toMatchObject({
      name: 'FeedManagementError',
      code: expectedCode
    });
  });

  it('parses legacy string discovery results and checks canonical duplicates', async () => {
    const canonicalUrl = 'https://example.com/feed.xml';
    const canonicalFeed = { id: 7, url: canonicalUrl };
    mocked.discoverRssLink.mockResolvedValue(canonicalUrl);
    mocked.parseFeed.mockResolvedValue({
      title: 'Parsed title',
      description: 'Parsed description',
      format: 'atom',
      faviconUrl: 'https://example.com/icon.png'
    });
    mocked.findFeed
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(canonicalFeed);

    await expect(discoverFeedSubscription({
      userId: 42,
      inputUrl: 'https://example.com'
    })).resolves.toMatchObject({
      feedUrl: canonicalUrl,
      feedName: 'Parsed title',
      feedDesc: 'Parsed description',
      feedType: 'atom',
      favicon: 'https://example.com/icon.png',
      existingFeed: canonicalFeed
    });
    expect(mocked.parseFeed).toHaveBeenCalledWith(canonicalUrl);
  });

  it('maps parser failures and missing metadata to discovery errors', async () => {
    const canonicalUrl = 'https://example.com/feed.xml';
    mocked.discoverRssLink.mockResolvedValue(canonicalUrl);
    mocked.parseFeed.mockRejectedValueOnce(new Error('bad XML'));

    await expect(discoverFeedSubscription({
      inputUrl: 'https://example.com'
    })).rejects.toMatchObject({
      code: 'DISCOVERY_FAILED',
      message: 'Unable to parse the discovered feed'
    });

    mocked.parseFeed.mockResolvedValueOnce(null);
    await expect(discoverFeedSubscription({
      inputUrl: 'https://example.com'
    })).rejects.toMatchObject({
      code: 'DISCOVERY_FAILED',
      message: 'The discovered feed has no metadata'
    });
  });
});
