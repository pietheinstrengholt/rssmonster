// Owns durable crawl-run liveness and fenced state transitions.

import db from '../../models/index.js';

const { CrawlRun, Sequelize } = db;
const { Op } = Sequelize;

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const CRAWL_RUN_HEARTBEAT_INTERVAL_MS = positiveInteger(
  process.env.CRAWL_RUN_HEARTBEAT_INTERVAL_MS,
  30_000
);
export const CRAWL_RUN_STALE_AFTER_MS = Math.max(
  positiveInteger(process.env.CRAWL_RUN_STALE_AFTER_MS, 120_000),
  CRAWL_RUN_HEARTBEAT_INTERVAL_MS * 3
);
export const STALE_CRAWL_ERROR_MESSAGE =
  'Crawl heartbeat expired and the run was marked stale.';

export const createCrawlRunOwnershipLostError = crawlRunId => {
  const error = new Error(`Crawl run ownership was lost for run ${crawlRunId}`);
  error.name = 'CrawlRunOwnershipLostError';
  error.code = 'CRAWL_RUN_OWNERSHIP_LOST';
  return error;
};

// Builds the stale predicate for heartbeat-aware and legacy running rows.
export const buildStaleCrawlRunWhere = (now = new Date()) => {
  const staleBefore = new Date(now.getTime() - CRAWL_RUN_STALE_AFTER_MS);
  return {
    status: 'running',
    [Op.or]: [
      { heartbeatAt: { [Op.lte]: staleBefore } },
      {
        heartbeatAt: { [Op.is]: null },
        startedAt: { [Op.lte]: staleBefore }
      }
    ]
  };
};

export const isStaleCrawlRun = (crawlRun, now = new Date()) => {
  const heartbeatAt = crawlRun?.heartbeatAt || crawlRun?.startedAt;
  const heartbeatTime = new Date(heartbeatAt).getTime();
  return Number.isFinite(heartbeatTime) &&
    heartbeatTime <= now.getTime() - CRAWL_RUN_STALE_AFTER_MS;
};

// Fails stale rows using a compare-and-set predicate so fresh heartbeats win races.
export const failStaleCrawlRuns = async ({ userId = null, now = new Date() } = {}) =>
  CrawlRun.update({
    status: 'failed',
    completedAt: now,
    errorMessage: STALE_CRAWL_ERROR_MESSAGE
  }, {
    where: {
      ...buildStaleCrawlRunWhere(now),
      ...(userId ? { userId } : {})
    }
  });

// Applies one terminal mutation only while this worker still owns the running row.
export const updateOwnedCrawlRun = async (crawlRun, updates) => {
  const [updatedCount] = await CrawlRun.update(updates, {
    where: {
      id: crawlRun.id,
      status: 'running',
      ownerToken: crawlRun.ownerToken
    }
  });
  if (updatedCount === 0) throw createCrawlRunOwnershipLostError(crawlRun.id);
  crawlRun.set(updates);
  return true;
};

// Renews one owned crawl row until stopped or ownership is lost.
export const startCrawlRunHeartbeat = (
  crawlRun,
  { intervalMs = CRAWL_RUN_HEARTBEAT_INTERVAL_MS } = {}
) => {
  const state = { lost: false, error: null };
  let stopped = false;
  let pendingRenewal = Promise.resolve();

  const heartbeat = () => {
    if (stopped || state.lost) return pendingRenewal;
    pendingRenewal = pendingRenewal.then(async () => {
      const heartbeatAt = new Date();
      const [updatedCount] = await CrawlRun.update({ heartbeatAt }, {
        where: {
          id: crawlRun.id,
          status: 'running',
          ownerToken: crawlRun.ownerToken
        }
      });
      if (updatedCount === 0) throw createCrawlRunOwnershipLostError(crawlRun.id);
      crawlRun.set({ heartbeatAt });
    }).catch(error => {
      state.lost = true;
      state.error = error?.code === 'CRAWL_RUN_OWNERSHIP_LOST'
        ? error
        : Object.assign(createCrawlRunOwnershipLostError(crawlRun.id), { cause: error });
    });
    return pendingRenewal;
  };

  const intervalId = setInterval(heartbeat, positiveInteger(intervalMs, 30_000));
  intervalId.unref?.();

  return {
    state,
    heartbeat,
    async stop() {
      stopped = true;
      clearInterval(intervalId);
      await pendingRenewal;
    }
  };
};

export default {
  failStaleCrawlRuns,
  isStaleCrawlRun,
  startCrawlRunHeartbeat,
  updateOwnedCrawlRun
};
