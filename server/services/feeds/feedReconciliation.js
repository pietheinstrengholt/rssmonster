// Reconciles same-user feed rows that have converged on one verified endpoint.

import db from '../../models/index.js';
import {
  assertExecutionLeaseOwnership,
  throwIfExecutionExpired
} from './executionDeadline.js';
import { retryDatabaseTransaction } from '../../utils/databaseRetry.js';

const {
  Article,
  ArticleTopic,
  Event,
  Feed,
  FeedUrlAlias,
  Hotlink,
  Sequelize,
  Setting,
  Tag,
  User,
  sequelize
} = db;
const { Op } = Sequelize;

// Compares nullable dates while treating missing values as the least recent.
const dateTime = value => value ? new Date(value).getTime() : Number.NEGATIVE_INFINITY;

// Reports whether a feed lease still protects work owned by a crawler.
const hasLiveLease = (feed, now = Date.now()) =>
  Boolean(feed.leaseOwner) && dateTime(feed.leaseUntil) > now;

// Creates the stable error used to defer reconciliation around another worker.
const createReconciliationLeaseConflictError = feed => {
  const error = new Error(`Feed ${feed.id} is leased by another crawl worker`);
  error.name = 'FeedReconciliationLeaseConflictError';
  error.code = 'FEED_RECONCILIATION_LEASE_CONFLICT';
  return error;
};

// Returns the earlier non-null date so historical crawl coverage is not narrowed.
const earliestDate = (first, second) => {
  if (!first) return second || null;
  if (!second) return first;
  return dateTime(first) <= dateTime(second) ? first : second;
};

// Returns the later non-null date for durable activity and diagnostic history.
const latestDate = (first, second) => {
  if (!first) return second || null;
  if (!second) return first;
  return dateTime(first) >= dateTime(second) ? first : second;
};

// Unions user-defined feed tags without changing their established order.
const mergeFeedTags = (first, second) => {
  const values = [...(Array.isArray(first) ? first : []), ...(Array.isArray(second) ? second : [])];
  return [...new Set(values)];
};

// Ranks stable subscriptions before newer or less-established duplicate rows.
const compareSurvivorCandidates = (first, second) => {
  const firstSuccessful = first.lastSuccessAt ? 1 : 0;
  const secondSuccessful = second.lastSuccessAt ? 1 : 0;
  if (firstSuccessful !== secondSuccessful) return secondSuccessful - firstSuccessful;
  if (first.articleCount !== second.articleCount) return second.articleCount - first.articleCount;
  const createdDifference = dateTime(first.createdAt) - dateTime(second.createdAt);
  if (createdDifference !== 0) return createdDifference;
  return first.id - second.id;
};

// Chooses the feed whose accepted representation owns the most recent HTTP state.
const newestSuccessfulFeed = feeds => [...feeds].sort((first, second) => {
  const successDifference = dateTime(second.lastSuccessAt) - dateTime(first.lastSuccessAt);
  if (successDifference !== 0) return successDifference;
  return compareSurvivorCandidates(first, second);
})[0];

