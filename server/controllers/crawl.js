import db from '../models/index.js';
import { randomUUID } from 'node:crypto';
const { Action, Article, CrawlRun, Hotlink } = db;
import {
  getSequelizeRuntimeCapabilities,
  resolveEffectiveSequelizeCrawlConfiguration
} from '../config/databaseRuntime.js';
import { acquireFeed } from '../services/feeds/feedAcquisition.js';
import {
  classifyCrawlOutcome,
  formatCrawlCompletionLine,
  formatCrawlResultLine,
  CRAWL_OUTCOMES
} from '../services/feeds/crawlResult.js';
import { persistFeedCrawlResult } from '../services/feeds/feedCrawlObservability.js';
import {
  failStaleCrawlRuns,
  isStaleCrawlRun,
  startCrawlRunHeartbeat,
  updateOwnedCrawlRun
} from '../services/crawl/crawlRunHeartbeat.js';
import {
  logFeedDebug,
  sanitizeFeedLogValue
} from '../services/feeds/feedLogging.js';
import {
  DEFAULT_FEED_LEASE_MS,
  assertFeedLeaseOwnership,
  claimDueFeeds,
  claimFeedById,
  completeFeedLease,
  createFeedLeaseLostError,
  releaseFeedLease,
  startFeedLeaseHeartbeat,
  updateOwnedFeedLease
} from '../services/feeds/feedClaims.js';
import {
  buildFetchAttemptState,
  buildFetchOutcomeState
} from '../services/feeds/feedFetchState.js';
import {
  calculateNextFetchAt,
  classifyFetchRetry,
  updateCadenceObservation
} from '../services/feeds/feedScheduling.js';
import {
  FETCH_OUTCOMES,
  createFetchOutcome,
  isSuccessfulFetchOutcome
} from '../services/feeds/http/contracts.js';
import {
  processArticle,
  runPostCrawlSemanticPipeline
} from '../services/crawl/index.js';
import { withExecutionTimeout } from '../services/feeds/executionDeadline.js';
import createArticleDuplicateCache, {
  addSharedUserArticleHashes,
  createSharedUserArticleHashIds
} from '../services/crawl/identity/articleDuplicateCache.js';
import createHotlinkCountCache from '../services/crawl/runtime/hotlinkCountCache.js';
import createHotlinkBatcher from '../services/crawl/runtime/hotlinkBatcher.js';
import { sanitizeFeedPersistenceMetadata } from '../services/feeds/feedPersistenceMetadata.js';
import { sendNewArticlePush } from '../services/push/pushNotifications.js';
import { createStartUserCrawl } from '../services/crawl/startUserCrawl.js';
import { recordProcessingFailure } from '../services/observability/processingFailures.js';
import { withCrawlPriorityLease } from '../services/jobs/crawlPriorityLease.js';

/* ------------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------------ */

const databaseRuntimeCapabilities = getSequelizeRuntimeCapabilities(db.sequelize);
const effectiveCrawlConfiguration =
  resolveEffectiveSequelizeCrawlConfiguration(db.sequelize);

// Resolves the renamed crawl batch limit while temporarily honoring legacy deployments.
export const resolveFeedMaxCount = (environment = process.env) => {
  const configured = Number.parseInt(
    environment.FEED_MAX_COUNT ?? environment.MAX_FEEDCOUNT ?? '',
    10
  );
  return Number.isInteger(configured) && configured > 0 ? configured : 10;
};

// Resolves the application-wide parallel feed worker setting with a conservative default.
export const resolveFeedParallelConcurrency = (environment = process.env) => {
  const configured = Number.parseInt(environment.FEED_PARALLEL_CONCURRENCY ?? '', 10);
  const requested = Number.isInteger(configured) && configured > 0 ? configured : 3;
  return Math.min(
    requested,
    databaseRuntimeCapabilities.maxConcurrentFeedWorkers
  );
};

// Sets the maximum number of feeds processed by one crawl invocation.
const feedCount = resolveFeedMaxCount();

// Bounds simultaneous feed work across all crawl invocations.
const feedParallelConcurrency = resolveFeedParallelConcurrency();
const parallelFeedSlots = { active: 0, waiters: [] };

// Starts queued parallel feed work only while the shared process limit has capacity.
const drainParallelFeedSlots = () => {
  while (parallelFeedSlots.waiters.length > 0) {
    const waiter = parallelFeedSlots.waiters[0];
    if (parallelFeedSlots.active >= waiter.limit) return;
    parallelFeedSlots.waiters.shift();
    parallelFeedSlots.active += 1;
    let released = false;
    waiter.resolve(() => {
      if (released) return;
      released = true;
      parallelFeedSlots.active -= 1;
      drainParallelFeedSlots();
    });
  }
};

// Acquires one process-wide feed slot shared by every concurrent crawl invocation.
const acquireParallelFeedSlot = limit => new Promise(resolve => {
  parallelFeedSlots.waiters.push({ limit, resolve });
  drainParallelFeedSlots();
});

// Timeout wrapper for feed processing (default 60 seconds)
const FEED_TIMEOUT_MS = parseInt(process.env.FEED_TIMEOUT_MS) || 60000;

// Keeps claims beyond the feed deadline while allowing crashed workers to recover.
const FEED_LEASE_MS = Math.max(
  Number.parseInt(process.env.FEED_LEASE_MS, 10) || DEFAULT_FEED_LEASE_MS,
  FEED_TIMEOUT_MS * 2
);

// Overall crawl deadline (default 10 minutes)
const CRAWL_TIMEOUT_MS = parseInt(process.env.CRAWL_TIMEOUT_MS) || 10 * 60 * 1000;

const parsedDuplicateCacheDays = Number.parseInt(process.env.CRAWL_DUPLICATE_CACHE_DAYS, 10);
const DUPLICATE_CACHE_DAYS = Number.isInteger(parsedDuplicateCacheDays) && parsedDuplicateCacheDays > 0
  ? parsedDuplicateCacheDays
  : 30;

// Controls whether feeds are processed in parallel (1) or sequentially (0, default)
const CRAWL_PARALLELPROCESSFLAG = Number(
  effectiveCrawlConfiguration.parallelProcessFlag
);

const ACTIVE_CRAWL_INDEX = 'crawl_runs_active_user_unique';
const CRAWL_TRIGGER_TYPES = new Set(['scheduled', 'api']);

/* ------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------ */

// Helper function to wrap async functions and catch errors
const catchAsync = fn => (req, res, next) => fn(req, res, next).catch(next);

// This function throws the abort reason at safe feed-processing boundaries.
const throwIfAborted = signal => {
  if (!signal?.aborted) return;

  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Feed processing aborted');
};

// This function preserves the crawl controller's timeout helper contract.
export const withTimeout = withExecutionTimeout;

// This function uses nextFetchAt as the scheduling authority for eligible feeds.
const shouldCrawlFeed = (feed, now = new Date()) => {
  if (!feed.nextFetchAt) return false;

  const nextFetchTime = new Date(feed.nextFetchAt).getTime();
  if (Number.isNaN(nextFetchTime)) return true;

  return nextFetchTime <= now.getTime();
};

// Calculates one adaptive deadline from durable feed and neutral outcome state.
const resolveNextFetchAt = (
  feed,
  outcome,
  from,
  activityState = feed
) => {
  const successful =
    outcome.type === FETCH_OUTCOMES.CHANGED ||
    outcome.type === FETCH_OUTCOMES.UNCHANGED ||
    outcome.type === FETCH_OUTCOMES.NOT_MODIFIED;
  const consecutiveFailures = successful
    ? 0
    : Number(feed.consecutiveFailures || 0) + 1;

  return calculateNextFetchAt({
    feedIdentity: feed.id ?? feed.url,
    updateIntervalMinutes: feed.updateIntervalMinutes,
    lastPublishedAt: activityState.lastPublishedAt,
    observedEntryIntervalMs: activityState.observedEntryIntervalMs,
    cacheFreshUntil: outcome.policy?.cacheFreshUntil,
    retryAfterAt: outcome.policy?.retryAfterAt,
    outcomeType: outcome.type,
    httpStatus: outcome.response?.status ?? outcome.error?.status,
    consecutiveFailures
  }, { clock: () => from });
};

