// Claims due feeds transactionally so concurrent crawl workers cannot overlap.

import { randomUUID } from 'node:crypto';
import db from '../../models/index.js';

const { Feed, Sequelize, sequelize } = db;
const { Op } = Sequelize;

export const DEFAULT_FEED_LEASE_MS = 2 * 60 * 1000;
export const FEED_LEASE_LOST_CODE = 'FEED_LEASE_LOST';
const CLAIM_DEADLOCK_ATTEMPTS = 3;

// Validates one positive integer scheduling input.
const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

// Detects a rolled-back MySQL deadlock that is safe to retry as a whole claim.
const isClaimDeadlock = error => [
  error?.original?.code,
  error?.parent?.code,
  error?.code
].includes('ER_LOCK_DEADLOCK') || /deadlock/i.test(error?.message || '');

// Builds the indexed eligibility predicate shared by all crawl triggers.
export const buildDueFeedWhere = ({ userId = null, now, excludeIds = [] }) => ({
  status: 'active',
  nextFetchAt: { [Op.lte]: now },
  ...(excludeIds.length > 0 ? { id: { [Op.notIn]: excludeIds } } : {}),
  [Op.and]: [
    {
      [Op.or]: [
        { leaseUntil: { [Op.is]: null } },
        { leaseUntil: { [Op.lte]: now } }
      ]
    },
    {
      [Op.or]: [
        { mutedUntil: { [Op.is]: null } },
        { mutedUntil: { [Op.lte]: now } }
      ]
    }
  ],
  ...(userId ? { userId } : {})
});

// Atomically locks, leases, and returns one stable bounded batch of due feeds.
export const claimDueFeeds = async ({
  userId = null,
  limit = 10,
  now = new Date(),
  leaseMs = DEFAULT_FEED_LEASE_MS,
  leaseOwner = randomUUID(),
  excludeIds = []
} = {}) => {
  const boundedLimit = positiveInteger(limit, 10);
  const boundedLeaseMs = positiveInteger(leaseMs, DEFAULT_FEED_LEASE_MS);
  const leaseUntil = new Date(now.getTime() + boundedLeaseMs);

  for (let attempt = 1; attempt <= CLAIM_DEADLOCK_ATTEMPTS; attempt++) {
    try {
      return await sequelize.transaction({
        isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED
      }, async transaction => {
        const feeds = await Feed.findAll({
          where: buildDueFeedWhere({ userId, now, excludeIds }),
          order: [['nextFetchAt', 'ASC'], ['id', 'ASC']],
          limit: boundedLimit,
          transaction,
          lock: transaction.LOCK.UPDATE,
          skipLocked: true
        });
        if (feeds.length === 0) return [];

        for (const feed of feeds) {
          await feed.update({ leaseUntil, leaseOwner }, {
            transaction,
            hooks: false
          });
        }
        return feeds;
      });
    } catch (error) {
      if (attempt === CLAIM_DEADLOCK_ATTEMPTS || !isClaimDeadlock(error)) {
        throw error;
      }
    }
  }

  return [];
};

