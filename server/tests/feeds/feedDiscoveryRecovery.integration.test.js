import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';
import { Op } from 'sequelize';

const mocked = vi.hoisted(() => ({ acquire: vi.fn() }));

vi.mock('../../services/feeds/http/acquireHttp.js', () => ({
  acquireHttp: request => mocked.acquire(request)
}));

import db from '../../models/index.js';
import { discoverRssLink } from '../../services/feeds/discoverRssLink.js';

const { Article, Category, Feed, FeedUrlAlias, User, sequelize } = db;
let sequence = 0;
let ownedUserIds = [];

// Creates collision-safe fixture values for the shared integration database.
const unique = prefix => `${prefix}-${Date.now()}-${++sequence}`;

// Creates one transport-neutral successful acquisition outcome.
const successfulOutcome = ({
  url,
  body,
  bodyHash = null,
  contentType = 'application/rss+xml',
  redirects = [],
  status = 200,
  type = 'changed'
}) => ({
  type,
  response: {
    status,
    url,
    headers: { 'content-type': contentType },
    redirects,
    body: null
  },
  bodyText: body,
  ...(bodyHash ? { bodyHash } : {})
});

// Creates one recoverable missing-endpoint outcome.
const missingOutcome = url => ({
  type: 'permanent_failure',
  response: { status: 404, url, headers: {}, redirects: [], body: null },
  error: { type: 'permanent_failure', status: 404, message: 'HTTP 404' }
});

// Builds a minimal RSS feed with stable entry URLs and GUIDs.
const rssBody = (title, entries) => `
  <rss version="2.0"><channel><title>${title}</title>
    ${entries.map(entry => `
      <item><title>${entry.guid}</title><guid>${entry.guid}</guid>
      <link>${entry.url}</link></item>`).join('')}
  </channel></rss>`;

// Creates an established subscription with durable article identity history.
const createEstablishedFeed = async ({ url, entries = [] }) => {
  const username = `${unique('recovery')}@example.test`;
  const user = await User.create({
    username,
    password: 'test-password',
    feverCredentialHash: `${username}-hash`,
    role: 'user'
  });
  ownedUserIds.push(user.id);
  const category = await Category.create({
    userId: user.id,
    name: unique('Recovery feeds'),
    categoryOrder: 1
  });
  const feed = await Feed.create({
    userId: user.id,
    categoryId: category.id,
    feedName: 'Established section feed',
    feedType: 'rss',
    url
  });
  for (const entry of entries) {
    await Article.create({
      userId: user.id,
      feedId: feed.id,
      externalId: entry.guid,
      externalIdType: 'guid',
      status: 'unread',
      url: entry.url,
      normalizedUrl: entry.url,
      title: entry.guid,
      contentHtml: '<p>Recovery identity</p>',
      contentText: 'Recovery identity',
      publishedAt: new Date('2026-08-01T00:00:00.000Z')
    });
  }
  return { user, feed };
};