// Builds one atomic terminal fetch mutation from the classified neutral outcome.
const buildTerminalFetchState = (
  feed,
  outcome,
  completedAt,
  activityState = feed
) => {
  const failureCount = Number(feed.consecutiveFailures || 0) + 1;
  const retryClassification = classifyFetchRetry({
    outcomeType: outcome.type,
    httpStatus: outcome.response?.status ?? outcome.error?.status,
    consecutiveFailures: failureCount
  });

  return buildFetchOutcomeState({
    feed,
    outcome,
    completedAt,
    nextFetchAt: resolveNextFetchAt(
      feed,
      outcome,
      completedAt,
      activityState
    ),
    diagnosticMessage: outcome.error?.message,
    quarantined: retryClassification.quarantined
  });
};

// Converts a neutral Retry-After deadline into a compact non-negative delay.
const retryAfterSeconds = (outcome, now = new Date()) => {
  const retryAfterAt = outcome?.policy?.retryAfterAt || outcome?.error?.retryAfter;
  if (!retryAfterAt) return null;
  const delayMs = new Date(retryAfterAt).getTime() - now.getTime();
  return Number.isFinite(delayMs) ? Math.max(0, Math.ceil(delayMs / 1000)) : null;
};

/* ------------------------------------------------------------------
 * Feed fetching
 * ------------------------------------------------------------------ */

// Claims one indexed due-feed batch for a user or the scheduled global worker.
const getFeeds = async (
  userId = null,
  limit = feedCount,
  leaseMs = FEED_LEASE_MS,
  excludeIds = [],
  feedId = null
) => {
  if (feedId) {
    const feed = await claimFeedById({ userId, feedId, leaseMs, now: new Date() });
    return feed ? [feed] : [];
  }

  return claimDueFeeds({
    userId,
    limit,
    leaseMs,
    excludeIds,
    now: new Date()
  });
};

// This function loads each crawl user's actions once for the selected feed batch.
const getActionsByUserId = async (feeds) => {
  const userIds = [...new Set(feeds.map(feed => feed.userId).filter(Boolean))];
  const actionsByUserId = new Map(userIds.map(id => [id, []]));

  if (userIds.length === 0) {
    return actionsByUserId;
  }

  const actions = await Action.findAll({
    where: {
      userId: { [db.Sequelize.Op.in]: userIds }
    }
  });

  for (const action of actions) {
    actionsByUserId.get(action.userId)?.push(action);
  }

  return actionsByUserId;
};

// This function fails cache initialization when a seed query omits article filter state.
const assertDuplicateCacheSeedFilterState = article => {
  if (article.filteredInd === undefined || article.filteredInd === null) {
    throw new Error('Duplicate cache seed article is missing filteredInd.');
  }
};

// This function preloads duplicate indexes for every feed in the crawl batch.
const getDuplicateCachesByFeedId = async (feeds) => {
  const feedIds = feeds.map(feed => feed.id);
  const userIds = [...new Set(feeds.map(feed => feed.userId).filter(Boolean))];
  const cachesByFeedId = new Map();

  if (feedIds.length === 0) {
    return cachesByFeedId;
  }

  const duplicateCacheSince = new Date(Date.now() - DUPLICATE_CACHE_DAYS * 24 * 60 * 60 * 1000);

  logFeedDebug(`[Crawl] Building duplicate cache for articles published in the last ${DUPLICATE_CACHE_DAYS} days.`);

  const [feedArticleLists, userContentSourceHashArticles] = await Promise.all([
    Promise.all(feeds.map(feed => Article.findAll({
      attributes: [
        'id',
        'filteredInd',
        'urlHash',
        'normalizedUrlHash',
        'title',
        'publishedAt',
        'contentTextHash',
        'contentSourceHash'
      ],
      where: {
        feedId: feed.id,
        publishedAt: { [db.Sequelize.Op.gte]: duplicateCacheSince }
      },
      raw: true
    }))),
    userIds.length > 0
      ? Article.findAll({
        attributes: ['id', 'userId', 'filteredInd', 'contentTextHash', 'contentSourceHash'],
        where: {
          userId: { [db.Sequelize.Op.in]: userIds },
          [db.Sequelize.Op.or]: [
            { contentTextHash: { [db.Sequelize.Op.not]: null } },
            { contentSourceHash: { [db.Sequelize.Op.not]: null } }
          ],
          publishedAt: { [db.Sequelize.Op.gte]: duplicateCacheSince }
        },
        raw: true
      })
      : []
  ]);

  const articleHashIdsByUserId = new Map(userIds.map(id => [id, createSharedUserArticleHashIds()]));

  for (const article of userContentSourceHashArticles) {
    assertDuplicateCacheSeedFilterState(article);
    const articleHashIds = articleHashIdsByUserId.get(article.userId);
    if (articleHashIds) addSharedUserArticleHashes(articleHashIds, article);
  }

  for (const [index, feed] of feeds.entries()) {
    feedArticleLists[index].forEach(assertDuplicateCacheSeedFilterState);
    cachesByFeedId.set(
      feed.id,
      createArticleDuplicateCache(
        feedArticleLists[index],
        articleHashIdsByUserId.get(feed.userId)
      )
    );
  }

  return cachesByFeedId;
};

// This function preloads hotlink counts for every user in the crawl batch.
const getHotlinkCountCachesByUserId = async (feeds) => {
  const userIds = [...new Set(feeds.map(feed => feed.userId).filter(Boolean))];
  const cachesByUserId = new Map(userIds.map(id => [id, createHotlinkCountCache()]));

  if (userIds.length === 0) {
    return cachesByUserId;
  }

  const hotlinks = await Hotlink.findAll({
    attributes: ['userId', 'feedId', 'url'],
    where: { userId: { [db.Sequelize.Op.in]: userIds } },
    raw: true
  });

  for (const hotlink of hotlinks) {
    cachesByUserId.get(hotlink.userId)?.add(hotlink);
  }

  return cachesByUserId;
};

/* ------------------------------------------------------------------
 * Core crawl logic
 * ------------------------------------------------------------------ */

