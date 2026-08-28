import { beforeEach, describe, expect, it } from 'vitest';
import db from '../../models/index.js';
import {
  acquireCrawlPriorityLease,
  CRAWL_PRIORITY_LEASE_KEY,
  isCrawlPriorityLeaseActive,
  releaseCrawlPriorityLease,
  withCrawlPriorityLease
} from '../../services/jobs/crawlPriorityLease.js';

describe('crawl priority lease service', () => {
  beforeEach(async () => {
    await db.WorkerLease.destroy({
      where: {
        [db.Sequelize.Op.or]: [
          { key: CRAWL_PRIORITY_LEASE_KEY },
          { key: { [db.Sequelize.Op.like]: `${CRAWL_PRIORITY_LEASE_KEY}:%` } }
        ]
      }
    });
  });

  it('keeps the gate active for concurrent crawl holders until both release it', async () => {
    const now = new Date('2026-08-28T10:00:00.000Z');
    const first = await acquireCrawlPriorityLease({
      owner: 'crawl-a',
      now,
      leaseMs: 10_000
    });
    const second = await acquireCrawlPriorityLease({
      owner: 'crawl-b',
      now: new Date(now.getTime() + 5_000),
      leaseMs: 10_000
    });

    expect(first.acquired).toBe(true);
    expect(second.acquired).toBe(true);
    expect(await isCrawlPriorityLeaseActive({
      now: new Date(now.getTime() + 5_001)
    })).toBe(true);
    expect(await releaseCrawlPriorityLease({
      owner: 'crawl-a'
    })).toBe(true);
    expect(await isCrawlPriorityLeaseActive({
      now: new Date(now.getTime() + 5_002)
    })).toBe(true);
    expect(await releaseCrawlPriorityLease({
      owner: 'crawl-b'
    })).toBe(true);
    expect(await isCrawlPriorityLeaseActive({
      now: new Date(now.getTime() + 5_003)
    })).toBe(false);
  });

  it('holds the priority lease for the operation and releases it afterward', async () => {
    let activeDuringOperation = false;

    await withCrawlPriorityLease(async () => {
      activeDuringOperation = await isCrawlPriorityLeaseActive();
    }, {
      owner: 'crawl-operation',
      environment: {
        CRAWL_PRIORITY_LEASE_MS: '10000',
        CRAWL_PRIORITY_HEARTBEAT_MS: '5000'
      },
      logger: { error: () => {} }
    });

    expect(activeDuringOperation).toBe(true);
    expect(await isCrawlPriorityLeaseActive()).toBe(false);
  });
});
