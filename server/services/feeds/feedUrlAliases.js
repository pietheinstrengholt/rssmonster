import db from '../../models/index.js';
import {
  assertExecutionLeaseOwnership,
  throwIfExecutionExpired
} from './executionDeadline.js';
import { buildFeedUrlIdentity } from './feedUrlIdentity.js';
import { assertFeedPersistenceUrl } from './feedPersistenceMetadata.js';
import { reconcileDuplicateFeeds } from './feedReconciliation.js';
import { retryDatabaseTransaction } from '../../utils/databaseRetry.js';

const { Feed, FeedUrlAlias, User, sequelize } = db;

// Reports whether alias persistence must be enclosed by an execution-aware transaction.
const hasExecutionBoundary = execution => Boolean(
  execution?.signal ||
  execution?.deadlineAt !== null && execution?.deadlineAt !== undefined ||
  execution?.leaseState ||
  execution?.assertLeaseOwnership
);

// This error prevents one user's normalized alias from being assigned to two feeds.
export class FeedUrlAliasConflictError extends Error {
  // Captures the deterministic feed that already owns the normalized alias.
  constructor(feedId, normalizedUrl) {
    super('Feed URL alias already belongs to another feed');
    this.name = 'FeedUrlAliasConflictError';
    this.feedId = feedId;
    this.normalizedUrl = normalizedUrl;
  }
}

// Normalizes one candidate into the persistence representation used by alias operations.
const prepareAlias = candidate => {
  const originalUrl = String(candidate.originalUrl || candidate.url || '').trim();
  const identity = buildFeedUrlIdentity(originalUrl);
  return {
    originalUrl,
    aliasType: candidate.aliasType,
    ...identity
  };
};

// Loads an exact alias while verifying the full normalized URL against hash collisions.
const findExactAlias = async ({
  userId,
  normalizedUrl,
  normalizedUrlHash,
  transaction,
  lock = false
}) => {
  const alias = await FeedUrlAlias.findOne({
    where: { userId, normalizedUrlHash },
    transaction,
    ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });

  return alias?.normalizedUrl === normalizedUrl ? alias : null;
};

// Finds a user-owned feed by conservative alias identity without changing its fetch URL.
export const findFeedByUrlAlias = async ({
  userId,
  url,
  transaction,
  lock = false,
  touch = false,
  execution = {}
}) => {
  throwIfExecutionExpired(execution);
  if (touch && !transaction && hasExecutionBoundary(execution)) {
    return sequelize.transaction(innerTransaction => findFeedByUrlAlias({
      userId,
      url,
      transaction: innerTransaction,
      lock,
      touch,
      execution
    }));
  }
  const identity = buildFeedUrlIdentity(url);
  const alias = await findExactAlias({
    userId,
    ...identity,
    transaction,
    lock
  });
  throwIfExecutionExpired(execution);
  if (!alias) return null;

  if (touch) {
    await assertExecutionLeaseOwnership(execution, { transaction });
    await alias.update({ lastSeenAt: new Date() }, { transaction });
    await assertExecutionLeaseOwnership(execution, { transaction });
  }

  const feed = await Feed.findOne({
    where: { id: alias.feedId, userId },
    transaction,
    ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {})
  });
  throwIfExecutionExpired(execution);
  return feed ? { feed, alias, identity } : null;
};

// Creates or touches one alias and recovers deterministically from unique races.
export const registerFeedUrlAlias = async ({
  userId,
  feedId,
  candidate,
  transaction,
  execution = {}
}) => {
  throwIfExecutionExpired(execution);
  if (!transaction && hasExecutionBoundary(execution)) {
    return sequelize.transaction(innerTransaction => registerFeedUrlAlias({
      userId,
      feedId,
      candidate,
      transaction: innerTransaction,
      execution
    }));
  }
  await assertExecutionLeaseOwnership(execution, { transaction });
  const prepared = prepareAlias(candidate);
  let alias = await findExactAlias({
    userId,
    ...prepared,
    transaction,
    lock: Boolean(transaction)
  });

  if (!alias) {
    try {
      alias = await FeedUrlAlias.create({
        userId,
        feedId,
        ...prepared,
        firstSeenAt: new Date(),
        lastSeenAt: new Date()
      }, { transaction });
    } catch (error) {
      if (error?.name !== 'SequelizeUniqueConstraintError') throw error;
      alias = await findExactAlias({
        userId,
        ...prepared,
        transaction,
        lock: Boolean(transaction)
      });
      if (!alias) throw error;
    }
  }

  throwIfExecutionExpired(execution);
  if (alias.feedId !== feedId) {
    throw new FeedUrlAliasConflictError(alias.feedId, prepared.normalizedUrl);
  }

  if (!alias.isNewRecord) {
    await alias.update({ lastSeenAt: new Date() }, { transaction });
  }
  await assertExecutionLeaseOwnership(execution, { transaction });
  return alias;
};