// This function performs the feed-level work for one crawl invocation.
const runCrawl = async (userId = null, options = {}) => {
  const crawlStartedAt = new Date();
  const crawlTimeoutMs = options.crawlTimeoutMs || CRAWL_TIMEOUT_MS;
  const feedLeaseMs = options.feedLeaseMs || FEED_LEASE_MS;
  const feedTimeoutMs = options.feedTimeoutMs || FEED_TIMEOUT_MS;
  const targetFeedId = options.feedId || null;
  const maximumFeedCount = targetFeedId ? 1 : feedCount;
  const crawlStats = options.crawlStats || {
    newArticles: 0,
    updatedArticles: 0,
    articleErrors: 0,
    errors: 0,
    processedFeeds: 0,
    failedFeeds: 0,
    timedOutFeeds: 0
  };
  const emitProgress = (event) => {
    if (typeof options.onProgress !== 'function') {
      return;
    }

    try {
      options.onProgress(event);
    } catch (err) {
      console.error('Error in onProgress callback:', sanitizeFeedLogValue(err));
    }
  };

  const runParallel = databaseRuntimeCapabilities.parallelFeedProcessing &&
    (options.parallel ?? CRAWL_PARALLELPROCESSFLAG === 1);
  const requestedParallelConcurrency = resolveFeedParallelConcurrency({
    FEED_PARALLEL_CONCURRENCY:
      options.parallelConcurrency ?? feedParallelConcurrency
  });
  const parallelConcurrency = Math.min(
    feedParallelConcurrency,
    requestedParallelConcurrency
  );
  const feeds = [];
  let initialSequentialSlotRelease = null;
  if (!runParallel) {
    initialSequentialSlotRelease = await acquireParallelFeedSlot(
      parallelConcurrency
    );
    try {
      feeds.push(...await getFeeds(userId, 1, feedLeaseMs, [], targetFeedId));
    } catch (error) {
      initialSequentialSlotRelease();
      initialSequentialSlotRelease = null;
      throw error;
    }
    if (feeds.length === 0) {
      initialSequentialSlotRelease();
      initialSequentialSlotRelease = null;
    }
  }

  let processedCount = 0;
  let errorCount = 0;
  let timeoutCount = 0;
  let crawlTimedOut = false;
  let totalNewArticles = 0;
  let totalUpdatedArticles = 0;
  let totalArticleErrors = 0;
  let totalFetchedArticles = 0;
  let totalUnchangedArticles = 0;
  let totalDuplicateArticles = 0;
  let failedFeedCount = 0;
  const feedErrorIds = new Set();
  const processedFeedIds = new Set();
  const terminalFetchFeedIds = new Set();
  const terminalPersistenceAttemptedFeedIds = new Set();
  const survivingFeedsByClaimedFeedId = new Map();
  const acquisitionOutcomesByClaimedFeedId = new Map();
  const activeClaimByResolvedFeedId = new Map();
  const resolvedFeedIdByClaimedFeedId = new Map();
  const supersededClaimedFeedIds = new Set();
  const outcomeCounts = {};
  const feedCrawlObservations = [];
  const processingFailureObservations = [];

  // This function records one terminal error outcome per feed.
  const recordFeedError = (feed, timedOut = false) => {
    if (feedErrorIds.has(feed.id)) return;

    feedErrorIds.add(feed.id);
    errorCount++;
    crawlStats.errors = errorCount;

    if (timedOut) {
      timeoutCount++;
      crawlStats.timedOutFeeds = timeoutCount;
      return;
    }

    failedFeedCount++;
    crawlStats.failedFeeds = failedFeedCount;
  };

  // Counts each claimed feed once when it reaches any terminal result.
  const recordFeedProcessed = feed => {
    if (processedFeedIds.has(feed.id)) return;

    processedFeedIds.add(feed.id);
    processedCount++;
    crawlStats.processedFeeds = processedCount;
  };

  // Emits and counts exactly one terminal operational result for an attempted feed.
  const recordCrawlResult = ({
    feed,
    requestedUrl,
    outcome = null,
    error = null,
    parsedFeed = false,
    itemCount = null,
    durationMs,
    startedAt,
    articlesNew = 0,
    articlesUpdated = 0,
    articlesUnchanged = 0,
    articlesDuplicate = 0
  }) => {
    const category = classifyCrawlOutcome({
      outcome,
      error,
      parsedFeed,
      itemCount
    });
    outcomeCounts[category] = Number(outcomeCounts[category] || 0) + 1;
    totalFetchedArticles += Math.max(0, Number(itemCount) || 0);
    totalUnchangedArticles += Math.max(0, Number(articlesUnchanged) || 0);
    totalDuplicateArticles += Math.max(0, Number(articlesDuplicate) || 0);
    const resolvedUrl = outcome?.discovery?.resolvedUrl || outcome?.url || feed?.url;
    console.log(formatCrawlResultLine({
      category,
      feedUrl: requestedUrl || feed?.url,
      userId: feed?.userId ?? userId,
      resolvedUrl,
      itemCount,
      newArticleCount: articlesNew,
      attempts: outcome?.discovery?.attempts ?? outcome?.attempts ?? 1,
      durationMs,
      httpStatus: outcome?.response?.status ?? outcome?.error?.status ?? null,
      retryAfterSeconds: retryAfterSeconds(outcome),
      errorCode: outcome?.error?.code || error?.code || null,
      message: error?.message || outcome?.error?.message || null
    }));
    feedCrawlObservations.push({
      crawlRunId: options.crawlRunId,
      feed,
      requestedUrl: requestedUrl || feed?.url,
      outcome,
      error,
      category,
      startedAt,
      completedAt: new Date(),
      durationMs,
      itemCount,
      articlesNew,
      articlesUpdated,
      articlesUnchanged,
      articlesDuplicate
    });
    if (![CRAWL_OUTCOMES.SUCCESS, CRAWL_OUTCOMES.EMPTY_FEED].includes(category)) {
      const failureError = error || outcome?.error || null;
      processingFailureObservations.push({
        crawlRunId: options.crawlRunId,
        executionId: options.executionId,
        userId: feed?.userId,
        stage: 'feed_acquisition',
        failureType: category === CRAWL_OUTCOMES.TIMEOUT
          ? 'TIMEOUT'
          : category === CRAWL_OUTCOMES.RATE_LIMITED
            ? 'RATE_LIMITED'
            : [
                CRAWL_OUTCOMES.INVALID_FEED,
                CRAWL_OUTCOMES.MALFORMED_BODY,
                CRAWL_OUTCOMES.VALIDATION_ERROR,
                CRAWL_OUTCOMES.TOO_LARGE
              ].includes(category)
              ? 'INVALID_DATA'
              : null,
        severity: category === CRAWL_OUTCOMES.RECOVERED ? 'WARNING' : 'ERROR',
        code: failureError?.code || category,
        error: failureError instanceof Error ? failureError : null,
        message: failureError?.message || (
          category === CRAWL_OUTCOMES.RECOVERED
            ? 'Feed endpoint recovery was required'
            : `Feed crawl failed with ${category}`
        ),
        subjectType: 'feed',
        subjectId: feed?.id,
        feedId: feed?.id,
        attemptNumber: outcome?.discovery?.attempts ?? outcome?.attempts ?? 1,
        context: {
          category,
          httpStatus: outcome?.response?.status ?? outcome?.error?.status ?? null,
          requestedUrl: requestedUrl || feed?.url,
          resolvedUrl
        }
      });
    }
    return category;
  };

  const crawlDeadline = Date.now() + crawlTimeoutMs;

  logFeedDebug(`Starting crawl for ${feeds.length} feeds (timeout=${crawlTimeoutMs / 1000}s)...`);

  emitProgress({
    type: 'refresh_started',
    feedId: null,
    feedName: null,
    currentFeed: 0,
    totalFeeds: feeds.length,
    newArticles: 0,
    updatedArticles: 0,
    articleErrors: 0,
    errors: 0,
    timeouts: 0,
    processedFeeds: 0
  });

  if (!runParallel && feeds.length === 0) {
    if (!options.suppressDoneEvent) {
      emitProgress({
        type: 'done',
        event: 'refresh_completed',
        feedId: null,
        feedName: null,
        currentFeed: 0,
        totalFeeds: 0,
        newArticles: 0,
        updatedArticles: 0,
        articleErrors: 0,
        errors: 0,
        timeouts: 0,
        processedFeeds: 0,
        crawlTimedOut: false
      });
    }

    const emptyResult = {
      total: 0,
      processed: 0,
      errors: 0,
      timeouts: 0,
      crawlTimedOut: false,
      processedUserIds: userId ? [userId] : [],
      crawlStartedAt,
      totalNewArticles: 0,
      totalUpdatedArticles: 0,
      totalArticleErrors: 0,
      totalFetchedArticles: 0,
      totalUnchangedArticles: 0,
      totalDuplicateArticles: 0,
      failedFeeds: 0,
      timedOutFeeds: 0,
      crawlOutcomes: {}
    };
    console.log('[CRAWL] No feeds due for crawling');
    return emptyResult;
  }

  // Persists exactly one terminal fetch transition for each selected feed.
  const persistTerminalFetchOutcome = async (
    feed,
    outcome,
    completedAt = new Date(),
    activityState = feed,
    additionalState = {}
  ) => {
    if (terminalPersistenceAttemptedFeedIds.has(feed.id)) return false;
    terminalPersistenceAttemptedFeedIds.add(feed.id);
    let completed;
    try {
      completed = await completeFeedLease(feed, {
        ...buildTerminalFetchState(
          feed,
          outcome,
          completedAt,
          activityState
        ),
        ...additionalState
      }, { now: completedAt });
    } catch (error) {
      const fallbackAt = new Date();
      const fallbackOutcome = createFetchOutcome(
        FETCH_OUTCOMES.TRANSIENT_FAILURE,
        {
          error: {
            type: FETCH_OUTCOMES.TRANSIENT_FAILURE,
            message: 'Feed terminal metadata persistence failed'
          }
        }
      );
      const fallbackCompleted = await completeFeedLease(
        feed,
        buildTerminalFetchState(feed, fallbackOutcome, fallbackAt),
        { now: fallbackAt }
      );
      if (!fallbackCompleted) throw createFeedLeaseLostError(feed.id);
      terminalFetchFeedIds.add(feed.id);
      throw error;
    }
    if (!completed) {
      throw createFeedLeaseLostError(feed.id);
    }
    terminalFetchFeedIds.add(feed.id);
    return true;
  };

  const processSingleFeed = async (
    feed,
    currentFeed,
    signal,
    deadlineAt,
    execution,
    heartbeat
  ) => {
    let feedNewArticles = 0;
    let feedUpdatedArticles = 0;
    let feedArticleErrors = 0;
    let feedUnchangedArticles = 0;
    let feedDuplicateArticles = 0;

    try {
      throwIfAborted(signal);
      const attemptedAt = new Date();
      const attemptUpdated = await updateOwnedFeedLease(
        feed,
        buildFetchAttemptState(attemptedAt),
        attemptedAt
      );
      if (!attemptUpdated) throw createFeedLeaseLostError(feed.id);

      let actionsByUserId;
      let duplicateCachesByFeedId;
      let hotlinkCountCachesByUserId;
      try {
        [actionsByUserId, duplicateCachesByFeedId, hotlinkCountCachesByUserId] =
          await Promise.all([
            getActionsByUserId([feed]),
            getDuplicateCachesByFeedId([feed]),
            getHotlinkCountCachesByUserId([feed])
          ]);
      } catch (error) {
        error.crawlSetupError = true;
        throw error;
      }
      await assertFeedLeaseOwnership(execution.lease);
      emitProgress({
        type: 'feed_started',
        feedId: feed.id,
        feedName: feed.feedName,
        currentFeed,
        totalFeeds: feeds.length,
        newArticles: totalNewArticles,
        updatedArticles: totalUpdatedArticles,
        articleErrors: totalArticleErrors,
        errors: errorCount,
        timeouts: timeoutCount,
        processedFeeds: processedCount
      });

      // Acquires feed data through the HTTP-client-independent outcome contract.
      const discoveryInputUrl = feed.url;
      const acquisitionOutcome = await acquireFeed({
        url: discoveryInputUrl,
        feed,
        execution
      });
      acquisitionOutcomesByClaimedFeedId.set(feed.id, acquisitionOutcome);
      throwIfAborted(signal);
      const activeFeed = acquisitionOutcome.feed || feed;
      survivingFeedsByClaimedFeedId.set(feed.id, activeFeed);
      const activeClaimedFeedId = activeClaimByResolvedFeedId.get(activeFeed.id);

      if (
        (activeClaimedFeedId && activeClaimedFeedId !== feed.id) ||
        (
          activeFeed.id !== feed.id &&
          activeFeed.leaseOwner !== feed.leaseOwner
        )
      ) {
        supersededClaimedFeedIds.add(feed.id);
        recordFeedProcessed(feed);
        emitProgress({
          type: 'feed_completed',
          feedId: activeFeed.id,
          feedName: activeFeed.feedName,
          currentFeed,
          totalFeeds: feeds.length,
          feedNewArticles,
          feedUpdatedArticles,
          feedArticleErrors,
          newArticles: totalNewArticles,
          updatedArticles: totalUpdatedArticles,
          articleErrors: totalArticleErrors,
          errors: errorCount,
          timeouts: timeoutCount,
          processedFeeds: processedCount
        });
        return {
          status: 'success',
          message: null,
          feedId: activeFeed.id,
          outcome: acquisitionOutcome,
          parsedFeed: Boolean(acquisitionOutcome.parsedFeed),
          itemCount: acquisitionOutcome.parsedFeed?.entries?.length ?? null
        };
      }

      activeClaimByResolvedFeedId.set(activeFeed.id, feed.id);
      resolvedFeedIdByClaimedFeedId.set(feed.id, activeFeed.id);

      execution.lease = {
        feedId: activeFeed.id,
        leaseOwner: activeFeed.leaseOwner
      };
      heartbeat.retarget(activeFeed);
      await assertFeedLeaseOwnership(execution.lease);

      if (
        acquisitionOutcome.type === FETCH_OUTCOMES.UNCHANGED ||
        acquisitionOutcome.type === FETCH_OUTCOMES.NOT_MODIFIED
      ) {
        await persistTerminalFetchOutcome(activeFeed, acquisitionOutcome);
        recordFeedProcessed(feed);
        emitProgress({
          type: 'feed_completed',
          feedId: activeFeed.id,
          feedName: activeFeed.feedName,
          currentFeed,
          totalFeeds: feeds.length,
          feedNewArticles,
          feedUpdatedArticles,
          feedArticleErrors,
          newArticles: totalNewArticles,
          updatedArticles: totalUpdatedArticles,
          articleErrors: totalArticleErrors,
          errors: errorCount,
          timeouts: timeoutCount,
          processedFeeds: processedCount
        });
        return {
          status: 'success',
          message: null,
          outcome: acquisitionOutcome,
          parsedFeed: false,
          itemCount: null
        };
      }

      if (!isSuccessfulFetchOutcome(acquisitionOutcome)) {
        const acquisitionError = new Error(
          acquisitionOutcome.error?.message || 'Feed acquisition failed'
        );
        acquisitionError.fetchOutcome = acquisitionOutcome;
        throw acquisitionError;
      }

      const parsedFeed = sanitizeFeedPersistenceMetadata(
        acquisitionOutcome.parsedFeed
      );
      throwIfAborted(signal);

      const entries = parsedFeed.entries || [];

      emitProgress({
        type: 'feed_parsed',
        feedId: activeFeed.id,
        feedName: activeFeed.feedName,
        currentFeed,
        totalFeeds: feeds.length,
        entries: entries.length,
        newArticles: totalNewArticles,
        updatedArticles: totalUpdatedArticles,
        articleErrors: totalArticleErrors,
        errors: errorCount,
        timeouts: timeoutCount,
        processedFeeds: processedCount
      });

      // Process each article entry. This will add newly discovered articles to the database
      const preloadedActions = actionsByUserId.get(activeFeed.userId) || [];
      const duplicateCache = activeFeed.id === feed.id
        ? duplicateCachesByFeedId.get(feed.id)
        : (await getDuplicateCachesByFeedId([activeFeed])).get(activeFeed.id);
      const hotlinkCountCache = hotlinkCountCachesByUserId.get(activeFeed.userId);
      const hotlinkBatcher = createHotlinkBatcher(activeFeed, { execution });
      const publicationTimestamps = entries
        .map(entry => entry.publishedAt)
        .filter(publishedAt => publishedAt !== null && publishedAt !== undefined);
      try {
        for (const entry of entries) {
          await assertFeedLeaseOwnership(execution.lease);
          const articleResult = await processArticle(
            activeFeed,
            entry,
            preloadedActions,
            duplicateCache,
            hotlinkCountCache,
            hotlinkBatcher,
            parsedFeed.publishedAt,
            parsedFeed.title,
            parsedFeed.format,
            execution
          );
          const newArticles = Number(articleResult?.newArticles || 0);
          const updatedArticles = Number(articleResult?.updatedArticles || 0);
          const articleErrors = Number(articleResult?.errors || 0);
          const unchangedArticles = Number(articleResult?.unchangedArticles || 0);
          const duplicateArticles = Number(articleResult?.duplicateArticles || 0);
          feedNewArticles += newArticles;
          feedUpdatedArticles += updatedArticles;
          feedArticleErrors += articleErrors;
          feedUnchangedArticles += unchangedArticles;
          feedDuplicateArticles += duplicateArticles;
          totalNewArticles += newArticles;
          totalUpdatedArticles += updatedArticles;
          totalArticleErrors += articleErrors;
          crawlStats.newArticles = totalNewArticles;
          crawlStats.updatedArticles = totalUpdatedArticles;
          crawlStats.articleErrors = totalArticleErrors;
          throwIfAborted(signal);
          await assertFeedLeaseOwnership(execution.lease);
        }
      } finally {
        if (!signal.aborted && Date.now() < deadlineAt) {
          await hotlinkBatcher.flush();
        }
      }

      throwIfAborted(signal);
      await assertFeedLeaseOwnership(execution.lease);

      if (feedArticleErrors > 0) {
        const articleLabel = feedArticleErrors === 1 ? 'article' : 'articles';
        const processingError = new Error(
          `${feedArticleErrors} ${articleLabel} failed during processing`
        );
        processingError.code = 'ARTICLE_VALIDATION_ERROR';
        throw processingError;
      }

      const schedulingAt = new Date();
      const activityState = updateCadenceObservation({
        lastPublishedAt: activeFeed.lastPublishedAt,
        observedEntryIntervalMs: activeFeed.observedEntryIntervalMs,
        publicationTimestamps
      }, { clock: () => schedulingAt });
      emitProgress({
        type: 'articles_inserted_updated',
        feedId: activeFeed.id,
        feedName: activeFeed.feedName,
        currentFeed,
        totalFeeds: feeds.length,
        feedNewArticles,
        feedUpdatedArticles,
        feedArticleErrors,
        newArticles: totalNewArticles,
        updatedArticles: totalUpdatedArticles,
        articleErrors: totalArticleErrors,
        errors: errorCount,
        timeouts: timeoutCount,
        processedFeeds: processedCount
      });

      // Update feed metadata to use latest info from feed
      const updateData = {
        feedType: parsedFeed.format || null,
        favicon: parsedFeed.faviconUrl,
        status: activeFeed.status
      };
      throwIfAborted(signal);
      await persistTerminalFetchOutcome(
        activeFeed,
        acquisitionOutcome,
        schedulingAt,
        activityState,
        {
          ...activityState,
          nextFetchAt: resolveNextFetchAt(
            activeFeed,
            acquisitionOutcome,
            schedulingAt,
            activityState
          ),
          ...updateData
        }
      );

      recordFeedProcessed(feed);

      emitProgress({
        type: 'feed_completed',
        feedId: activeFeed.id,
        feedName: activeFeed.feedName,
        currentFeed,
        totalFeeds: feeds.length,
        feedNewArticles,
        feedUpdatedArticles,
        feedArticleErrors,
        newArticles: totalNewArticles,
        updatedArticles: totalUpdatedArticles,
        articleErrors: totalArticleErrors,
        errors: errorCount,
        timeouts: timeoutCount,
        processedFeeds: processedCount
      });

      return {
        status: 'success',
        message: null,
        feedId: activeFeed.id,
        outcome: acquisitionOutcome,
        parsedFeed: true,
        itemCount: entries.length,
        articlesNew: feedNewArticles,
        articlesUpdated: feedUpdatedArticles,
        articlesUnchanged: feedUnchangedArticles,
        articlesDuplicate: feedDuplicateArticles
      };
    } catch (err) {
      if (err?.crawlSetupError) throw err;
      throwIfAborted(signal);
      const failureFeed = survivingFeedsByClaimedFeedId.get(feed.id) || feed;
      const errMsg = err?.message || String(err) || 'Unknown error';
      recordFeedError(failureFeed);
      recordFeedProcessed(feed);
      if (
        !terminalFetchFeedIds.has(failureFeed.id) &&
        !terminalPersistenceAttemptedFeedIds.has(failureFeed.id)
      ) {
        const terminalOutcome = err.fetchOutcome ||
          acquisitionOutcomesByClaimedFeedId.get(feed.id) ||
          createFetchOutcome(FETCH_OUTCOMES.TRANSIENT_FAILURE, {
            error: {
              type: FETCH_OUTCOMES.TRANSIENT_FAILURE,
              message: errMsg
            }
          });
        await persistTerminalFetchOutcome(failureFeed, terminalOutcome);
      }

      emitProgress({
        type: 'feed_error',
        feedId: failureFeed.id,
        feedName: failureFeed.feedName,
        currentFeed,
        totalFeeds: feeds.length,
        newArticles: totalNewArticles,
        updatedArticles: totalUpdatedArticles,
        articleErrors: totalArticleErrors,
        errors: errorCount,
        timeouts: timeoutCount,
        processedFeeds: processedCount,
        message: errMsg
      });

      emitProgress({
        type: 'feed_completed',
        feedId: failureFeed.id,
        feedName: failureFeed.feedName,
        currentFeed,
        totalFeeds: feeds.length,
        feedNewArticles,
        feedUpdatedArticles,
        feedArticleErrors,
        newArticles: totalNewArticles,
        updatedArticles: totalUpdatedArticles,
        articleErrors: totalArticleErrors,
        errors: errorCount,
        timeouts: timeoutCount,
        processedFeeds: processedCount
      });

      const outcome = err.fetchOutcome ||
        acquisitionOutcomesByClaimedFeedId.get(feed.id) || null;
      return {
        status: 'error',
        message: errMsg,
        outcome,
        error: err,
        parsedFeed: Boolean(outcome?.parsedFeed),
        itemCount: outcome?.parsedFeed?.entries?.length ?? null,
        articlesNew: feedNewArticles,
        articlesUpdated: feedUpdatedArticles,
        articlesUnchanged: feedUnchangedArticles,
        articlesDuplicate: feedDuplicateArticles
      };
    }
  };

  const processedUserIds = new Set(userId ? [userId] : []);

  const runFeedWithTimeout = async (feed, currentFeed) => {
    let status = 'success';
    let message = null;
    let finalResult = null;
    const requestedUrl = feed.url;
    const startedAt = Date.now();
    const heartbeat = startFeedLeaseHeartbeat(feed, { leaseMs: feedLeaseMs });
    const pendingFailureWrites = [];

    try {
      const feedResult = await withTimeout(
        (signal, deadlineAt) => {
          const execution = {
            signal,
            deadlineAt,
            crawlRunId: options.crawlRunId || null,
            executionId: options.executionId || null,
            lease: { feedId: feed.id, leaseOwner: feed.leaseOwner },
            leaseState: {
              get lost() {
                return heartbeat.state.lost || options.crawlRunHeartbeatState?.lost;
              },
              get error() {
                return heartbeat.state.error || options.crawlRunHeartbeatState?.error;
              }
            }
          };
          execution.assertLeaseOwnership = ownershipOptions =>
            assertFeedLeaseOwnership(execution.lease, ownershipOptions);
          execution.recordFailure = failure => {
            pendingFailureWrites.push(recordProcessingFailure({
              crawlRunId: execution.crawlRunId,
              executionId: execution.executionId,
              userId: feed.userId,
              ...failure
            }));
          };
          execution.retargetLease = nextFeed => {
            execution.lease = {
              feedId: nextFeed.id,
              leaseOwner: nextFeed.leaseOwner
            };
            heartbeat.retarget(nextFeed);
          };
          return processSingleFeed(
            feed,
            currentFeed,
            signal,
            deadlineAt,
            execution,
            heartbeat
          );
        },
        feedTimeoutMs
      );
      status = feedResult.status;
      message = feedResult.message;
      finalResult = feedResult;
    } catch (err) {
      if (err?.crawlSetupError) throw err;
      const failureFeed = survivingFeedsByClaimedFeedId.get(feed.id) || feed;
      const errMsg = err?.message || String(err) || 'Unknown error';

      if (errMsg.includes('timed out')) {
        status = 'timeout';
        message = errMsg;
        recordFeedError(failureFeed, true);
        recordFeedProcessed(feed);
        if (
          !terminalFetchFeedIds.has(failureFeed.id) &&
          !terminalPersistenceAttemptedFeedIds.has(failureFeed.id)
        ) {
          await persistTerminalFetchOutcome(failureFeed, createFetchOutcome(
            FETCH_OUTCOMES.TIMED_OUT,
            {
              error: {
                type: FETCH_OUTCOMES.TIMED_OUT,
                message: errMsg
              }
            }
          ));
        }

        emitProgress({
          type: 'feed_error',
          feedId: failureFeed.id,
          feedName: failureFeed.feedName,
          currentFeed,
          totalFeeds: feeds.length,
          newArticles: totalNewArticles,
          updatedArticles: totalUpdatedArticles,
          articleErrors: totalArticleErrors,
          errors: errorCount,
          timeouts: timeoutCount,
          processedFeeds: processedCount,
          message: errMsg
        });
      } else {
        status = 'error';
        message = errMsg;
        recordFeedError(failureFeed);
        recordFeedProcessed(feed);
        if (
          !terminalFetchFeedIds.has(failureFeed.id) &&
          !terminalPersistenceAttemptedFeedIds.has(failureFeed.id)
        ) {
          await persistTerminalFetchOutcome(failureFeed, createFetchOutcome(
            FETCH_OUTCOMES.TRANSIENT_FAILURE,
            {
              error: {
                type: FETCH_OUTCOMES.TRANSIENT_FAILURE,
                message: errMsg
              }
            }
          ));
        }
      }
      const outcome = acquisitionOutcomesByClaimedFeedId.get(feed.id) || null;
      finalResult = {
        outcome,
        error: err,
        parsedFeed: Boolean(outcome?.parsedFeed),
        itemCount: outcome?.parsedFeed?.entries?.length ?? null
      };
    } finally {
      await Promise.allSettled(pendingFailureWrites);
      recordFeedProcessed(feed);
      await heartbeat.stop();
      const releasableFeed = survivingFeedsByClaimedFeedId.get(feed.id) || feed;
      if (!supersededClaimedFeedIds.has(feed.id)) {
        await releaseFeedLease(releasableFeed);
      }
      const resolvedFeedId = resolvedFeedIdByClaimedFeedId.get(feed.id);
      if (activeClaimByResolvedFeedId.get(resolvedFeedId) === feed.id) {
        activeClaimByResolvedFeedId.delete(resolvedFeedId);
      }
      const finalFeed = survivingFeedsByClaimedFeedId.get(feed.id) || feed;
      recordCrawlResult({
        feed: finalFeed,
        requestedUrl,
        outcome: finalResult?.outcome || null,
        error: finalResult?.error || null,
        parsedFeed: Boolean(finalResult?.parsedFeed),
        itemCount: finalResult?.itemCount ?? null,
        durationMs: Date.now() - startedAt,
        startedAt: new Date(startedAt),
        articlesNew: finalResult?.articlesNew || 0,
        articlesUpdated: finalResult?.articlesUpdated || 0,
        articlesUnchanged: finalResult?.articlesUnchanged || 0,
        articlesDuplicate: finalResult?.articlesDuplicate || 0
      });
      if (feed.userId) processedUserIds.add(feed.userId);

      emitProgress({
        type: 'progress',
        event: 'feed_status',
        feedId: feed.id,
        feedName: feed.feedName,
        currentFeed,
        totalFeeds: feeds.length,
        feedUrl: feed.url,
        status,
        message,
        processedFeeds: processedCount,
        newArticles: totalNewArticles,
        updatedArticles: totalUpdatedArticles,
        articleErrors: totalArticleErrors,
        errors: errorCount,
        timeouts: timeoutCount
      });
    }
  };

  if (runParallel) {
    const workerCount = Math.min(parallelConcurrency, maximumFeedCount);
    logFeedDebug(
      `[Parallel Mode] Processing feeds with ${workerCount} concurrent workers...`
    );
    const remaining = crawlTimeoutMs - (Date.now() - (crawlDeadline - crawlTimeoutMs));
    const results = [];
    let nextClaimIndex = 0;
    let noFeedsRemaining = false;
    // Each worker acquires global capacity before claiming one feed just in time.
    const runWorker = async () => {
      while (
        !crawlTimedOut &&
        !noFeedsRemaining &&
        Date.now() < crawlDeadline
      ) {
        const releaseSlot = await acquireParallelFeedSlot(parallelConcurrency);
        try {
          if (crawlTimedOut || noFeedsRemaining || Date.now() >= crawlDeadline) return;
          const index = nextClaimIndex;
          nextClaimIndex += 1;
          if (index >= maximumFeedCount) return;
          const [feed] = await getFeeds(
            userId,
            1,
            feedLeaseMs,
            feeds.map(claimedFeed => claimedFeed.id),
            targetFeedId
          );
          if (!feed) {
            noFeedsRemaining = true;
            return;
          }
          feeds.push(feed);
          await runFeedWithTimeout(feed, index + 1);
          results[index] = { status: 'fulfilled' };
        } catch (reason) {
          results.push({ status: 'rejected', reason });
        } finally {
          releaseSlot();
        }
      }
      if (!noFeedsRemaining && nextClaimIndex < maximumFeedCount) crawlTimedOut = true;
    };
    const feedRuns = Promise.all(
      Array.from({ length: workerCount }, () => runWorker())
    );
    let crawlTimeoutId;
    const raceResult = await Promise.race([
      feedRuns,
      new Promise(resolve => {
        crawlTimeoutId = setTimeout(() => {
          crawlTimedOut = true;
          resolve('timeout');
        }, Math.max(remaining, 0));
      })
    ]);
    clearTimeout(crawlTimeoutId);
    if (raceResult === 'timeout') {
      logFeedDebug(`[Crawl] Crawl timed out after ${crawlTimeoutMs / 1000}s (parallel mode)`);
      // Do not release the crawl run while timed-out feed work is still settling.
      await feedRuns;
    }
    const rejectedRun = results.find(result => result?.status === 'rejected');
    if (rejectedRun) {
      throw rejectedRun.reason;
    }
  } else {
    logFeedDebug('[Sequential Mode] Processing feeds sequentially...');
    for (let index = 0; index < maximumFeedCount; index++) {
      const releaseSlot = initialSequentialSlotRelease ||
        await acquireParallelFeedSlot(parallelConcurrency);
      initialSequentialSlotRelease = null;
      try {
        if (Date.now() >= crawlDeadline) {
          crawlTimedOut = true;
          logFeedDebug(`[Crawl] Crawl timed out after ${crawlTimeoutMs / 1000}s before another feed could be claimed`);
          break;
        }
        let feed = feeds[index];
        if (!feed) {
          const [nextFeed] = await getFeeds(
            userId,
            1,
            feedLeaseMs,
            feeds.map(claimedFeed => claimedFeed.id),
            targetFeedId
          );
          if (!nextFeed) break;
          feeds.push(nextFeed);
          feed = nextFeed;
        }
        await runFeedWithTimeout(feed, index + 1);
      } finally {
        releaseSlot();
      }
    }
  }

  // Persists observations only after all feed work settles to avoid competing with convergence locks.
  for (const observation of feedCrawlObservations) {
    try {
      await persistFeedCrawlResult(observation);
    } catch (observabilityError) {
      await recordProcessingFailure({
        crawlRunId: options.crawlRunId,
        executionId: options.executionId,
        userId: observation.feed?.userId,
        stage: 'observability',
        failureType: 'PERSISTENCE_FAILURE',
        severity: 'ERROR',
        error: observabilityError,
        subjectType: 'feed',
        subjectId: observation.feed?.id,
        feedId: observation.feed?.id,
        context: { target: 'feed_crawl_results' }
      });
      console.error(
        'Error recording feed crawl result:',
        sanitizeFeedLogValue(observabilityError)
      );
    }
  }
  for (const observation of processingFailureObservations) {
    await recordProcessingFailure(observation);
  }

  const result = {
    crawlRunId: options.crawlRunId || null,
    executionId: options.executionId || null,
    userId,
    total: feeds.length,
    processed: processedCount,
    errors: errorCount,
    timeouts: timeoutCount,
    crawlTimedOut,
    processedUserIds: [...processedUserIds],
    crawlStartedAt,
    totalNewArticles,
    totalUpdatedArticles,
    totalArticleErrors,
    totalFetchedArticles,
    totalUnchangedArticles,
    totalDuplicateArticles,
    failedFeeds: failedFeedCount,
    timedOutFeeds: timeoutCount,
    crawlOutcomes: { ...outcomeCounts }
  };

  if (!options.suppressDoneEvent) {
    emitProgress({
      type: 'done',
      event: 'refresh_completed',
      feedId: null,
      feedName: null,
      currentFeed: result.total,
      totalFeeds: result.total,
      processedFeeds: result.processed,
      newArticles: totalNewArticles,
      updatedArticles: totalUpdatedArticles,
      articleErrors: totalArticleErrors,
      errors: result.errors,
      timeouts: result.timeouts,
      crawlTimedOut: result.crawlTimedOut
    });
  }

  return result;
};

