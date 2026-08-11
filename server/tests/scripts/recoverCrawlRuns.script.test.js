import { beforeAll, describe, expect, it } from 'vitest';
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

  it('recovers only expired heartbeats by default', async () => {
    const now = new Date('2026-08-11T12:00:00.000Z');
    const [staleRun, liveRun] = await Promise.all([
      CrawlRun.create({
        userId: staleUser.id,
        startedAt: new Date('2026-08-11T11:55:00.000Z')
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

    await CrawlRun.update({ status: 'failed', completedAt: now }, {
      where: { id: liveRun.id }
    });
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
