import { CRAWL_FIELDS, saveCrawlSettings } from '../../services/crawl/configuration.js';
import { resolveCrawlRunStaleAfterMs } from '../../services/crawl/crawlRunHeartbeat.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../../models/index.js';
import {
  MANUAL_CRAWL_RESET_ERROR_MESSAGE,
  recoverCrawlRuns
} from '../../scripts/recoverCrawlRuns.js';

const { CrawlRun, User } = db;
const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe('crawl run recovery command', () => {
  let staleUser;
  let liveUser;

  beforeAll(async () => {
    const password = await bcrypt.hash('secret', 10);
    [staleUser, liveUser] = await Promise.all([
      User.create({
        username: uniqueName('recovery-stale'),
        password,
        feverCredentialHash: uniqueName('recovery-stale-fever'),
        role: 'user'
      }),
      User.create({
        username: uniqueName('recovery-live'),
        password,
        feverCredentialHash: uniqueName('recovery-live-fever'),
        role: 'user'
      })
    ]);
  });

  const clearFixtures = async () => {
    await CrawlRun.destroy({ where: { userId: [staleUser.id, liveUser.id] } });
    await db.ServerSetting.destroy({ where: { key: 'crawlConfiguration' } });
  };
  beforeEach(async () => {
    vi.stubEnv('CRAWL_RUN_MAX_RUNNING_MINUTES', '');
    vi.stubEnv('CRAWL_RUN_STALE_AFTER_MS', '120000');
    await clearFixtures();
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await clearFixtures();
  });

  it('recovers only expired heartbeats by default', async () => {
    const now = new Date('2026-08-11T12:00:00.000Z');
    const [staleRun, liveRun] = await Promise.all([
      CrawlRun.create({
        userId: staleUser.id,
        startedAt: new Date(now.getTime() - resolveCrawlRunStaleAfterMs() - 1000)
      }),
      CrawlRun.create({
        userId: liveUser.id,
        heartbeatAt: new Date('2026-08-11T11:59:30.000Z'),
        ownerToken: 'live-owner'
      })
    ]);

    const [updatedCount] = await recoverCrawlRuns({ now });
    await Promise.all([staleRun.reload(), liveRun.reload()]);

    expect(updatedCount).toBe(1);
    expect(staleRun.status).toBe('failed');
    expect(liveRun.status).toBe('running');
  });

  it('uses the saved stale threshold instead of the environment threshold', async () => {
    const now = new Date('2026-08-11T12:00:00.000Z');
    const ageMs = resolveCrawlRunStaleAfterMs() + 1000;
    const minutes = Math.ceil(ageMs / 60000) + 1;
    const run = await CrawlRun.create({ userId: staleUser.id, heartbeatAt: new Date(now.getTime() - ageMs) });
    await saveCrawlSettings({ overridden: true, values: {
      ...Object.fromEntries(CRAWL_FIELDS.map(field => [field.key, field.defaultValue])),
      CRAWL_RUN_MAX_RUNNING_MINUTES: minutes
    } });
    await recoverCrawlRuns({ now });
    expect((await run.reload()).status).toBe('running');
    await recoverCrawlRuns({ now: new Date(now.getTime() + minutes * 60000) });
    expect((await run.reload()).status).toBe('failed');
  });

  it('requires the explicit all option to reset a fresh running row', async () => {
    const now = new Date();
    const run = await CrawlRun.create({
      userId: liveUser.id,
      heartbeatAt: now,
      ownerToken: 'manual-reset-owner'
    });

    const [updatedCount] = await recoverCrawlRuns({ all: true, now });
    await run.reload();

    expect(updatedCount).toBeGreaterThanOrEqual(1);
    expect(run).toMatchObject({
      status: 'failed',
      errorMessage: MANUAL_CRAWL_RESET_ERROR_MESSAGE
    });
    expect(run.completedAt.toISOString()).toBe(now.toISOString().replace(/\.\d{3}Z$/, '.000Z'));
  });
});