// This function loads the active crawl row used by acquisition outcomes.
const findActiveCrawlRun = userId => CrawlRun.findOne({
  where: {
    userId,
    status: 'running'
  },
  attributes: [
    'id',
    'startedAt',
    'heartbeatAt',
    'ownerToken',
    'newArticles',
    'updatedArticles',
    'articleErrors',
    'errors',
    'processedFeeds',
    'failedFeeds',
    'timedOutFeeds'
  ]
});

// This function calculates a non-negative terminal crawl duration in milliseconds.
const calculateCrawlDurationMs = (startedAt, completedAt) => Math.max(
  0,
  completedAt.getTime() - new Date(startedAt).getTime()
);

// This function conditionally fails the stale row without touching a newer run.
const recoverStaleCrawlRun = async (userId, crawlRun, now = new Date()) => {
  const [updatedCount] = await failStaleCrawlRuns({ userId, now });

  if (updatedCount > 0) {
    await recordProcessingFailure({
      crawlRunId: crawlRun.id,
      executionId: crawlRun.ownerToken,
      userId,
      stage: 'worker',
      failureType: 'ABANDONED',
      severity: 'FATAL',
      code: 'STALE_CRAWL_RUN',
      message: 'Crawl run heartbeat became stale before completion',
      subjectType: 'user',
      subjectId: userId,
      retryable: true,
      occurredAt: now
    });
    console.warn(
      `[Crawl] Marked stale crawl run ${crawlRun.id} as failed for user ${userId}.`
    );
  }

  return updatedCount > 0;
};