// Registers each distinct normalized URL once while preserving observation order.
export const registerFeedUrlAliases = async ({
  userId,
  feedId,
  candidates,
  transaction,
  execution = {}
}) => {
  throwIfExecutionExpired(execution);
  if (!transaction && hasExecutionBoundary(execution)) {
    return sequelize.transaction(innerTransaction => registerFeedUrlAliases({
      userId,
      feedId,
      candidates,
      transaction: innerTransaction,
      execution
    }));
  }
  await assertExecutionLeaseOwnership(execution, { transaction });
  const seen = new Set();
  const aliases = [];

  for (const candidate of candidates) {
    const prepared = prepareAlias(candidate);
    if (seen.has(prepared.normalizedUrl)) continue;
    seen.add(prepared.normalizedUrl);
    aliases.push(await registerFeedUrlAlias({
      userId,
      feedId,
      candidate,
      transaction,
      execution
    }));
  }
  await assertExecutionLeaseOwnership(execution, { transaction });
  return aliases;
};

// Persists an existing crawl-time URL transition with historical provenance.
export const persistDiscoveredFeedUrl = async ({
  feed,
  discoveredUrl,
  aliases = [],
  execution = {}
}) => {
  if (!feed?.id || !feed?.userId || !discoveredUrl) {
    return feed;
  }
  const persistedUrl = assertFeedPersistenceUrl(discoveredUrl);

  throwIfExecutionExpired(execution);
  const resolvedFeed = await retryDatabaseTransaction(sequelize, async transaction => {
    await User.findByPk(feed.userId, {
      attributes: ['id'],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    await assertExecutionLeaseOwnership(execution, { transaction });
    let current = await Feed.findOne({
      where: { id: feed.id, userId: feed.userId },
      transaction
    });
    if (!current) {
      current = (await findFeedByUrlAlias({
        userId: feed.userId,
        url: feed.url,
        transaction,
        execution
      }))?.feed;
    }
    if (!current) throw new Error('Feed was removed before URL promotion completed');
    const candidates = [
      { originalUrl: current.url, aliasType: 'historical' },
      { originalUrl: persistedUrl, aliasType: 'final' },
      ...aliases
    ];
    const ownerIds = [];
    let preferredSurvivorId = null;
    for (const candidate of candidates) {
      throwIfExecutionExpired(execution);
      const aliasOwner = await findFeedByUrlAlias({
        userId: current.userId,
        url: candidate.originalUrl,
        transaction,
        execution
      });
      const exactOwner = await Feed.findOne({
        where: { userId: current.userId, url: candidate.originalUrl },
        transaction
      });
      for (const ownerId of [aliasOwner?.feed.id, exactOwner?.id]) {
        if (ownerId && ownerId !== current.id) ownerIds.push(ownerId);
      }
      if (candidate.originalUrl === persistedUrl) {
        preferredSurvivorId = exactOwner?.id || aliasOwner?.feed.id || null;
      }
    }
    if (ownerIds.length > 0) {
      const reconciliation = await reconcileDuplicateFeeds({
        userId: current.userId,
        feedIds: [current.id, ...new Set(ownerIds)],
        transaction,
        preferredSurvivorId,
        execution
      });
      current = reconciliation.survivor;
    }

    throwIfExecutionExpired(execution);
    await registerFeedUrlAliases({
      userId: current.userId,
      feedId: current.id,
      candidates,
      transaction,
      execution
    });
    throwIfExecutionExpired(execution);
    if (current.url !== persistedUrl) {
      await current.update({ url: persistedUrl }, { transaction });
    }
    throwIfExecutionExpired(execution);
    await assertExecutionLeaseOwnership(execution, { transaction });
    return current;
  });
  execution.retargetLease?.(resolvedFeed);
  if (feed.id === resolvedFeed.id) feed.set?.('url', persistedUrl);
  throwIfExecutionExpired(execution);
  return resolvedFeed;
};

export default {
  findFeedByUrlAlias,
  persistDiscoveredFeedUrl,
  registerFeedUrlAlias,
  registerFeedUrlAliases
};