describe('established feed discovery recovery integration', () => {
  beforeAll(async () => {
    await sequelize.authenticate();
  }, 50_000);

  beforeEach(() => {
    mocked.acquire.mockReset();
  });

  afterEach(async () => {
    if (ownedUserIds.length > 0) {
      await User.destroy({ where: { id: { [Op.in]: ownedUserIds } } });
    }
    ownedUserIds = [];
  });

  it('preserves an established URL when a maintenance page advertises an unrelated feed', async () => {
    const oldUrl = 'https://publisher.example.test/sections/technology.xml';
    const siteFeedUrl = 'https://publisher.example.test/feed';
    const { feed } = await createEstablishedFeed({ url: oldUrl });
    const maintenance = '<html><head><link rel="alternate" ' +
      'type="application/rss+xml" href="/feed"></head><body>Maintenance</body></html>';
    mocked.acquire.mockImplementation(async ({ url }) => {
      if (url === oldUrl || url === 'https://publisher.example.test') {
        return successfulOutcome({
          url,
          body: maintenance,
          contentType: 'text/html'
        });
      }
      if (url === siteFeedUrl) {
        return successfulOutcome({
          url,
          body: rssBody('Whole site', [{
            guid: 'unrelated',
            url: 'https://publisher.example.test/articles/unrelated'
          }])
        });
      }
      return missingOutcome(url);
    });

    const result = await discoverRssLink(oldUrl, feed, {
      includeParsedFeed: true
    });

    expect(result).toMatchObject({
      url: null,
      recovery: {
        accepted: false,
        code: 'FEED_RECOVERY_IDENTITY_UNVERIFIED',
        kind: 'html_alternate',
        candidateUrl: siteFeedUrl
      }
    });
    expect(await Feed.findByPk(feed.id)).toMatchObject({ url: oldUrl });
    expect(await FeedUrlAlias.count({ where: { feedId: feed.id } })).toBe(0);
  });

  it('rejects an unrelated site-wide conventional feed', async () => {
    const oldUrl = 'https://publisher.example.test/sections/science.xml';
    const siteFeedUrl = 'https://publisher.example.test/feed';
    const { feed } = await createEstablishedFeed({ url: oldUrl });
    mocked.acquire.mockImplementation(async ({ url }) => {
      if (url === siteFeedUrl) {
        return successfulOutcome({
          url,
          body: rssBody('Whole site', [{
            guid: 'site-wide',
            url: 'https://publisher.example.test/articles/site-wide'
          }])
        });
      }
      return missingOutcome(url);
    });

    const result = await discoverRssLink(oldUrl, feed, {
      includeParsedFeed: true
    });

    expect(result.recovery).toMatchObject({
      code: 'FEED_RECOVERY_IDENTITY_UNVERIFIED',
      kind: 'conventional_path',
      candidateUrl: siteFeedUrl,
      evidence: { sharedEntries: 0 }
    });
    expect(await Feed.findByPk(feed.id)).toMatchObject({ url: oldUrl });
  });

  it.each([
    { label: '301', statuses: [301], accepted: true },
    { label: '308', statuses: [308], accepted: true },
    { label: '301 -> 308', statuses: [301, 308], accepted: true },
    { label: '302 -> 301', statuses: [302, 301], accepted: false },
    { label: '307 -> 308', statuses: [307, 308], accepted: false },
    { label: '301 -> 302', statuses: [301, 302], accepted: false },
    {
      label: 'discontinuous permanent records',
      statuses: [301, 308],
      discontinuous: true,
      accepted: false
    },
    {
      label: 'incomplete permanent records',
      statuses: [301],
      incomplete: true,
      accepted: false
    },
    {
      label: 'malformed permanent records',
      statuses: [301],
      malformed: true,
      accepted: false
    }
  ])('applies complete-chain redirect authority for $label', async ({
    statuses,
    discontinuous = false,
    incomplete = false,
    malformed = false,
    accepted
  }) => {
    const oldUrl = 'https://old.example.test/section.xml';
    const intermediateUrl = 'https://edge.example.test/section.xml';
    const movedUrl = 'https://new.example.test/section.xml';
    const { feed } = await createEstablishedFeed({ url: oldUrl });
    const redirects = statuses.length === 1
      ? [{
          fromUrl: oldUrl,
          toUrl: malformed ? null : (incomplete ? intermediateUrl : movedUrl),
          status: statuses[0]
        }]
      : [{
          fromUrl: oldUrl,
          toUrl: intermediateUrl,
          status: statuses[0]
        }, {
          fromUrl: discontinuous
            ? 'https://unrelated.example.test/missing-hop.xml'
            : intermediateUrl,
          toUrl: movedUrl,
          status: statuses[1]
        }];
    mocked.acquire.mockImplementation(async ({ url }) => url === oldUrl
      ? successfulOutcome({
          url: movedUrl,
          redirects,
          body: rssBody('Unrelated moved feed', [])
        })
      : missingOutcome(url));

    const result = await discoverRssLink(oldUrl, feed, {
      includeParsedFeed: true
    });

    expect(result).toMatchObject(accepted
      ? {
          url: movedUrl,
          recovery: { accepted: true, kind: 'http_redirect' }
        }
      : {
          url: null,
          recovery: {
            accepted: false,
            code: 'FEED_RECOVERY_IDENTITY_UNVERIFIED',
            kind: 'http_redirect'
          }
        });
    expect(await Feed.findByPk(feed.id)).toMatchObject({
      url: accepted ? movedUrl : oldUrl
    });
    const aliases = await FeedUrlAlias.findAll({
      where: { feedId: feed.id },
      order: [['originalUrl', 'ASC']]
    });
    if (accepted) {
      expect(aliases.map(alias => alias.originalUrl)).toEqual(
        expect.arrayContaining([oldUrl, movedUrl])
      );
      if (statuses.length > 1) {
        expect(aliases.map(alias => alias.originalUrl)).toContain(intermediateUrl);
      }
    } else {
      expect(aliases).toHaveLength(0);
    }
  });

  it('accepts a mixed redirect chain only with sufficient same-feed evidence', async () => {
    const oldUrl = 'https://publisher.example.test/sections/identity.xml';
    const intermediateUrl = 'https://edge.example.test/identity.xml';
    const movedUrl = 'https://publisher.example.test/feeds/identity.xml';
    const entry = {
      guid: unique('redirect-overlap'),
      url: 'https://publisher.example.test/articles/identity'
    };
    const { feed } = await createEstablishedFeed({ url: oldUrl, entries: [entry] });
    mocked.acquire.mockResolvedValue(successfulOutcome({
      url: movedUrl,
      redirects: [
        { fromUrl: oldUrl, toUrl: intermediateUrl, status: 302 },
        { fromUrl: intermediateUrl, toUrl: movedUrl, status: 301 }
      ],
      body: rssBody('Established section feed', [entry])
    }));

    const result = await discoverRssLink(oldUrl, feed, {
      includeParsedFeed: true
    });

    expect(result).toMatchObject({
      url: movedUrl,
      recovery: {
        accepted: true,
        kind: 'http_redirect',
        evidence: { overlapMatch: true, sharedEntries: 1 }
      }
    });
    expect(await Feed.findByPk(feed.id)).toMatchObject({ url: movedUrl });
    expect((await FeedUrlAlias.findAll({ where: { feedId: feed.id } }))
      .map(alias => alias.originalUrl)).toEqual(expect.arrayContaining([
        oldUrl,
        intermediateUrl,
        movedUrl
      ]));
  });

  it.each([
    { label: 'unchanged through 301', type: 'unchanged', status: 200, redirect: 301, accepted: true },
    { label: '304 through 308', type: 'not_modified', status: 304, redirect: 308, accepted: true },
    { label: '304 through 302', type: 'not_modified', status: 304, redirect: 302, accepted: false },
    {
      label: 'unchanged through 307 with matching body hash',
      type: 'unchanged',
      status: 200,
      redirect: 307,
      accepted: true,
      bodyHashEvidence: true
    }
  ])('handles $label conservatively', async ({
    type,
    status,
    redirect,
    accepted,
    bodyHashEvidence = false
  }) => {
    const oldUrl = `https://conditional.example.test/${unique('old')}.xml`;
    const movedUrl = `https://conditional.example.test/${unique('moved')}.xml`;
    const { feed } = await createEstablishedFeed({ url: oldUrl });
    if (bodyHashEvidence) await feed.update({ contentHash: 'accepted-body-hash' });
    mocked.acquire.mockResolvedValue(successfulOutcome({
      url: movedUrl,
      type,
      status,
      body: null,
      bodyHash: bodyHashEvidence ? 'accepted-body-hash' : null,
      redirects: [{ fromUrl: oldUrl, toUrl: movedUrl, status: redirect }]
    }));

    const result = await discoverRssLink(oldUrl, feed, {
      includeParsedFeed: true
    });

    expect(result).toMatchObject({
      url: accepted ? movedUrl : oldUrl,
      recovery: accepted
        ? { accepted: true, kind: 'http_redirect' }
        : {
            accepted: false,
            code: 'FEED_RECOVERY_IDENTITY_UNVERIFIED'
          }
    });
    expect(await Feed.findByPk(feed.id)).toMatchObject({
      url: accepted ? movedUrl : oldUrl
    });
    expect(await FeedUrlAlias.count({ where: { feedId: feed.id } }))
      .toBe(accepted ? 2 : 0);
  });

  it('keeps mixed redirect discovery broad for an initial subscription', async () => {
    const websiteUrl = 'https://initial-redirect.example.test/news';
    const intermediateUrl = 'https://initial-redirect.example.test/temporary';
    const feedUrl = 'https://feeds.initial-redirect.example.test/news.xml';
    mocked.acquire.mockResolvedValue(successfulOutcome({
      url: feedUrl,
      redirects: [
        { fromUrl: websiteUrl, toUrl: intermediateUrl, status: 302 },
        { fromUrl: intermediateUrl, toUrl: feedUrl, status: 301 }
      ],
      body: rssBody('Initial redirected subscription', [])
    }));

    await expect(discoverRssLink(websiteUrl)).resolves.toBe(feedUrl);
  });

  it.each([
    ['same-origin', 'https://publisher.example.test/feed', 1],
    ['cross-origin', 'https://feeds.example-cdn.test/section.xml', 2]
  ])('accepts %s recovery with meaningful persisted entry overlap', async (
    _label,
    movedUrl,
    overlapCount
  ) => {
    const oldUrl = 'https://publisher.example.test/sections/culture.xml';
    const entries = [
      { guid: unique('overlap-a'), url: 'https://publisher.example.test/articles/a' },
      { guid: unique('overlap-b'), url: 'https://publisher.example.test/articles/b' }
    ].slice(0, overlapCount);
    const { feed } = await createEstablishedFeed({ url: oldUrl, entries });
    const homepage = '<html><head><link rel="alternate" ' +
      `type="application/rss+xml" href="${movedUrl}"></head></html>`;
    mocked.acquire.mockImplementation(async ({ url }) => {
      if (url === oldUrl) return missingOutcome(url);
      if (url === 'https://publisher.example.test') {
        return successfulOutcome({ url, body: homepage, contentType: 'text/html' });
      }
      if (url === movedUrl) {
        return successfulOutcome({
          url,
          body: rssBody('Moved culture section', entries)
        });
      }
      return missingOutcome(url);
    });

    const result = await discoverRssLink(oldUrl, feed, {
      includeParsedFeed: true
    });

    expect(result).toMatchObject({
      url: movedUrl,
      recovery: {
        accepted: true,
        kind: 'html_alternate',
        evidence: { sharedEntries: overlapCount, overlapMatch: true }
      }
    });
    expect(await Feed.findByPk(feed.id)).toMatchObject({ url: movedUrl });
  });

  it('keeps broad HTML alternate discovery for an initial website subscription', async () => {
    const websiteUrl = 'https://new-subscription.example.test/news';
    const feedUrl = 'https://new-subscription.example.test/feed';
    mocked.acquire.mockImplementation(async ({ url }) => {
      if (url === websiteUrl) {
        return successfulOutcome({
          url,
          contentType: 'text/html',
          body: '<html><head><link rel="alternate" ' +
            'type="application/rss+xml" href="/feed"></head></html>'
        });
      }
      if (url === feedUrl) {
        return successfulOutcome({ url, body: rssBody('New subscription', []) });
      }
      return missingOutcome(url);
    });

    await expect(discoverRssLink(websiteUrl)).resolves.toBe(feedUrl);
  });
});
