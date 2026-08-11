import { beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import db from '../../models/index.js';
import {
  CRAWL_RUN_STALE_AFTER_MS,
  failStaleCrawlRuns,
  startCrawlRunHeartbeat,
  updateOwnedCrawlRun
} from '../../services/crawl/crawlRunHeartbeat.js';

const { CrawlRun, User } = db;
const uniqueName = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

describe('crawl run heartbeat ownership', () => {
  let user;

  beforeAll(async () => {
    const username = uniqueName('crawl-heartbeat');
    user = await User.create({
      username,
      password: await bcrypt.hash('secret', 10),
      feverCredentialHash: `${username}-fever`,
      role: 'user'
    });
  });

  it('renews only the currently owned running row', async () => {
    const initialHeartbeat = new Date(Date.now() - 60_000);
    const crawlRun = await CrawlRun.create({
      userId: user.id,
      status: 'running',
      heartbeatAt: initialHeartbeat,
      ownerToken: 'heartbeat-owner'
    });
    const heartbeat = startCrawlRunHeartbeat(crawlRun, { intervalMs: 60_000 });

    await heartbeat.heartbeat();
    await heartbeat.stop();
    await crawlRun.reload();

    expect(heartbeat.state.lost).toBe(false);
    expect(crawlRun.heartbeatAt.getTime()).toBeGreaterThan(initialHeartbeat.getTime());
    await updateOwnedCrawlRun(crawlRun, {
      status: 'completed',
      completedAt: new Date()
    });
  });

  it('fences heartbeat and terminal writes after ownership changes', async () => {
    const crawlRun = await CrawlRun.create({
      userId: user.id,
      status: 'running',
      heartbeatAt: new Date(),
      ownerToken: 'original-owner'
    });
    await CrawlRun.update({ ownerToken: 'replacement-owner' }, {
      where: { id: crawlRun.id }
    });
    const heartbeat = startCrawlRunHeartbeat(crawlRun, { intervalMs: 60_000 });

    await heartbeat.heartbeat();
    await heartbeat.stop();

    expect(heartbeat.state).toMatchObject({
      lost: true,
      error: { code: 'CRAWL_RUN_OWNERSHIP_LOST' }
    });
    await expect(updateOwnedCrawlRun(crawlRun, {
      status: 'completed',
      completedAt: new Date()
    })).rejects.toMatchObject({ code: 'CRAWL_RUN_OWNERSHIP_LOST' });

    await CrawlRun.update({ status: 'failed', completedAt: new Date() }, {
      where: { id: crawlRun.id }
    });
  });

  it('recovers expired heartbeats without failing fresh runs', async () => {
    const now = new Date();
    const staleUser = await User.create({
      username: uniqueName('stale-heartbeat'),
      password: 'secret',
      feverCredentialHash: uniqueName('stale-heartbeat-fever'),
      role: 'user'
    });
    const liveUser = await User.create({
      username: uniqueName('live-heartbeat'),
      password: 'secret',
      feverCredentialHash: uniqueName('live-heartbeat-fever'),
      role: 'user'
    });
    const [staleRun, liveRun] = await Promise.all([
      CrawlRun.create({
        userId: staleUser.id,
        heartbeatAt: new Date(now.getTime() - CRAWL_RUN_STALE_AFTER_MS - 1),
        ownerToken: 'stale-owner'
      }),
      CrawlRun.create({
        userId: liveUser.id,
        heartbeatAt: now,
        ownerToken: 'live-owner'
      })
    ]);

    const [updatedCount] = await failStaleCrawlRuns({ now });
    await Promise.all([staleRun.reload(), liveRun.reload()]);

    expect(updatedCount).toBeGreaterThanOrEqual(1);
    expect(staleRun).toMatchObject({
      status: 'failed',
      errorMessage: 'Crawl heartbeat expired and the run was marked stale.'
    });
    expect(liveRun.status).toBe('running');

    await CrawlRun.update({ status: 'failed', completedAt: new Date() }, {
      where: { id: liveRun.id }
    });
  });
});
