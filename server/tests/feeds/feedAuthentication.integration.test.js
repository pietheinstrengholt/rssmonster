import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import { decryptSecret } from '../../services/secretEncryption.js';
import { acquireFeed } from '../../services/feeds/feedAcquisition.js';
import { normalizeFeedUrl } from '../../services/feeds/feedManagement.js';
import crawlController from '../../controllers/crawl.js';

const http = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('undici', async original => ({ ...(await original()), fetch: http.fetch }));

const authorization = `Basic ${Buffer.from('test:secret').toString('base64')}`;
const xml = '<rss version="2.0"><channel><title>Private feed</title><link>https://private.example.test</link><description>Private news</description><item><guid>authenticated-entry</guid><title>Private entry</title><link>https://private.example.test/article</link><description>Feed content.</description></item></channel></rss>';
const response = (url, status, body = '', headers = {}) => {
  const result = new Response(body, { status, headers });
  Object.defineProperty(result, 'url', { value: String(url) });
  return result;
};
const credentials = { authenticationType: 'basic', authenticationUsername: 'test', authenticationPassword: 'secret' };
let app;
let user;
let category;
let token;

beforeAll(async () => {
  process.env.DISABLE_LISTENER = 'true';
  app = (await import('../../app.js')).default;
});
beforeEach(async () => {
  vi.stubEnv('ENCRYPTION_KEY', Buffer.alloc(32, 7).toString('base64'));
  vi.stubEnv('CRAWL_VERBOSE_LOGGING', 'true');
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  user = await db.User.create({ username: `feed-basic-${randomUUID()}` });
  category = await db.Category.create({ userId: user.id, name: 'Private feeds' });
  token = `Bearer ${jwt.sign({ userId: user.id, username: user.username }, getJwtSecret())}`;
  http.fetch.mockReset().mockImplementation(async (url, options) => {
    if (new Headers(options.headers).get('authorization') !== authorization) return response(url, 401);
    return response(url, 200, xml, { 'content-type': 'application/rss+xml' });
  });
});
afterEach(async () => {
  await user?.destroy();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const validate = (input = {}) => request(app).post('/api/feeds/validate').set('Authorization', token)
  .send({ categoryId: category.id, url: 'https://private.example.test/feed', ...credentials, ...input });

describe('authenticated feed HTTP flow', () => {
  it('validates, stores encrypted credentials, and uses them for scheduled and manual crawls', async () => {
    const validated = await validate();
    expect(validated.status).toBe(200);
    expect(validated.body.feedName).toBe('Private feed');
    const created = await request(app).post('/api/feeds').set('Authorization', token)
      .send({ ...validated.body, ...credentials });
    expect(created.status).toBe(201);
    const id = created.body.feed.id;
    const stored = await db.Feed.findByPk(id, { attributes: { include: ['authenticationPassword'] } });
    expect(stored.authenticationPassword).not.toBe('secret');
    expect(decryptSecret(stored.authenticationPassword)).toBe('secret');
    expect(created.body.feed).not.toHaveProperty('authenticationPassword');
    await db.Feed.update({ generateEmbeddings: false, applyAiAnalysis: false, nextFetchAt: new Date(0) }, { where: { id } });
    http.fetch.mockClear();
    const scheduled = await crawlController.performCrawl(user.id, { triggerType: 'scheduled', parallel: false });
    expect(scheduled).toMatchObject({ processed: 1, errors: 0 });
    expect(http.fetch).toHaveBeenCalled();
    expect(await db.Article.count({ where: { feedId: id } })).toBe(1);
    // Model a later manual refresh across MySQL's second-precision attempt timestamps.
    await db.Feed.update({ lastAttemptAt: new Date(0) }, { where: { id } });
    const manual = await crawlController.performCrawl(user.id, { feedId: id, triggerType: 'api', parallel: false });
    const results = await db.FeedCrawlResult.findAll({ where: { feedId: id } });
    expect(manual, JSON.stringify(results)).toMatchObject({ processed: 1, errors: 0 });
    expect(results).toHaveLength(2);
    const visible = JSON.stringify([validated.body, created.body, results, console.log.mock.calls, console.warn.mock.calls, console.error.mock.calls]);
    expect(visible).not.toContain('test:secret');
    expect(visible).not.toContain(authorization);
    expect(visible).not.toContain('authenticationPassword');
  });

  it.each([[401, 'Authentication failed. Check the username and password.'], [403, 'Access to this feed was denied.']])('reports HTTP %s without echoing credentials', async (status, message) => {
    http.fetch.mockImplementation(async url => response(url, status));
    const result = await validate({ authenticationPassword: 'wrong' });
    expect(result.status).toBe(422);
    expect(result.body.error_msg).toBe(message);
    expect(JSON.stringify(result.body)).not.toContain('wrong');
    expect(JSON.stringify(console.log.mock.calls)).not.toContain(authorization);
  });

  it('rejects missing credentials and URL userinfo before sending requests', async () => {
    for (const field of ['authenticationUsername', 'authenticationPassword']) {
      const result = await validate({ [field]: '' });
      expect(result.status).toBe(400);
      expect(result.body.field).toBe(field);
    }
    expect(() => normalizeFeedUrl('https://test:secret@private.example.test/feed')).toThrow('Feed URL credentials are not allowed');
    expect((await validate({ url: 'https://test:secret@private.example.test/feed' })).status).toBe(400);
    expect(http.fetch).not.toHaveBeenCalled();
  });

  it('ignores stale credentials for public feeds', async () => {
    http.fetch.mockImplementation(async (url, options) => {
      expect(new Headers(options.headers).has('authorization')).toBe(false);
      return response(url, 200, xml);
    });
    expect((await validate({ authenticationType: null })).status).toBe(200);
  });

  it('uses credentials for homepage discovery and its same-origin alternate feed', async () => {
    http.fetch.mockImplementation(async (url, options) => {
      expect(new Headers(options.headers).get('authorization')).toBe(authorization);
      return new URL(url).pathname === '/'
        ? response(url, 200, '<html><head><link rel="alternate" type="application/rss+xml" href="/feed" /></head></html>', { 'content-type': 'text/html' })
        : response(url, 200, xml, { 'content-type': 'application/rss+xml' });
    });
    const result = await validate({ url: 'https://private.example.test/' });
    expect(result.status).toBe(200);
    expect(result.body.url).toBe('https://private.example.test/feed');
    expect(http.fetch.mock.calls.map(([url]) => String(url))).toEqual(['https://private.example.test/', 'https://private.example.test/feed']);
  });

  it('validates an owned existing feed with an unchanged password without replacing it', async () => {
    const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Private feed', url: 'https://private.example.test/feed', ...credentials });
    const encrypted = feed.authenticationPassword;
    const result = await validate({ feedId: feed.id, authenticationPassword: '' });
    expect(result.status).toBe(200);
    expect((await db.Feed.findByPk(feed.id, { attributes: { include: ['authenticationPassword'] } })).authenticationPassword).toBe(encrypted);
    const other = await db.User.create({ username: `other-${randomUUID()}` });
    try {
      const otherCategory = await db.Category.create({ userId: other.id, name: 'Foreign feeds' });
      const foreign = await db.Feed.create({ userId: other.id, categoryId: otherCategory.id, feedName: 'Foreign', url: 'https://other.example.test/feed', ...credentials });
      expect((await validate({ feedId: foreign.id, authenticationPassword: '' })).status).toBe(404);
    } finally { await other.destroy(); }
  });

  it('uses credentials to verify a same-origin publisher self URL', async () => {
    const selfXml = xml.replace('<channel>', '<channel xmlns:atom="http://www.w3.org/2005/Atom"><atom:link href="https://private.example.test/canonical" rel="self" type="application/rss+xml" />');
    http.fetch.mockImplementation(async (url, options) => {
      expect(new Headers(options.headers).get('authorization')).toBe(authorization);
      return response(url, 200, selfXml, { 'content-type': 'application/rss+xml' });
    });
    expect((await validate()).status).toBe(200);
    expect(http.fetch.mock.calls.some(([url]) => new URL(url).pathname === '/canonical')).toBe(true);
  });

  it('preserves validators for unchanged credentials and clears them when credentials change', async () => {
    const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Private feed', url: 'https://private.example.test/feed', etag: 'old-account', contentHash: 'old-hash', ...credentials });
    const edit = body => request(app).put(`/api/feeds/${feed.id}`).set('Authorization', token).send(body);
    expect((await edit({ ...credentials, authenticationPassword: '' })).status).toBe(200);
    expect((await feed.reload()).etag).toBe('old-account');
    expect((await edit({ ...credentials, authenticationPassword: 'wrong' })).status).toBe(200);
    expect(await feed.reload()).toMatchObject({ etag: null, contentHash: null, cacheFreshUntil: null });
    const failed = await crawlController.performCrawl(user.id, { feedId: feed.id, triggerType: 'api', parallel: false });
    expect(failed.errors).toBe(1);
    const records = await db.FeedCrawlResult.findAll({ where: { feedId: feed.id } });
    const diagnostics = JSON.stringify([records, (await feed.reload()).toJSON(), console.log.mock.calls]);
    expect(diagnostics).not.toContain('wrong');
    expect(diagnostics).not.toContain(Buffer.from('test:wrong').toString('base64'));
    expect((await edit(credentials)).status).toBe(200);
    const recovered = await crawlController.performCrawl(user.id, { feedId: feed.id, triggerType: 'api', parallel: false });
    expect(recovered).toMatchObject({ processed: 1, errors: 0 });
  });

  it('does not promote a different-origin redirect and cannot leak credentials on the next crawl', async () => {
    const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Private feed', url: 'https://private.example.test/feed', ...credentials });
    http.fetch.mockImplementation(async (url, options) => {
      if (new URL(url).origin === 'https://private.example.test') return response(url, 301, '', { location: 'https://cdn.example.test/feed' });
      expect(new Headers(options.headers).has('authorization')).toBe(false);
      return response(url, 200, xml);
    });
    for (let count = 0; count < 2; count++) {
      const outcome = await acquireFeed({ url: feed.url, feed: await db.Feed.findByPk(feed.id) });
      expect(outcome.type).toBe('permanent_failure');
      expect(outcome.error.code).toBe('FEED_AUTHENTICATION_ORIGIN_CHANGED');
      expect((await feed.reload()).url).toBe('https://private.example.test/feed');
      expect(JSON.stringify(outcome)).not.toContain(authorization);
    }
  });

  it('keeps an administratively disabled feed disabled when credentials change', async () => {
    const feed = await db.Feed.create({ userId: user.id, categoryId: category.id, feedName: 'Private feed', url: 'https://private.example.test/feed', status: 'disabled', ...credentials });
    const result = await request(app).put(`/api/feeds/${feed.id}`).set('Authorization', token)
      .send({ ...credentials, authenticationPassword: 'replacement' });
    expect(result.status).toBe(200);
    expect(await feed.reload()).toMatchObject({ status: 'disabled', nextFetchAt: null });
  });

  it('does not send credentials to a discovered alternate on another origin', async () => {
    http.fetch.mockImplementation(async (url, options) => {
      if (new URL(url).origin === 'https://private.example.test') {
        expect(new Headers(options.headers).get('authorization')).toBe(authorization);
        return response(url, 200, '<html><head><link rel="alternate" type="application/rss+xml" href="https://other.example.test/feed" /></head></html>', { 'content-type': 'text/html' });
      }
      expect(new Headers(options.headers).has('authorization')).toBe(false);
      return response(url, 200, xml);
    });
    const result = await validate({ url: 'https://private.example.test/' });
    expect(result.status).toBe(422);
    expect(result.body.code).toBe('FEED_AUTHENTICATION_ORIGIN_CHANGED');
    expect(http.fetch.mock.calls.some(([url]) => new URL(url).origin === 'https://other.example.test')).toBe(true);
  });
});