// Builds conservative survivor values while preserving user intent and useful fetch history.
const buildMergedFeedValues = (survivor, losers) => {
  const feeds = [survivor, ...losers];
  const httpSource = newestSuccessfulFeed(feeds);
  // Retains the most recently evaluated publisher declaration and its diagnostics.
  const selfSource = [...feeds].sort((first, second) =>
    dateTime(second.publisherSelfCheckedAt) - dateTime(first.publisherSelfCheckedAt)
  )[0];
  const disabled = feeds.some(feed => feed.status === 'disabled');
  const active = feeds.some(feed => feed.status === 'active');
  const crawlSince = feeds.some(feed => !feed.crawlSince)
    ? null
    : feeds.reduce((value, feed) => earliestDate(value, feed.crawlSince), survivor.crawlSince);

  return {
    categoryId: survivor.categoryId,
    feedName: survivor.feedName,
    feedDesc: survivor.feedDesc || losers.find(feed => feed.feedDesc)?.feedDesc || null,
    feedType: survivor.feedType || losers.find(feed => feed.feedType)?.feedType || null,
    favicon: survivor.favicon || losers.find(feed => feed.favicon)?.favicon || null,
    status: disabled ? 'disabled' : active ? 'active' : 'error',
    mutedUntil: feeds.reduce((value, feed) => latestDate(value, feed.mutedUntil), null),
    updateIntervalMinutes: survivor.updateIntervalMinutes ??
      losers.find(feed => feed.updateIntervalMinutes !== null)?.updateIntervalMinutes ?? null,
    feedTags: feeds.reduce((tags, feed) => mergeFeedTags(tags, feed.feedTags), []),
    itemFilter: survivor.itemFilter ?? losers.find(feed => feed.itemFilter)?.itemFilter ?? null,
    generateEmbeddings: feeds.every(feed => feed.generateEmbeddings !== false),
    applyAiAnalysis: feeds.every(feed => feed.applyAiAnalysis !== false),
    crawlSince,
    etag: httpSource.etag,
    lastModified: httpSource.lastModified,
    contentHash: httpSource.contentHash,
    cacheFreshUntil: httpSource.cacheFreshUntil,
    lastFetched: feeds.reduce((value, feed) => latestDate(value, feed.lastFetched), null),
    lastAttemptAt: feeds.reduce((value, feed) => latestDate(value, feed.lastAttemptAt), null),
    lastSuccessAt: feeds.reduce((value, feed) => latestDate(value, feed.lastSuccessAt), null),
    lastChangedAt: feeds.reduce((value, feed) => latestDate(value, feed.lastChangedAt), null),
    lastPublishedAt: feeds.reduce((value, feed) => latestDate(value, feed.lastPublishedAt), null),
    observedEntryIntervalMs: httpSource.observedEntryIntervalMs ?? survivor.observedEntryIntervalMs,
    nextFetchAt: feeds.reduce((value, feed) => earliestDate(value, feed.nextFetchAt), null),
    consecutiveFailures: Math.min(...feeds.map(feed => Number(feed.consecutiveFailures || 0))),
    errorCount: Math.min(...feeds.map(feed => Number(feed.errorCount || 0))),
    errorMessage: survivor.errorMessage || losers.find(feed => feed.errorMessage)?.errorMessage || null,
    errorSince: feeds.reduce((value, feed) => earliestDate(value, feed.errorSince), null),
    lastFetchOutcome: httpSource.lastFetchOutcome || survivor.lastFetchOutcome,
    publisherSelfUrl: selfSource.publisherSelfUrl,
    publisherSelfStatus: selfSource.publisherSelfStatus,
    publisherSelfCheckedAt: selfSource.publisherSelfCheckedAt,
    publisherSelfDiagnostic: selfSource.publisherSelfDiagnostic,
    leaseUntil: survivor.leaseUntil || losers.find(feed => feed.leaseUntil)?.leaseUntil || null,
    leaseOwner: survivor.leaseOwner || losers.find(feed => feed.leaseOwner)?.leaseOwner || null
  };
};

