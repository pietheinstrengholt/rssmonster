import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import db from '../../models/index.js';
import saveArticle from '../../services/crawl/persistence/saveArticle.js';
import { enqueueMatchingWebhooks } from '../../services/webhookMatching.js';
import {
  claimWebhookDeliveries,
  expireFinalWebhookAttempts,
  isRetryableWebhookStatus,
  nextWebhookRetryAt,
  processWebhookDelivery,
  sendWebhookRequest,
  signWebhookBody
} from '../../services/webhookDelivery.js';

const { Article, Category, Feed, User, Webhook, WebhookCondition, WebhookDelivery } = db;
let sequence = 0;
const logger = { log: vi.fn() };
const response = status => ({ status, body: { cancel: async () => {} } });
const articleData = suffix => ({
  link: `https://articles.example/${suffix}`,
  title: `Webhook article ${suffix}`,
  contentText: 'Webhook content',
  language: 'en',
  publishedAt: new Date()
});

const fixture = async ({ enabled = true, secret = null, field = 'title', value = 'Webhook' } = {}) => {
  const user = await User.create({ username: `webhook-runtime-${Date.now()}-${++sequence}`, password: 'test-password' });
  const category = await Category.create({ userId: user.id, name: 'Technology' });
  const feed = await Feed.create({ userId: user.id, categoryId: category.id,
    feedName: 'Example Feed', url: `https://feeds.example/${user.id}` });
  const webhook = await Webhook.create({ userId: user.id, name: 'Runtime alerts', enabled,
    endpointUrl: 'http://127.0.0.1:5555/hook', secret, matchMode: 'ALL' });
  await WebhookCondition.create({ webhookId: webhook.id, field, operator: 'contains', value });
  return { user, category, feed, webhook };
};
const createArticle = (feed, suffix) => saveArticle(feed, articleData(suffix), { tags: [] }, { status: 'unread' });