// This function recognizes the database constraint dedicated to active crawls.
const isActiveCrawlConstraintError = err => {
  if (err?.name !== 'SequelizeUniqueConstraintError') {
    return false;
  }

  if (Object.prototype.hasOwnProperty.call(err.fields || {}, ACTIVE_CRAWL_INDEX)) {
    return true;
  }

  return [err?.message, err?.parent?.sqlMessage, err?.original?.sqlMessage]
    .filter(Boolean)
    .some(message => message.includes(ACTIVE_CRAWL_INDEX));
};

// This function returns the normal no-op result for a crawl already in progress.
const crawlAlreadyRunningResult = (userId, activeCrawlRun) => {
  console.log(
    `[CRAWL] status=already-running user=${userId} crawlRunId=${activeCrawlRun.id}`
  );

  return {
    total: 0,
    processed: 0,
    errors: 0,
    timeouts: 0,
    crawlTimedOut: false,
    processedUserIds: [],
    crawlStartedAt: null,
    totalNewArticles: 0,
    totalUpdatedArticles: 0,
    totalArticleErrors: 0,
    failedFeeds: 0,
    timedOutFeeds: 0,
    userId,
    crawlRunId: activeCrawlRun.id,
    skipped: true,
    reused: true,
    reason: 'crawl_already_running'
  };
};