// Atomically leases one user-owned feed for an explicit manual crawl.
export const claimFeedById = async ({
  feedId,
  userId,
  now = new Date(),
  leaseMs = DEFAULT_FEED_LEASE_MS,
  leaseOwner = randomUUID()
} = {}) => {
  const boundedLeaseMs = positiveInteger(leaseMs, DEFAULT_FEED_LEASE_MS);
  const leaseUntil = new Date(now.getTime() + boundedLeaseMs);

  return sequelize.transaction({
    isolationLevel: Sequelize.Transaction.ISOLATION_LEVELS.READ_COMMITTED
  }, async transaction => {
    const feed = await Feed.findOne({
      where: {
        id: feedId,
        userId,
        [Op.or]: [
          { leaseUntil: { [Op.is]: null } },
          { leaseUntil: { [Op.lte]: now } }
        ]
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true
    });
    if (!feed) return null;

    await feed.update({ leaseUntil, leaseOwner }, { transaction, hooks: false });
    return feed;
  });
};

// Creates the stable ownership error used to stop work after a lease is lost.
export const createFeedLeaseLostError = feedId => {
  const error = new Error(`Feed lease ownership was lost for feed ${feedId}`);
  error.name = 'FeedLeaseLostError';
  error.code = FEED_LEASE_LOST_CODE;
  return error;
};

// Reports whether an error represents lost feed-lease ownership.
export const isFeedLeaseLostError = error =>
  error?.code === FEED_LEASE_LOST_CODE;

// Verifies and locks the current lease owner before a transactional crawl write.
export const assertFeedLeaseOwnership = async (
  { feedId, leaseOwner } = {},
  { transaction = null, now = new Date() } = {}
) => {
  if (!feedId || !leaseOwner) return true;

  const feed = await Feed.findOne({
    attributes: ['id', 'leaseOwner', 'leaseUntil'],
    where: {
      id: feedId,
      leaseOwner,
      leaseUntil: { [Op.gt]: now }
    },
    transaction,
    ...(transaction
      ? { lock: transaction.LOCK.UPDATE }
      : {})
  });
  if (!feed) throw createFeedLeaseLostError(feedId);
  return feed;
};

// Renews only a live lease still owned by the requesting worker.
export const renewFeedLease = async (
  feed,
  { leaseMs = DEFAULT_FEED_LEASE_MS, now = new Date() } = {}
) => {
  if (!feed?.id || !feed?.leaseOwner) return false;

  const boundedLeaseMs = positiveInteger(leaseMs, DEFAULT_FEED_LEASE_MS);
  const leaseUntil = new Date(now.getTime() + boundedLeaseMs);
  const [updatedCount] = await Feed.update({ leaseUntil }, {
    where: {
      id: feed.id,
      leaseOwner: feed.leaseOwner,
      leaseUntil: { [Op.gt]: now }
    }
  });
  if (updatedCount === 0) {
    const stillOwned = await Feed.findOne({
      attributes: ['id', 'leaseUntil'],
      where: {
        id: feed.id,
        leaseOwner: feed.leaseOwner,
        leaseUntil: { [Op.gt]: now }
      }
    });
    if (!stillOwned) return false;
    feed.set({ leaseUntil: stillOwned.leaseUntil });
    return true;
  }

  feed.set({ leaseUntil });
  return true;
};

// Releases a lease without mutating fetch state and only for its current owner.
export const releaseFeedLease = async feed => {
  if (!feed?.id || !feed?.leaseOwner) return false;

  const leaseOwner = feed.leaseOwner;
  const [updatedCount] = await Feed.update({
    leaseUntil: null,
    leaseOwner: null
  }, {
    where: { id: feed.id, leaseOwner }
  });
  if (updatedCount === 0) return false;

  feed.set({ leaseUntil: null, leaseOwner: null });
  return true;
};

// Keeps one actively processed feed leased until its terminal write finishes.
export const startFeedLeaseHeartbeat = (
  feed,
  { leaseMs = DEFAULT_FEED_LEASE_MS } = {}
) => {
  const boundedLeaseMs = positiveInteger(leaseMs, DEFAULT_FEED_LEASE_MS);
  const intervalMs = Math.max(25, Math.floor(boundedLeaseMs / 3));
  const state = { lost: false, error: null };
  let currentFeed = feed;
  let stopped = false;
  let pendingRenewal = Promise.resolve();

  // Renews serially so overlapping timer callbacks cannot reorder lease deadlines.
  const heartbeat = () => {
    if (stopped || state.lost) return pendingRenewal;

    pendingRenewal = pendingRenewal.then(async () => {
      if (stopped || state.lost) return;
      const renewed = await renewFeedLease(currentFeed, { leaseMs: boundedLeaseMs });
      if (!renewed) {
        state.lost = true;
        state.error = createFeedLeaseLostError(currentFeed.id);
      }
    }).catch(error => {
      state.lost = true;
      state.error = createFeedLeaseLostError(currentFeed.id);
      state.error.cause = error;
    });
    return pendingRenewal;
  };

  const intervalId = setInterval(heartbeat, intervalMs);
  intervalId.unref?.();

  return {
    state,
    // Follows a canonical survivor that inherited the same lease during reconciliation.
    retarget(nextFeed) {
      currentFeed = nextFeed;
    },
    // Stops renewal and waits for any in-flight ownership check to settle.
    async stop() {
      stopped = true;
      clearInterval(intervalId);
      await pendingRenewal;
    }
  };
};

// Applies feed changes only while the caller owns a live lease.
export const updateOwnedFeedLease = async (feed, updates, now = new Date()) => {
  if (!feed?.id || !feed?.leaseOwner) return false;

  const [updatedCount] = await Feed.update(updates, {
    where: {
      id: feed.id,
      leaseOwner: feed.leaseOwner,
      leaseUntil: { [Op.gt]: now }
    }
  });
  if (updatedCount === 0) return false;

  feed.set(updates);
  return true;
};

// Commits terminal fetch state and releases only the caller's owned lease.
export const completeFeedLease = async (
  feed,
  terminalState,
  { now = new Date() } = {}
) => {
  if (!feed?.leaseOwner) return false;

  const leaseOwner = feed.leaseOwner;
  return sequelize.transaction(async transaction => {
    const currentFeed = await Feed.findOne({
      where: {
        id: feed.id,
        leaseOwner,
        leaseUntil: { [Op.gt]: now }
      },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!currentFeed) return false;

    const updates = {
      ...terminalState,
      ...(
        currentFeed.updateIntervalMinutes !== null &&
        Number(currentFeed.updateIntervalMinutes) === 0
        ? { nextFetchAt: null }
        : {}
      ),
      leaseUntil: null,
      leaseOwner: null
    };
    const [updatedCount] = await Feed.update(updates, {
      where: {
        id: feed.id,
        leaseOwner,
        leaseUntil: { [Op.gt]: now }
      },
      transaction
    });
    if (updatedCount === 0) return false;
    feed.set(updates);
    return true;
  });
};

export default {
  assertFeedLeaseOwnership,
  buildDueFeedWhere,
  claimDueFeeds,
  claimFeedById,
  completeFeedLease,
  releaseFeedLease,
  renewFeedLease,
  startFeedLeaseHeartbeat,
  updateOwnedFeedLease
};
