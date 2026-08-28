import { randomUUID } from 'node:crypto';
import db from '../../models/index.js';

const { Sequelize, WorkerLease } = db;
const { Op } = Sequelize;

export const CRAWL_PRIORITY_LEASE_KEY = 'crawl_critical_pipeline';
export const DEFAULT_CRAWL_PRIORITY_LEASE_MS = 90_000;
export const DEFAULT_CRAWL_PRIORITY_HEARTBEAT_MS = 30_000;

const positiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const leaseConfig = environment => ({
  leaseMs: positiveInteger(
    environment.CRAWL_PRIORITY_LEASE_MS,
    DEFAULT_CRAWL_PRIORITY_LEASE_MS
  ),
  heartbeatMs: positiveInteger(
    environment.CRAWL_PRIORITY_HEARTBEAT_MS,
    DEFAULT_CRAWL_PRIORITY_HEARTBEAT_MS
  )
});

// Acquires or renews the singleton critical-pipeline lease with one fenced owner.
export const acquireCrawlPriorityLease = async ({
  owner = randomUUID(),
  now = new Date(),
  leaseMs = DEFAULT_CRAWL_PRIORITY_LEASE_MS
} = {}) => {
  const leaseUntil = new Date(now.getTime() + positiveInteger(
    leaseMs,
    DEFAULT_CRAWL_PRIORITY_LEASE_MS
  ));
  const [, created] = await WorkerLease.findOrCreate({
    where: { key: CRAWL_PRIORITY_LEASE_KEY },
    defaults: { owner, leaseUntil }
  });
  if (created) return { acquired: true, owner, leaseUntil };

  const [updatedCount] = await WorkerLease.update({ owner, leaseUntil }, {
    where: {
      key: CRAWL_PRIORITY_LEASE_KEY,
      [Op.or]: [
        { owner },
        { leaseUntil: { [Op.lte]: now } }
      ]
    }
  });
  return { acquired: updatedCount === 1, owner, leaseUntil };
};

// Reports whether another process currently owns the crawl-critical resource gate.
export const isCrawlPriorityLeaseActive = async ({ now = new Date() } = {}) => Boolean(
  await WorkerLease.findOne({
    attributes: ['key'],
    where: {
      key: CRAWL_PRIORITY_LEASE_KEY,
      leaseUntil: { [Op.gt]: now }
    },
    raw: true
  })
);

export const releaseCrawlPriorityLease = async ({ owner, now = new Date() }) => {
  const [updatedCount] = await WorkerLease.update({ leaseUntil: now }, {
    where: { key: CRAWL_PRIORITY_LEASE_KEY, owner }
  });
  return updatedCount === 1;
};

// Holds a renewable database-visible lease for the full deterministic crawl pipeline.
export const withCrawlPriorityLease = async (operation, {
  environment = process.env,
  logger = console,
  owner = randomUUID()
} = {}) => {
  if (typeof operation !== 'function') throw new TypeError('operation must be a function');
  const config = leaseConfig(environment);
  const initial = await acquireCrawlPriorityLease({ owner, leaseMs: config.leaseMs });
  if (!initial.acquired) {
    const error = new Error('Another crawl worker owns the critical-pipeline lease');
    error.code = 'CRAWL_PRIORITY_LEASE_BUSY';
    throw error;
  }

  let heartbeatError = null;
  const heartbeat = setInterval(() => {
    acquireCrawlPriorityLease({ owner, leaseMs: config.leaseMs })
      .then(result => {
        if (!result.acquired) {
          const error = new Error('Crawl critical-pipeline lease ownership was lost');
          error.code = 'CRAWL_PRIORITY_LEASE_LOST';
          heartbeatError = error;
        }
      })
      .catch(error => {
        heartbeatError = error;
        logger.error('[CrawlPriorityLease] Heartbeat failed:', error);
      });
  }, Math.min(config.heartbeatMs, Math.max(1000, Math.floor(config.leaseMs / 3))));
  heartbeat.unref?.();

  try {
    const result = await operation();
    if (heartbeatError) throw heartbeatError;
    return result;
  } finally {
    clearInterval(heartbeat);
    await releaseCrawlPriorityLease({ owner }).catch(error => {
      logger.error('[CrawlPriorityLease] Release failed:', error);
    });
  }
};

export default {
  acquireCrawlPriorityLease,
  isCrawlPriorityLeaseActive,
  releaseCrawlPriorityLease,
  withCrawlPriorityLease
};