// This function validates the source recorded for a crawl run.
const resolveCrawlTriggerType = triggerType => {
  const resolvedTriggerType = triggerType || 'api';
  if (!CRAWL_TRIGGER_TYPES.has(resolvedTriggerType)) {
    throw new Error(`Unsupported crawl trigger type: ${resolvedTriggerType}`);
  }

  return resolvedTriggerType;
};

// This function records the terminal lifecycle of one complete user crawl.
const performCrawl = async (userId = null, options = {}) => {
  const triggerType = resolveCrawlTriggerType(options.triggerType);
  const activeCrawlRun = userId ? await findActiveCrawlRun(userId) : null;

  if (activeCrawlRun && !isStaleCrawlRun(activeCrawlRun)) {
    const result = crawlAlreadyRunningResult(userId, activeCrawlRun);
    options.onCrawlStarted?.({
      userId,
      crawlRunId: activeCrawlRun.id,
      status: 'running',
      reused: true,
      reason: result.reason
    });
    return result;
  }

  if (activeCrawlRun) {
    await recoverStaleCrawlRun(userId, activeCrawlRun);
  }

  let crawlRun = null;
  const executionId = randomUUID();
  const crawlStats = {
    newArticles: 0,
    updatedArticles: 0,
    articleErrors: 0,
    errors: 0,
    processedFeeds: 0,
    failedFeeds: 0,
    timedOutFeeds: 0
  };

  if (userId) {
    try {
      crawlRun = await CrawlRun.create({
        userId,
        status: 'running',
        heartbeatAt: new Date(),
        ownerToken: executionId,
        newArticles: 0,
        updatedArticles: 0,
        articleErrors: 0,
        errors: 0,
        processedFeeds: 0,
        failedFeeds: 0,
        timedOutFeeds: 0,
        triggerType
      });
    } catch (err) {
      if (!isActiveCrawlConstraintError(err)) {
        await recordProcessingFailure({
          executionId,
          userId,
          stage: 'crawl_setup',
          failureType: 'PERSISTENCE_FAILURE',
          severity: 'FATAL',
          error: err,
          subjectType: 'user',
          subjectId: userId,
          retryable: true
        });
        throw err;
      }

      const concurrentCrawlRun = await findActiveCrawlRun(userId);
      if (!concurrentCrawlRun) {
        throw err;
      }

      const result = crawlAlreadyRunningResult(userId, concurrentCrawlRun);
      options.onCrawlStarted?.({
        userId,
        crawlRunId: concurrentCrawlRun.id,
        status: 'running',
        reused: true,
        reason: result.reason
      });
      return result;
    }

    options.onCrawlStarted?.({
      userId,
      crawlRunId: crawlRun.id,
      status: 'running',
      reused: false,
      reason: null
    });
  }

  console.log(`[CRAWL] Started iteration user=${userId ?? 'all'}`);

  let result;
  const crawlRunHeartbeat = crawlRun ? startCrawlRunHeartbeat(crawlRun) : null;

  try {
    result = await runCrawl(userId, {
      ...options,
      crawlStats,
      crawlRunHeartbeatState: crawlRunHeartbeat?.state,
      crawlRunId: crawlRun?.id || null,
      executionId
    });
  } catch (err) {
    await recordProcessingFailure({
      crawlRunId: crawlRun?.id,
      executionId,
      userId,
      stage: 'crawl',
      severity: 'FATAL',
      error: err,
      subjectType: 'user',
      subjectId: userId
    });
    if (crawlRun) {
      try {
        const completedAt = new Date();
        await updateOwnedCrawlRun(crawlRun, {
          status: 'failed',
          completedAt,
          errorMessage: err?.message || String(err) || 'Unknown crawl error',
          newArticles: crawlStats.newArticles,
          updatedArticles: crawlStats.updatedArticles,
          articleErrors: crawlStats.articleErrors,
          errors: crawlStats.errors,
          processedFeeds: crawlStats.processedFeeds,
          failedFeeds: crawlStats.failedFeeds,
          timedOutFeeds: crawlStats.timedOutFeeds,
          durationMs: calculateCrawlDurationMs(crawlRun.startedAt, completedAt)
        });
      } catch (crawlRunErr) {
        await recordProcessingFailure({
          crawlRunId: crawlRun.id,
          executionId,
          userId,
          stage: 'observability',
          failureType: 'PERSISTENCE_FAILURE',
          severity: 'ERROR',
          error: crawlRunErr,
          subjectType: 'user',
          subjectId: userId,
          context: { target: 'failed_crawl_run' }
        });
        console.error(
          'Error recording failed crawl run:',
          sanitizeFeedLogValue(crawlRunErr)
        );
      }
    }

    throw err;
  } finally {
    if (!result) await crawlRunHeartbeat?.stop();
  }

  try {
    if (crawlRun) {
      const completedAt = new Date();
      await updateOwnedCrawlRun(crawlRun, {
        status: 'completed',
        completedAt,
        newArticles: crawlStats.newArticles,
        updatedArticles: crawlStats.updatedArticles,
        articleErrors: crawlStats.articleErrors,
        errors: crawlStats.errors,
        processedFeeds: crawlStats.processedFeeds,
        failedFeeds: Math.max(
          0,
          result.total -
            Number(result.crawlOutcomes?.SUCCESS || 0) -
            Number(result.crawlOutcomes?.RECOVERED || 0) -
            Number(result.crawlOutcomes?.EMPTY_FEED || 0)
        ),
        timedOutFeeds: crawlStats.timedOutFeeds,
        feedsAttempted: result.total,
        feedsSucceeded: Number(result.crawlOutcomes?.SUCCESS || 0) +
          Number(result.crawlOutcomes?.EMPTY_FEED || 0),
        feedsRecovered: Number(result.crawlOutcomes?.RECOVERED || 0),
        articlesFetched: result.totalFetchedArticles,
        articlesUnchanged: result.totalUnchangedArticles,
        articlesDuplicate: result.totalDuplicateArticles,
        durationMs: calculateCrawlDurationMs(crawlRun.startedAt, completedAt)
      });
    }
  } catch (crawlRunErr) {
    await recordProcessingFailure({
      crawlRunId: crawlRun?.id,
      executionId,
      userId,
      stage: 'observability',
      failureType: 'PERSISTENCE_FAILURE',
      severity: 'ERROR',
      error: crawlRunErr,
      subjectType: 'user',
      subjectId: userId,
      context: { target: 'completed_crawl_run' }
    });
    throw crawlRunErr;
  } finally {
    await crawlRunHeartbeat?.stop();
  }

  if (userId && result.totalNewArticles > 0) {
    await sendNewArticlePush(userId, result.totalNewArticles).catch(async error => {
      await recordProcessingFailure({
        crawlRunId: crawlRun?.id,
        executionId,
        userId,
        stage: 'push_delivery',
        error,
        subjectType: 'user',
        subjectId: userId,
        retryable: true
      });
      console.error('[Push] Post-crawl delivery failed:', error?.message || error);
    });
  }

  result.crawlRunId ??= crawlRun?.id || null;
  result.executionId ??= executionId;
  result.userId ??= userId;

  return result;
};