// Links articles that share a strong feed-local publisher identity.
const buildArticleGroups = articles => {
  const parents = new Map(articles.map(article => [article.id, article.id]));
  const identities = new Map();
  // Resolves the current root while compressing paths for deterministic grouping.
  const find = id => {
    const parent = parents.get(id);
    if (parent === id) return id;
    const root = find(parent);
    parents.set(id, root);
    return root;
  };
  // Joins two identity components under the lower stable article ID.
  const union = (first, second) => {
    const firstRoot = find(first);
    const secondRoot = find(second);
    if (firstRoot === secondRoot) return;
    parents.set(Math.max(firstRoot, secondRoot), Math.min(firstRoot, secondRoot));
  };

  for (const article of articles) {
    const keys = [
      article.urlHash ? `url:${article.urlHash}` : null,
      article.normalizedUrlHash ? `normalized:${article.normalizedUrlHash}` : null,
      article.externalId && article.externalIdType
        ? `external:${article.externalIdType}:${article.externalId}`
        : null
    ].filter(Boolean);
    for (const key of keys) {
      if (identities.has(key)) union(article.id, identities.get(key));
      else identities.set(key, article.id);
    }
  }

  const groups = new Map();
  for (const article of articles) {
    const root = find(article.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(article);
  }
  return [...groups.values()];
};

// Prefers canonical, engaged, established article rows within one overlap group.
const compareArticleCandidates = (first, second) => {
  const firstCanonical = first.duplicateOfArticleId ? 0 : 1;
  const secondCanonical = second.duplicateOfArticleId ? 0 : 1;
  if (firstCanonical !== secondCanonical) return secondCanonical - firstCanonical;
  const firstEngaged = Number(first.favoriteInd || 0) + Number(first.clickedAmount || 0);
  const secondEngaged = Number(second.favoriteInd || 0) + Number(second.clickedAmount || 0);
  if (firstEngaged !== secondEngaged) return secondEngaged - firstEngaged;
  return first.id - second.id;
};

// Merges visible user state and fills missing content without overwriting established values.
const buildMergedArticleValues = (survivor, losers, survivorFeedId) => {
  const values = { feedId: survivorFeedId };
  const excluded = new Set([
    'id', 'userId', 'feedId', 'urlHash', 'normalizedUrlHash', 'createdAt', 'updatedAt',
    'eventId', 'topicId', 'duplicateOfArticleId', 'duplicateCount', 'status', 'filteredInd',
    'favoriteInd', 'negativeInd', 'positiveInd', 'clickedAmount', 'hotInd', 'hotlinks',
    'firstSeen', 'readAt', 'publishedAt', 'modifiedAt'
  ]);
  for (const attribute of Object.keys(Article.rawAttributes)) {
    if (excluded.has(attribute) || Article.rawAttributes[attribute].type?.key === 'VIRTUAL') continue;
    if (survivor.get(attribute) !== null && survivor.get(attribute) !== '') continue;
    const source = losers.find(article => article.get(attribute) !== null && article.get(attribute) !== '');
    if (source) values[attribute] = source.get(attribute);
  }
  const articles = [survivor, ...losers];
  values.status = articles.some(article => article.status === 'read') ? 'read' : survivor.status;
  values.filteredInd = articles.every(article => Boolean(article.filteredInd));
  values.favoriteInd = Math.max(...articles.map(article => Number(article.favoriteInd || 0)));
  values.negativeInd = Math.max(...articles.map(article => Number(article.negativeInd || 0)));
  values.positiveInd = Math.max(...articles.map(article => Number(article.positiveInd || 0)));
  values.clickedAmount = Math.max(...articles.map(article => Number(article.clickedAmount || 0)));
  values.hotInd = Math.max(...articles.map(article => Number(article.hotInd || 0)));
  values.hotlinks = articles.reduce((count, article) => count + Number(article.hotlinks || 0), 0);
  values.firstSeen = articles.reduce((value, article) => earliestDate(value, article.firstSeen), null);
  values.readAt = articles.reduce((value, article) => earliestDate(value, article.readAt), null);
  values.publishedAt = articles.reduce((value, article) => earliestDate(value, article.publishedAt), survivor.publishedAt);
  values.modifiedAt = articles.reduce((value, article) => latestDate(value, article.modifiedAt), null);
  values.duplicateCount = articles.reduce((count, article) => count + Number(article.duplicateCount || 0), 0) + losers.length;
  return values;
};

// Moves unique tags to the retained article and discards only duplicate assignments.
const transferArticleTags = async (
  survivorId,
  loserIds,
  transaction,
  execution
) => {
  throwIfExecutionExpired(execution);
  const tags = await Tag.findAll({
    where: { articleId: { [Op.in]: [survivorId, ...loserIds] } },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const names = new Set(tags.filter(tag => tag.articleId === survivorId).map(tag => tag.name));
  for (const tag of tags.filter(tag => loserIds.includes(tag.articleId))) {
    throwIfExecutionExpired(execution);
    if (names.has(tag.name)) await tag.destroy({ transaction });
    else {
      names.add(tag.name);
      await tag.update({ articleId: survivorId }, { transaction });
    }
  }
};

// Moves semantic topic assignments while combining duplicate confidence and rank state.
const transferArticleTopics = async (
  survivorId,
  loserIds,
  transaction,
  execution
) => {
  throwIfExecutionExpired(execution);
  const topics = await ArticleTopic.findAll({
    where: { articleId: { [Op.in]: [survivorId, ...loserIds] } },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const retained = new Map(topics
    .filter(topic => topic.articleId === survivorId)
    .map(topic => [topic.topicId, topic]));
  for (const topic of topics.filter(topic => loserIds.includes(topic.articleId))) {
    throwIfExecutionExpired(execution);
    const existing = retained.get(topic.topicId);
    if (existing) {
      await existing.update({
        confidence: Math.max(Number(existing.confidence), Number(topic.confidence)),
        rank: Math.min(Number(existing.rank), Number(topic.rank)),
        primaryInd: Boolean(existing.primaryInd || topic.primaryInd)
      }, { transaction });
      await topic.destroy({ transaction });
    } else {
      await topic.update({ articleId: survivorId }, { transaction });
      retained.set(topic.topicId, topic);
    }
  }
};

// Repairs event pointers before overlapping article rows are removed.
const repairArticleEventPointers = async (
  survivor,
  loserIds,
  transaction,
  execution
) => {
  throwIfExecutionExpired(execution);
  const events = await Event.findAll({
    where: {
      userId: survivor.userId,
      [Op.or]: [
        { representativeArticleId: { [Op.in]: loserIds } },
        { developingArticleId: { [Op.in]: loserIds } }
      ]
    },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  for (const event of events) {
    throwIfExecutionExpired(execution);
    if (event.id === survivor.eventId) {
      await event.update({
        ...(loserIds.includes(event.representativeArticleId)
          ? { representativeArticleId: survivor.id }
          : {}),
        ...(loserIds.includes(event.developingArticleId)
          ? { developingArticleId: survivor.id }
          : {})
      }, { transaction });
      continue;
    }
    const replacement = await Article.findOne({
      where: {
        userId: survivor.userId,
        eventId: event.id,
        id: { [Op.notIn]: loserIds }
      },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (loserIds.includes(event.representativeArticleId) && !replacement) {
      await event.destroy({ transaction });
      continue;
    }
    await event.update({
      ...(loserIds.includes(event.representativeArticleId)
        ? { representativeArticleId: replacement.id }
        : {}),
      ...(loserIds.includes(event.developingArticleId)
        ? { developingArticleId: replacement?.id || null }
        : {})
    }, { transaction });
  }
};

// Consolidates overlapping articles and moves non-overlapping articles to the survivor feed.
const transferArticles = async ({
  userId,
  survivor,
  losers,
  transaction,
  execution
}) => {
  await assertExecutionLeaseOwnership(execution, { transaction });
  const feedIds = [survivor.id, ...losers.map(feed => feed.id)];
  const articles = await Article.findAll({
    where: { userId, feedId: { [Op.in]: feedIds } },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });

  for (const group of buildArticleGroups(articles)) {
    throwIfExecutionExpired(execution);
    const includesLoser = group.some(article => article.feedId !== survivor.id);
    if (!includesLoser) continue;
    if (group.length === 1) {
      await Article.update({ feedId: survivor.id }, {
        where: { id: { [Op.in]: group.map(article => article.id) }, userId },
        transaction,
        hooks: false
      });
      continue;
    }

    // Keeps the established survivor-feed article before applying user-state tie breakers.
    const articleSurvivor = [...group].sort((first, second) => {
      const firstOnSurvivor = first.feedId === survivor.id ? 1 : 0;
      const secondOnSurvivor = second.feedId === survivor.id ? 1 : 0;
      if (firstOnSurvivor !== secondOnSurvivor) {
        return secondOnSurvivor - firstOnSurvivor;
      }
      return compareArticleCandidates(first, second);
    })[0];
    const loserArticles = group.filter(article => article.id !== articleSurvivor.id);
    const loserIds = loserArticles.map(article => article.id);
    // Preserves an overlap's established semantic grouping when the retained row lacks one.
    const semanticSource = loserArticles.find(article => article.eventId || article.topicId);
    if (!articleSurvivor.eventId && semanticSource?.eventId) {
      await articleSurvivor.update({ eventId: semanticSource.eventId }, { transaction });
    }
    if (!articleSurvivor.topicId && semanticSource?.topicId) {
      await articleSurvivor.update({ topicId: semanticSource.topicId }, { transaction });
    }
    await repairArticleEventPointers(
      articleSurvivor,
      loserIds,
      transaction,
      execution
    );
    await transferArticleTags(
      articleSurvivor.id,
      loserIds,
      transaction,
      execution
    );
    await transferArticleTopics(
      articleSurvivor.id,
      loserIds,
      transaction,
      execution
    );
    await articleSurvivor.update({ duplicateOfArticleId: null }, {
      transaction,
      hooks: false
    });
    await Article.update({ duplicateOfArticleId: articleSurvivor.id }, {
      where: {
        id: { [Op.ne]: articleSurvivor.id },
        duplicateOfArticleId: { [Op.in]: loserIds },
        userId
      },
      transaction
    });
    await Hotlink.update({ sourceArticleId: articleSurvivor.id }, {
      where: { sourceArticleId: { [Op.in]: loserIds }, userId },
      transaction
    });
    const mergedValues = buildMergedArticleValues(
      articleSurvivor,
      loserArticles,
      survivor.id
    );
    await Article.destroy({
      where: { id: { [Op.in]: loserIds }, userId },
      transaction
    });
    await articleSurvivor.update(mergedValues, { transaction, hooks: false });
  }
};

// Moves aliases while preserving the widest first/last-seen observation window.
const transferAliases = async ({
  userId,
  survivor,
  losers,
  transaction,
  execution
}) => {
  throwIfExecutionExpired(execution);
  const aliases = await FeedUrlAlias.findAll({
    where: { userId, feedId: { [Op.in]: [survivor.id, ...losers.map(feed => feed.id)] } },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  const retained = new Map(aliases
    .filter(alias => alias.feedId === survivor.id)
    .map(alias => [alias.normalizedUrlHash, alias]));
  for (const alias of aliases.filter(alias => alias.feedId !== survivor.id)) {
    throwIfExecutionExpired(execution);
    const existing = retained.get(alias.normalizedUrlHash);
    if (existing && existing.normalizedUrl === alias.normalizedUrl) {
      await existing.update({
        firstSeenAt: earliestDate(existing.firstSeenAt, alias.firstSeenAt),
        lastSeenAt: latestDate(existing.lastSeenAt, alias.lastSeenAt)
      }, { transaction });
      await alias.destroy({ transaction });
    } else {
      await alias.update({ feedId: survivor.id }, { transaction });
      retained.set(alias.normalizedUrlHash, alias);
    }
  }
};

// Executes one idempotent same-user merge inside the caller's transaction.
const reconcileInTransaction = async ({
  userId,
  feedIds,
  transaction,
  beforeDelete,
  preferredSurvivorId,
  execution
}) => {
  await User.findByPk(userId, {
    attributes: ['id'],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  await assertExecutionLeaseOwnership(execution, { transaction });
  const stableIds = [...new Set(feedIds.map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
  const feeds = await Feed.findAll({
    where: { userId, id: { [Op.in]: stableIds } },
    order: [['id', 'ASC']],
    transaction,
    lock: transaction.LOCK.UPDATE
  });
  throwIfExecutionExpired(execution);
  if (feeds.length === 0) throw new Error('No user-owned feed remains to reconcile');
  if (feeds.length === 1) return { survivor: feeds[0], loserIds: [], reconciled: false };
  const leaseCheckAt = Date.now();
  const callerLeaseOwner = execution.lease?.leaseOwner || null;
  const foreignLeasedFeed = feeds.find(feed =>
    hasLiveLease(feed, leaseCheckAt) && feed.leaseOwner !== callerLeaseOwner
  );
  if (foreignLeasedFeed) throw createReconciliationLeaseConflictError(foreignLeasedFeed);

  const counts = await Article.findAll({
    attributes: ['feedId', [sequelize.fn('COUNT', sequelize.col('id')), 'articleCount']],
    where: { userId, feedId: { [Op.in]: feeds.map(feed => feed.id) } },
    group: ['feedId'],
    raw: true,
    transaction
  });
  throwIfExecutionExpired(execution);
  const countByFeedId = new Map(counts.map(row => [Number(row.feedId), Number(row.articleCount)]));
  for (const feed of feeds) feed.articleCount = countByFeedId.get(feed.id) || 0;
  const survivor = feeds.find(feed => feed.id === preferredSurvivorId) ||
    [...feeds].sort(compareSurvivorCandidates)[0];
  const losers = feeds.filter(feed => feed.id !== survivor.id);
  const callerLeaseFeed = feeds.find(feed =>
    feed.id === Number(execution.lease?.feedId) &&
    feed.leaseOwner === callerLeaseOwner &&
    hasLiveLease(feed, leaseCheckAt)
  );

  await transferArticles({ userId, survivor, losers, transaction, execution });
  throwIfExecutionExpired(execution);
  await transferAliases({ userId, survivor, losers, transaction, execution });
  throwIfExecutionExpired(execution);
  await Hotlink.update({ feedId: survivor.id }, {
    where: { userId, feedId: { [Op.in]: losers.map(feed => feed.id) } },
    transaction
  });
  throwIfExecutionExpired(execution);
  await Setting.update({ feedId: String(survivor.id) }, {
    where: { userId, feedId: { [Op.in]: losers.map(feed => String(feed.id)) } },
    transaction
  });
  throwIfExecutionExpired(execution);
  const mergedFeedValues = buildMergedFeedValues(survivor, losers);
  if (
    callerLeaseFeed &&
    callerLeaseFeed.id !== survivor.id &&
    !hasLiveLease(survivor, leaseCheckAt)
  ) {
    mergedFeedValues.leaseUntil = callerLeaseFeed.leaseUntil;
    mergedFeedValues.leaseOwner = callerLeaseFeed.leaseOwner;
  }
  await survivor.update(mergedFeedValues, { transaction });
  if (beforeDelete) await beforeDelete({ survivor, losers, transaction });
  throwIfExecutionExpired(execution);
  await Feed.destroy({
    where: { userId, id: { [Op.in]: losers.map(feed => feed.id) } },
    transaction
  });
  await assertExecutionLeaseOwnership(execution, { transaction });
  return { survivor, loserIds: losers.map(feed => feed.id), reconciled: true };
};

// Reconciles duplicate feeds atomically and returns the durable surviving identity.
export const reconcileDuplicateFeeds = async ({
  userId,
  feedIds,
  transaction = null,
  beforeDelete = null,
  preferredSurvivorId = null,
  execution = {}
}) => {
  if (!userId || !Array.isArray(feedIds) || feedIds.length === 0) {
    throw new TypeError('A user and at least one feed are required for reconciliation');
  }
  throwIfExecutionExpired(execution);
  if (transaction) {
    return reconcileInTransaction({
      userId,
      feedIds,
      transaction,
      beforeDelete,
      preferredSurvivorId,
      execution
    });
  }
  return retryDatabaseTransaction(sequelize, innerTransaction => reconcileInTransaction({
    userId,
    feedIds,
    transaction: innerTransaction,
    beforeDelete,
    preferredSurvivorId,
    execution
  }));
};

export default { reconcileDuplicateFeeds };
