import { createHash, randomUUID } from 'node:crypto';
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

const crawlPriorityHolderKey = owner => {
  if (typeof owner !== 'string' || !owner) throw new TypeError('owner is required');
  const ownerHash = createHash('sha256').update(owner).digest('hex').slice(0, 32);
  return `${CRAWL_PRIORITY_LEASE_KEY}:${ownerHash}`;
};

// Registers or renews one crawl holder without excluding other critical-pipeline producers.
export const acquireCrawlPriorityLease = async ({
  owner = randomUUID(),
  now = new Date(),
  leaseMs = DEFAULT_CRAWL_PRIORITY_LEASE_MS
} = {}) => {
  const leaseUntil = new Date(now.getTime() + positiveInteger(
    leaseMs,
    DEFAULT_CRAWL_PRIORITY_LEASE_MS
  ));
  const key = crawlPriorityHolderKey(owner);
  const [, created] = await WorkerLease.findOrCreate({
    where: { key },
    defaults: { owner, leaseUntil }
  });
  if (created) return { acquired: true, owner, leaseUntil };

  const [updatedCount] = await WorkerLease.update({ owner, leaseUntil }, {
    where: { key, owner }
  });
  return { acquired: updatedCount === 1, owner, leaseUntil };
};

// Reports whether any scheduled, manual, or API crawl currently owns the resource gate.
export const isCrawlPriorityLeaseActive = async ({ now = new Date() } = {}) => Boolean(
  await WorkerLease.findOne({
    attributes: ['key'],
    where: {
      [Op.or]: [
        { key: CRAWL_PRIORITY_LEASE_KEY },
        { key: { [Op.like]: `${CRAWL_PRIORITY_LEASE_KEY}:%` } }
      ],
      leaseUntil: { [Op.gt]: now }
    },
    raw: true
  })
);

export const releaseCrawlPriorityLease = async ({ owner }) => (
  await WorkerLease.destroy({ where: { key: crawlPriorityHolderKey(owner), owner } })
) === 1;

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
  let heartbeatInFlight = null;
  const heartbeat = setInterval(() => {
    if (heartbeatInFlight) return;
    heartbeatInFlight = acquireCrawlPriorityLease({ owner, leaseMs: config.leaseMs })
      .then(result => {
        if (!result.acquired) {
          const error = new Error('Crawl critical-pipeline lease ownership was lost');
          error.code = 'CRAWL_PRIORITY_LEASE_LOST';
          heartbeatError = error;
        } else {
          heartbeatError = null;
        }
      })
      .catch(error => {
        heartbeatError = error;
        logger.error('[CrawlPriorityLease] Heartbeat failed:', error);
      })
      .finally(() => {
        heartbeatInFlight = null;
      });
  }, Math.min(config.heartbeatMs, Math.max(1000, Math.floor(config.leaseMs / 3))));
  heartbeat.unref?.();

  try {
    const result = await operation();
    clearInterval(heartbeat);
    await heartbeatInFlight;
    if (heartbeatError) throw heartbeatError;
    return result;
  } finally {
    clearInterval(heartbeat);
    await heartbeatInFlight;
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