// This function runs a crawl and then groups crawled articles semantically.
const performCrawlWithSemanticGroupingOperation = async (userId = null, options = {}) => {
  const iterationStartedAt = Date.now();
  const result = await performCrawl(userId, {
    ...options,
    suppressDoneEvent: true
  });

  if (result.reason === 'crawl_already_running') {
    if (typeof options.onProgress === 'function') {
      options.onProgress({
        type: 'done',
        event: 'crawl_already_running',
        message: 'Crawl already running for this user.',
        crawlRunId: result.crawlRunId,
        feedId: null,
        feedName: null,
        currentFeed: 0,
        totalFeeds: 0,
        processedFeeds: 0,
        newArticles: 0,
        updatedArticles: 0,
        articleErrors: 0,
        errors: 0,
        timeouts: 0,
        crawlTimedOut: false
      });
    }

    return result;
  }

  await runPostCrawlSemanticPipeline(result, {
    userId,
    onProgress: options.onProgress
  });

  if (typeof options.onProgress === 'function') {
    options.onProgress({
      type: 'done',
      event: 'refresh_completed',
      feedId: null,
      feedName: null,
      currentFeed: result.total,
      totalFeeds: result.total,
      processedFeeds: result.processed,
      newArticles: result.totalNewArticles || 0,
      updatedArticles: result.totalUpdatedArticles || 0,
      articleErrors: result.totalArticleErrors || 0,
      errors: result.errors,
      timeouts: result.timeouts,
      crawlTimedOut: result.crawlTimedOut
    });
  }

  console.log(formatCrawlCompletionLine({
    feeds: result.total,
    newArticles: result.totalNewArticles,
    errors: result.errors,
    userId,
    durationMs: Date.now() - iterationStartedAt
  }));

  return result;
};