describe('Webhook ingestion and delivery', () => {
  beforeAll(() => { process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64'); });
  afterAll(() => vi.restoreAllMocks());

  it('classifies HTTP retry statuses centrally', () => {
    expect([408, 425, 429, 500, 503].every(isRetryableWebhookStatus)).toBe(true);
    expect([301, 400, 401, 403, 404].some(isRetryableWebhookStatus)).toBe(false);
  });

  it('enqueues only newly accepted matches and ignores retries, filtered rows, and old articles', async () => {
    const { user, feed, webhook } = await fixture();
    try {
      const old = await Article.create({ userId: user.id, feedId: feed.id,
        title: 'Webhook old article', status: 'unread' });
      expect(await WebhookDelivery.count({ where: { articleId: old.id } })).toBe(0);
      const saved = await createArticle(feed, 'match');
      expect(saved.created).toBe(true);
      expect(await WebhookDelivery.count({ where: { webhookId: webhook.id, articleId: saved.article.id } })).toBe(1);
      const repeated = await createArticle(feed, 'match');
      expect(repeated.created).toBe(false);
      await enqueueMatchingWebhooks({ article: saved.article, feed });
      expect(await WebhookDelivery.count({ where: { webhookId: webhook.id, articleId: saved.article.id } })).toBe(1);
      await saveArticle(feed, articleData('filtered'), { tags: [] }, { status: 'unread', shouldDiscard: true });
      expect(await WebhookDelivery.count({ where: { webhookId: webhook.id } })).toBe(1);
    } finally {
      await user.destroy();
    }
  });

  it('does not queue non-matches or disabled webhooks', async () => {
    const { user, feed, webhook } = await fixture({ value: 'never matches' });
    try {
      await createArticle(feed, 'no-match');
      expect(await WebhookDelivery.count({ where: { webhookId: webhook.id } })).toBe(0);
      await WebhookCondition.update({ value: 'Webhook' }, { where: { webhookId: webhook.id } });
      await webhook.update({ enabled: false });
      await createArticle(feed, 'disabled');
      expect(await WebhookDelivery.count({ where: { webhookId: webhook.id } })).toBe(0);
    } finally {
      await user.destroy();
    }
  });

  it('pauses an existing pending delivery while disabled and resumes after re-enable', async () => {
    const { user, feed, webhook } = await fixture();
    try {
      await createArticle(feed, 'pause');
      await webhook.update({ enabled: false });
      expect(await claimWebhookDeliveries({ userId: user.id, now: new Date(Date.now() + 1000) })).toEqual([]);
      await webhook.update({ enabled: true });
      const claimed = await claimWebhookDeliveries({ userId: user.id, now: new Date(Date.now() + 1000) });
      expect(claimed).toHaveLength(1);
      expect(claimed[0].attemptCount).toBe(1);
    } finally {
      await user.destroy();
    }
  });

  it('claims once, sends stable JSON with HMAC, and records success', async () => {
    const { user, feed } = await fixture({ secret: 'integration-secret' });
    try {
      const { article } = await createArticle(feed, 'signed');
      const [claimed, rival] = await Promise.all([
        claimWebhookDeliveries({ userId: user.id, limit: 1, now: new Date(Date.now() + 1000) }),
        claimWebhookDeliveries({ userId: user.id, limit: 1, now: new Date(Date.now() + 1000) })
      ]);
      expect(claimed.length + rival.length).toBe(1);
      const delivery = (claimed[0] || rival[0]);
      let sent;
      const transport = vi.fn(async (url, options, redirects, _fetch, _onRedirect, lifecycle) => {
        sent = { url, options, redirects, lifecycle };
        return response(204);
      });
      const result = await processWebhookDelivery(delivery, { transport, logger });
      expect(result.status).toBe('success');
      expect(sent.options.method).toBe('POST');
      expect(sent.options.headers['Content-Type']).toBe('application/json');
      expect(sent.options.headers['X-RSSMonster-Event']).toBe('article.matched');
      expect(sent.options.headers['X-RSSMonster-Delivery']).toBe(String(delivery.id));
      expect(sent.redirects).toBe(0);
      expect(sent.lifecycle.allowPrivateAddresses).toBe(true);
      const body = sent.options.body;
      expect(JSON.parse(body)).toMatchObject({ version: 1, event: 'article.matched',
        deliveryId: delivery.id, article: { id: article.id, feed: { id: feed.id, title: 'Example Feed' },
          categories: [{ title: 'Technology' }] } });
      expect(JSON.parse(body).article).not.toHaveProperty('contentText');
      expect(sent.options.headers['X-RSSMonster-Signature']).toBe(`sha256=${createHmac('sha256', 'integration-secret').update(body).digest('hex')}`);
      const stored = await WebhookDelivery.findByPk(delivery.id);
      expect(stored).toMatchObject({ status: 'success', attemptCount: 1, httpStatus: 204,
        nextAttemptAt: null, error: null });
      expect(stored.lastAttemptAt).not.toBeNull();
      expect(await claimWebhookDeliveries({ userId: user.id, limit: 1 })).toEqual([]);
    } finally {
      await user.destroy();
    }
  });

  it('retries transient statuses and stops permanent responses or the fifth attempt', async () => {
    const { user, feed, webhook } = await fixture();
    try {
      const { article } = await createArticle(feed, 'retry');
      const [first] = await claimWebhookDeliveries({ userId: user.id, now: new Date(Date.now() + 1000) });
      const now = new Date();
      await processWebhookDelivery(first, { transport: async () => response(429), now: () => now, logger });
      let stored = await WebhookDelivery.findByPk(first.id);
      expect(stored.status).toBe('failed');
      expect(stored.httpStatus).toBe(429);
      expect(stored.nextAttemptAt.getTime()).toBe(
        Math.floor(nextWebhookRetryAt(1, now).getTime() / 1000) * 1000
      );
      const [second] = await claimWebhookDeliveries({ userId: user.id, now: new Date(stored.nextAttemptAt.getTime() + 1000) });
      expect(second.attemptCount).toBe(2);
      await processWebhookDelivery(second, { transport: async () => response(503), now: () => now, logger });
      stored = await WebhookDelivery.findByPk(first.id);
      expect(stored.nextAttemptAt.getTime()).toBe(
        Math.floor(nextWebhookRetryAt(2, now).getTime() / 1000) * 1000
      );

      await stored.update({ attemptCount: 4, nextAttemptAt: new Date(), status: 'failed' });
      const [last] = await claimWebhookDeliveries({ userId: user.id, now: new Date(Date.now() + 1000) });
      expect(last.attemptCount).toBe(5);
      await processWebhookDelivery(last, { transport: async () => response(500), logger });
      stored = await WebhookDelivery.findByPk(first.id);
      expect(stored).toMatchObject({ status: 'failed', attemptCount: 5, nextAttemptAt: null });
      expect(await WebhookDelivery.count({ where: { webhookId: webhook.id, articleId: article.id } })).toBe(1);
      expect(await claimWebhookDeliveries({ userId: user.id })).toEqual([]);

      const { article: permanentArticle } = await createArticle(feed, 'permanent');
      const [permanent] = await claimWebhookDeliveries({ userId: user.id, now: new Date(Date.now() + 1000) });
      await processWebhookDelivery(permanent, { transport: async () => response(400), logger });
      expect((await WebhookDelivery.findOne({ where: { articleId: permanentArticle.id } })).nextAttemptAt).toBeNull();
    } finally {
      await user.destroy();
    }
  });

  it('sanitizes connection and timeout failures and recovers an expired final claim', async () => {
    const { user, feed } = await fixture();
    try {
      await createArticle(feed, 'network');
      const [first] = await claimWebhookDeliveries({ userId: user.id, now: new Date(Date.now() + 1000) });
      await processWebhookDelivery(first, { transport: async () => { throw new Error('secret in remote error'); }, logger });
      let stored = await WebhookDelivery.findByPk(first.id);
      expect(stored.error).toBe('NETWORK_ERROR');
      expect(stored.nextAttemptAt).not.toBeNull();

      const [timedOut] = await claimWebhookDeliveries({
        userId: user.id, now: new Date(stored.nextAttemptAt.getTime() + 1000)
      });
      await processWebhookDelivery(timedOut, { transport: async () => {
        throw new DOMException('Timed out', 'TimeoutError');
      }, logger });
      stored = await WebhookDelivery.findByPk(first.id);
      expect(stored).toMatchObject({ error: 'REQUEST_TIMEOUT', attemptCount: 2, status: 'failed' });
      expect(stored.nextAttemptAt).not.toBeNull();

      await stored.update({ attemptCount: 4, status: 'failed', nextAttemptAt: new Date() });
      const [last] = await claimWebhookDeliveries({ userId: user.id, now: new Date(Date.now() + 1000) });
      await expireFinalWebhookAttempts(new Date(last.nextAttemptAt.getTime() + 1000));
      stored = await WebhookDelivery.findByPk(first.id);
      expect(stored).toMatchObject({ status: 'failed', attemptCount: 5, nextAttemptAt: null,
        error: 'DELIVERY_RESULT_UNAVAILABLE' });

      const controller = new AbortController();
      controller.abort(new DOMException('Timed out', 'TimeoutError'));
      await expect(sendWebhookRequest({ webhook: { endpointUrl: 'http://example.com', secret: null },
        payload: { deliveryId: 1 }, signal: controller.signal,
        transport: async (_url, options) => { throw options.signal.reason; } })).rejects.toMatchObject({ name: 'TimeoutError' });
      expect(signWebhookBody('a', '{}')).not.toBe(signWebhookBody('a', '{"x":1}'));
      expect(signWebhookBody('a', '{}')).toBe(signWebhookBody('a', '{}'));
    } finally {
      await user.destroy();
    }
  });

  it('posts to a LAN endpoint and refuses redirects without contacting the target', async () => {
    const requests = [];
    const server = createServer(async (req, res) => {
      const body = [];
      for await (const chunk of req) body.push(chunk);
      requests.push({ method: req.method, headers: req.headers, body: Buffer.concat(body).toString('utf8') });
      if (req.url === '/redirect') {
        res.writeHead(302, { Location: '/target' }).end();
      } else {
        res.writeHead(204).end();
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const port = server.address().port;
      const webhook = { endpointUrl: `http://127.0.0.1:${port}/hook`, secret: null };
      const payload = { deliveryId: 31, event: 'article.matched' };
      expect(await sendWebhookRequest({ webhook, payload })).toBe(204);
      expect(requests[0]).toMatchObject({ method: 'POST' });
      expect(JSON.parse(requests[0].body)).toEqual(payload);
      expect(requests[0].headers['x-rssmonster-event']).toBe('article.matched');
      expect(requests[0].headers).not.toHaveProperty('x-rssmonster-signature');
      await expect(sendWebhookRequest({
        webhook: { ...webhook, endpointUrl: `http://127.0.0.1:${port}/redirect` }, payload
      })).rejects.toMatchObject({ code: 'REDIRECT_LIMIT_EXCEEDED' });
      expect(requests).toHaveLength(2);
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  });
});
