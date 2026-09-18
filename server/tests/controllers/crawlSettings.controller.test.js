import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import db from '../../models/index.js';
import { getJwtSecret } from '../../config/auth.js';
import { CRAWL_FIELDS, withCrawlSettings, getCrawlWorkerInterval, saveCrawlSettings } from '../../services/crawl/configuration.js';
import { getCrawlEnvironment } from '../../config/crawlSettings.js';
import { getFeedInputLimits } from '../../services/feeds/feedsmith/feedInputLimits.js';
import { parseFeedSourceIsolated } from '../../services/feeds/feedsmith/isolatedFeedParser.js';
import { getFeedResponseMaxBytes } from '../../services/feeds/http/responseBody.js';
import { resolveFeedConnectTimeoutMs, resolveFeedBodyTimeoutMs } from '../../services/feeds/http/contracts.js';
import { resolveFeedTimeoutMs } from '../../services/feeds/executionDeadline.js';
import { resolveCrawlRunStaleAfterMs, isStaleCrawlRun } from '../../services/crawl/crawlRunHeartbeat.js';
import { resolveEffectiveCrawlConfiguration } from '../../config/databaseRuntime.js';

let app, admin, user;
const token = person => `Bearer ${jwt.sign({ userId: person.id }, getJwtSecret())}`;
const endpoint = (method, person = admin) => request(app)[method]('/api/setting/server/crawl').set('Authorization', token(person));
const values = changes => ({ ...Object.fromEntries(CRAWL_FIELDS.map(field => [field.key, field.suggestedValue ?? field.defaultValue])), ...changes });
beforeAll(async () => {
  app = (await import('../../app.js')).default;
  admin = await db.User.create({ username: 'crawl-settings-admin', password: 'hash', role: 'admin' });
  user = await db.User.create({ username: 'crawl-settings-user', password: 'hash' });
});
beforeEach(async () => { await db.ServerSetting.destroy({ where: { key: 'crawlConfiguration' } }); });
afterEach(async () => {
  await db.ServerSetting.destroy({ where: { key: 'crawlConfiguration' } });
  vi.unstubAllEnvs();
});
describe('crawl settings API and runtime', () => {
  it.each(['get', 'put', 'delete'])('requires a current administrator for %s', async method => {
    expect((await request(app)[method]('/api/setting/server/crawl')).status).toBe(400);
    expect((await endpoint(method, user)).status).toBe(403);
    await admin.update({ role: 'user' });
    try { expect((await endpoint(method)).status).toBe(403); } finally { await admin.update({ role: 'admin' }); }
  });
  it('stores all 18 fields together and restores current environment values', async () => {
    vi.stubEnv('FEED_MAX_COUNT', '17');
    expect((await endpoint('get')).body.fields.find(field => field.key === 'FEED_MAX_COUNT').value).toBe(17);
    const input = values({ FEED_MAX_COUNT: 31, CRAWL_WORKER_INTERVAL_MS: 2500 });
    const saved = await endpoint('put').send({ overridden: true, values: input });
    expect(saved.status).toBe(200);
    expect(saved.body.fields).toHaveLength(18);
    expect(saved.body.effectiveLeaseMs).toBe(600000);
    expect((await db.ServerSetting.findByPk('crawlConfiguration')).value).toEqual(input);
    expect(await getCrawlWorkerInterval()).toBe(2500);
    expect((await endpoint('put').send({ overridden: false })).status).toBe(200);
    expect((await endpoint('get')).body.fields.find(field => field.key === 'FEED_MAX_COUNT').value).toBe(17);
    expect(await db.ServerSetting.findByPk('crawlConfiguration')).toBeNull();
  });
  it.each([
    { FEED_MAX_COUNT: 0 }, { FEED_MAX_COUNT: 1.5 }, { FEED_TIMEOUT_MS: 2147483647 },
    { FEED_ORIGIN_MIN_SPACING_MS: -1 }, { CRAWL_PARALLELPROCESSFLAG: 2 }, { FEED_PARSER_MEMORY_MB: '64' },
    { UNKNOWN: 1 }
  ])('rejects invalid settings without replacing the saved group', async changes => {
    await saveCrawlSettings({ overridden: true, values: values() });
    const failed = await endpoint('put').send({ overridden: true, values: values(changes) });
    expect(failed.status).toBe(400);
    expect((await db.ServerSetting.findByPk('crawlConfiguration')).value).toEqual(values());
  });
  it('rejects partial groups and permits zero origin spacing', async () => {
    expect((await endpoint('put').send({ overridden: true, values: { FEED_MAX_COUNT: 1 } })).status).toBe(400);
    expect((await endpoint('put').send({ overridden: true, values: values({ FEED_ORIGIN_MIN_SPACING_MS: 0 }) })).status).toBe(200);
  });
  it('passes one saved snapshot to response limits, deadlines, and disposable parser workers', async () => {
    const original = process.env.FEED_MAX_ENTRIES;
    vi.stubEnv('FEED_CONNECT_TIMEOUT_MS', undefined);
    vi.stubEnv('FEED_BODY_TIMEOUT_MS', undefined);
    await saveCrawlSettings({ overridden: true, values: values({ FEED_MAX_ENTRIES: 1, FEED_RESPONSE_MAX_BYTES: 2048, FEED_HTTP_TIMEOUT_MS: 1234 }) });
    await withCrawlSettings(async () => {
      expect(getFeedInputLimits().entries).toBe(1);
      expect(getFeedResponseMaxBytes()).toBe(2048);
      expect(resolveFeedTimeoutMs()).toBe(300000);
      expect(resolveFeedConnectTimeoutMs()).toBe(1234);
      expect(resolveFeedBodyTimeoutMs()).toBe(1234);
      await expect(parseFeedSourceIsolated('<rss version="2.0"><channel><title>Test</title><item><title>One</title></item><item><title>Two</title></item></channel></rss>')).rejects.toMatchObject({ code: 'FEED_INPUT_LIMIT_EXCEEDED', field: 'entry count' });
      await saveCrawlSettings({ overridden: true, values: values({ FEED_MAX_ENTRIES: 3 }) });
      expect(getFeedInputLimits().entries).toBe(1);
    });
    await withCrawlSettings(() => { expect(getFeedInputLimits().entries).toBe(3); });
    expect(process.env.FEED_MAX_ENTRIES).toBe(original);
  });
  it('keeps a fresh heartbeat live and preserves SQLite safety and explicit HTTP phase timeouts', async () => {
    vi.stubEnv('FEED_CONNECT_TIMEOUT_MS', '111'); vi.stubEnv('FEED_BODY_TIMEOUT_MS', '222');
    await saveCrawlSettings({ overridden: true, values: values({ CRAWL_PARALLELPROCESSFLAG: 1 }) });
    await withCrawlSettings(() => {
      expect(resolveCrawlRunStaleAfterMs()).toBe(3600000);
      const now = new Date();
      expect(isStaleCrawlRun({ startedAt: new Date(0), heartbeatAt: now }, now)).toBe(false);
      expect(isStaleCrawlRun({ heartbeatAt: new Date(now.getTime() - 3600001) }, now)).toBe(true);
      expect(resolveEffectiveCrawlConfiguration({ dialect: 'sqlite', environment: getCrawlEnvironment(), logger: { warn() {} } }).parallelProcessFlag).toBe(0);
      expect(resolveFeedConnectTimeoutMs()).toBe(111);
      expect(resolveFeedBodyTimeoutMs()).toBe(222);
    });
  });
});

it('applies the configured heap limit to a disposable parser worker', async () => {
  await saveCrawlSettings({ overridden: true, values: values({ FEED_PARSER_MEMORY_MB: 48, FEED_MAX_TITLE_BYTES: 123 }) });
  const result = await withCrawlSettings(() => parseFeedSourceIsolated('<rss/>', { workerUrl: new URL('../fixtures/feedParserConfigurationWorker.js', import.meta.url) }));
  expect(result.memoryMb).toBe(48);
  expect(result.overrides.FEED_MAX_TITLE_BYTES).toBe(123);
  expect(result.overrides).not.toHaveProperty('JWT_SECRET');
});