// Holds the cross-process priority gate for every API or manually triggered critical pipeline.
const performCrawlWithSemanticGrouping = (userId = null, options = {}) =>
  withCrawlPriorityLease(
    () => performCrawlWithSemanticGroupingOperation(userId, options)
  );

export const startUserCrawl = createStartUserCrawl(
  performCrawlWithSemanticGrouping
);

/* ------------------------------------------------------------------
 * HTTP handler
 * ------------------------------------------------------------------ */

const crawlRssLinks = catchAsync(async (req, res, next) => {
  const userId = req.userData?.userId || null;
  logFeedDebug(`[Crawl] HTTP trigger by userId: ${userId ?? 'unknown'}`);
  try {
    const started = await startUserCrawl(userId, {
      triggerType: 'api',
      onComplete: result => {
        logFeedDebug(
          `Crawl completed: ${result.processed} feeds processed, ${result.errors} errors, ${result.timeouts} timeouts`
        );
      },
      onError: err => {
        console.error('Error during async crawl:', sanitizeFeedLogValue(err));
      }
    });

    return res.status(200).json({
      message: started.reused ? 'Crawl already running.' : 'Crawling started.',
      crawlRunId: started.crawlRunId,
      status: started.status,
      reused: started.reused
    });
  } catch (err) {
    console.error('Error in crawlRssLinks:', sanitizeFeedLogValue(err));
    return next(err);
  }
});

export default {
  crawlRssLinks,
  startUserCrawl,
  performCrawlWithSemanticGrouping,
  performCrawl,
  shouldCrawlFeed
}
