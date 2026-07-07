import db from '../models/index.js';
const { Action, Article, Feed, Hotlink } = db;
import discoverRssLink from '../services/feeds/discoverRssLink.js';
import parseFeed from '../services/feeds/parser.js';
import processArticle from '../services/crawl/processArticle.js';
import createArticleDuplicateCache from '../services/crawl/articleDuplicateCache.js';
import createHotlinkCountCache from '../services/crawl/hotlinkCountCache.js';
import createHotlinkBatcher from '../services/crawl/hotlinkBatcher.js';
import { runPostCrawlSemanticPipeline } from '../services/crawl/postCrawlSemanticPipeline.js';

/* ------------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------------ */

//set the maximum number of feeds to be processed at once
const feedCount = parseInt(process.env.MAX_FEEDCOUNT) || 10;

// Timeout wrapper for feed processing (default 60 seconds)
const FEED_TIMEOUT_MS = parseInt(process.env.FEED_TIMEOUT_MS) || 60000;

// Overall crawl deadline (default 10 minutes)
const CRAWL_TIMEOUT_MS = parseInt(process.env.CRAWL_TIMEOUT_MS) || 10 * 60 * 1000;

const parsedDuplicateCacheDays = Number.parseInt(process.env.CRAWL_DUPLICATE_CACHE_DAYS, 10);
const DUPLICATE_CACHE_DAYS = Number.isInteger(parsedDuplicateCacheDays) && parsedDuplicateCacheDays > 0
  ? parsedDuplicateCacheDays
  : 30;

// Controls whether feeds are processed in parallel (1) or sequentially (0, default)
const PARALLELPROCESSFLAG = Number(process.env.PARALLELPROCESSFLAG || 0);

// Rate limit delay tracking for OpenAI API
let rateLimitDelay = 0;

const MINUTE_MS = 60 * 1000;

/* ------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------ */

// Helper function to wrap async functions and catch errors
const catchAsync = fn => (req, res, next) => {
  fn(req, res, next).catch(next);
};

// Helper function to add timeout to a promise
const withTimeout = (promise, timeoutMs, _feedUrl) => Promise.race([
  promise,
  new Promise((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(
            `Feed processing timed out after ${timeoutMs / 1000} seconds`
          )
        ),
      timeoutMs
    )
  )
]);

// Reset rate limit delay after crawl completes
const resetRateLimitDelay = () => {
  if (rateLimitDelay > 0) {
    console.log('[OpenAI LLM] Resetting rate limit delay');
    rateLimitDelay = 0;
  }
};

// This function checks whether a feed is due for crawling based on its interval.
const shouldCrawlFeed = (feed, now = new Date()) => {
  const interval = feed.updateIntervalMinutes;

  if (interval === null || typeof interval === 'undefined') {
    return true;
  }

  if (Number(interval) === 0) {
    return false;
  }

  const intervalMinutes = Number(interval);

  if (!Number.isInteger(intervalMinutes) || intervalMinutes < 0) {
    return true;
  }

  if (!feed.lastFetched) {
    return true;
  }

  const lastFetchedTime = new Date(feed.lastFetched).getTime();

  if (Number.isNaN(lastFetchedTime)) {
    return true;
  }

  return lastFetchedTime + intervalMinutes * MINUTE_MS <= now.getTime();
};

/* ------------------------------------------------------------------
 * Feed fetching
 * ------------------------------------------------------------------ */

//this function crawls feeds for a specific user or all users when userId is omitted
const getFeeds = async (userId = null) => {
  try {
    //only get feeds with an errorCount lower than 25
    const where = {
      status: 'active',
      // DEBUG: Filter for specific URL - remove this line after debugging
      // url: 'http://www.engadget.com/rss.xml',
      // Exclude muted feeds (mutedUntil is null OR mutedUntil is in the past)
      [db.Sequelize.Op.or]: [
        { mutedUntil: { [db.Sequelize.Op.is]: null } },
        { mutedUntil: { [db.Sequelize.Op.lte]: new Date() } }
      ]
    };

    // If userId is provided (HTTP-triggered crawl), scope feeds to that user
    if (userId) {
      where.userId = userId;
    }

    const crawlCandidates = await Feed.findAll({
      where,
      order: [['updatedAt', 'ASC']]
    });

    const now = new Date();
    const dueFeeds = crawlCandidates.filter(feed => shouldCrawlFeed(feed, now));
    const feeds = dueFeeds.slice(0, feedCount);

    const skippedCount = crawlCandidates.length - dueFeeds.length;

    if (skippedCount > 0) {
      console.log(`[Crawl] Skipped ${skippedCount} feeds because their update interval has not elapsed.`);
    }

    return feeds;
  } catch (err) {
    console.error('Error fetching feeds from database:', err.message);
    return [];
  }
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

// This function preloads duplicate indexes for every feed in the crawl batch.
const getDuplicateCachesByFeedId = async (feeds) => {
  const feedIds = feeds.map(feed => feed.id);
  const userIds = [...new Set(feeds.map(feed => feed.userId).filter(Boolean))];
  const cachesByFeedId = new Map();

  if (feedIds.length === 0) {
    return cachesByFeedId;
  }

  const duplicateCacheSince = new Date(Date.now() - DUPLICATE_CACHE_DAYS * 24 * 60 * 60 * 1000);

  console.log(`[Crawl] Building duplicate cache for articles published in the last ${DUPLICATE_CACHE_DAYS} days.`);

  const [feedArticleLists, userContentHashArticles] = await Promise.all([
    Promise.all(feeds.map(feed => Article.findAll({
      attributes: ['id', 'url', 'title', 'contentHash'],
      where: {
        feedId: feed.id,
        published: { [db.Sequelize.Op.gte]: duplicateCacheSince }
      },
      raw: true
    }))),
    userIds.length > 0
      ? Article.findAll({
        attributes: ['id', 'userId', 'contentHash'],
        where: {
          userId: { [db.Sequelize.Op.in]: userIds },
          contentHash: { [db.Sequelize.Op.not]: null },
          published: { [db.Sequelize.Op.gte]: duplicateCacheSince }
        },
        raw: true
      })
      : []
  ]);

  const contentHashIdsByUserId = new Map(userIds.map(id => [id, new Map()]));

  for (const article of userContentHashArticles) {
    contentHashIdsByUserId.get(article.userId)?.set(article.contentHash, article.id);
  }

  for (const [index, feed] of feeds.entries()) {
    cachesByFeedId.set(
      feed.id,
      createArticleDuplicateCache(
        feedArticleLists[index],
        contentHashIdsByUserId.get(feed.userId)
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

// Core crawl function with shared feed processing
const performCrawl = async (userId = null, options = {}) => {
  const crawlStartedAt = new Date();
  const emitProgress = (event) => {
    if (typeof options.onProgress !== 'function') {
      return;
    }

    try {
      options.onProgress(event);
    } catch (err) {
      console.error('Error in onProgress callback:', err);
    }
  };

  const feeds = await getFeeds(userId);
  const actionsByUserId = await getActionsByUserId(feeds);
  const duplicateCachesByFeedId = await getDuplicateCachesByFeedId(feeds);
  const hotlinkCountCachesByUserId = await getHotlinkCountCachesByUserId(feeds);

  let processedCount = 0;
  let errorCount = 0;
  let timeoutCount = 0;
  let crawlTimedOut = false;
  let totalNewArticles = 0;
  let totalUpdatedArticles = 0;

  const crawlDeadline = Date.now() + CRAWL_TIMEOUT_MS;

  console.log(`Starting crawl for ${feeds.length} feeds (timeout=${CRAWL_TIMEOUT_MS / 1000}s)...`);

  emitProgress({
    type: 'refresh_started',
    feedId: null,
    feedName: null,
    currentFeed: 0,
    totalFeeds: feeds.length,
    newArticles: 0,
    updatedArticles: 0,
    errors: 0,
    timeouts: 0,
    processedFeeds: 0
  });

  if (feeds.length === 0) {
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
        errors: 0,
        timeouts: 0,
        processedFeeds: 0,
        crawlTimedOut: false
      });
    }

    return {
      total: 0,
      processed: 0,
      errors: 0,
      timeouts: 0,
      crawlTimedOut: false,
      processedUserIds: userId ? [userId] : [],
      crawlStartedAt,
      totalNewArticles: 0,
      totalUpdatedArticles: 0
    };
  }

  const runParallel = PARALLELPROCESSFLAG === 1;

  const markError = async (feed, errMsg) => {
    const newErrorCount = feed.errorCount + 1;
    const updateData = {
      errorCount: newErrorCount,
      errorMessage: errMsg
    };

    if (!feed.errorSince) {
      updateData.errorSince = new Date();
    }

    if (feed.errorSince) {
      const daysSinceFirstError = (new Date() - new Date(feed.errorSince)) / (1000 * 60 * 60 * 24);
      if (daysSinceFirstError >= 7) {
        updateData.status = 'error';
        console.log(`[Error] Feed marked as error after ${daysSinceFirstError.toFixed(1)} days of failures: ${feed.url}`);
      }
    }

    await feed.update(updateData);
  };

  const processSingleFeed = async (feed, currentFeed) => {
    let feedNewArticles = 0;
    let feedUpdatedArticles = 0;

    try {
      emitProgress({
        type: 'feed_started',
        feedId: feed.id,
        feedName: feed.feedName,
        currentFeed,
        totalFeeds: feeds.length,
        newArticles: totalNewArticles,
        updatedArticles: totalUpdatedArticles,
        errors: errorCount,
        timeouts: timeoutCount,
        processedFeeds: processedCount
      });

      //discover RssLink
      const discoveryInputUrl = feed.url;
      const discoveryResult = await discoverRssLink.discoverRssLink(discoveryInputUrl, feed);

      // If Cloudflare blocks discovery, fall back to the original URL so the parser can try it directly
      const url = typeof discoveryResult === 'string'
        ? discoveryResult
        : (discoveryResult?.cloudflare ? discoveryResult.url : undefined);

      if (!url) {
        throw new Error('Unable to discover RSS/Atom URL');
      }

      // parse the feed using feedsmith
      const feedObject = await parseFeed.process(url);

      // Sanity check
      if (!feedObject) {
        throw new Error('No valid feed data returned');
      }

      // feedsmith: entries are in feedObject.feed.entries
      const entries = feedObject?.feed?.entries ?? feedObject?.feed?.items ?? [];

      emitProgress({
        type: 'feed_parsed',
        feedId: feed.id,
        feedName: feed.feedName,
        currentFeed,
        totalFeeds: feeds.length,
        entries: entries.length,
        newArticles: totalNewArticles,
        updatedArticles: totalUpdatedArticles,
        errors: errorCount,
        timeouts: timeoutCount,
        processedFeeds: processedCount
      });

      // Process each article entry. This will add newly discovered articles to the database
      const preloadedActions = actionsByUserId.get(feed.userId) || [];
      const duplicateCache = duplicateCachesByFeedId.get(feed.id);
      const hotlinkCountCache = hotlinkCountCachesByUserId.get(feed.userId);
      const hotlinkBatcher = createHotlinkBatcher(feed);
      try {
        for (const entry of entries) {
          const articleResult = await processArticle(
            feed,
            entry,
            preloadedActions,
            duplicateCache,
            hotlinkCountCache,
            hotlinkBatcher
          );
          feedNewArticles += articleResult?.newArticles || 0;
          feedUpdatedArticles += articleResult?.updatedArticles || 0;
        }
      } finally {
        await hotlinkBatcher.flush();
      }

      totalNewArticles += feedNewArticles;
      totalUpdatedArticles += feedUpdatedArticles;

      emitProgress({
        type: 'articles_inserted_updated',
        feedId: feed.id,
        feedName: feed.feedName,
        currentFeed,
        totalFeeds: feeds.length,
        feedNewArticles,
        feedUpdatedArticles,
        newArticles: totalNewArticles,
        updatedArticles: totalUpdatedArticles,
        errors: errorCount,
        timeouts: timeoutCount,
        processedFeeds: processedCount
      });

      // Update feed metadata to use latest info from feed
      // feedsmith: image info is often in feedObject.feed.image.url
      const faviconUrl =
        feedObject.feed?.icon ||
        feedObject.feed?.logo ||
        feedObject.feed?.image?.url ||
        null;

      const updateData = {
        feedType: feedObject.format || null,
        favicon: faviconUrl,
        url: url,
        errorCount: 0,
        errorMessage: null,
        errorSince: null,
        status: 'active'
      };
      await feed.update(updateData);

      processedCount++;
      console.log( `[Success] Successfully processed feed: ${feed.url} with ${entries.length} items.`);

      emitProgress({
        type: 'feed_completed',
        feedId: feed.id,
        feedName: feed.feedName,
        currentFeed,
        totalFeeds: feeds.length,
        feedNewArticles,
        feedUpdatedArticles,
        newArticles: totalNewArticles,
        updatedArticles: totalUpdatedArticles,
        errors: errorCount,
        timeouts: timeoutCount,
        processedFeeds: processedCount
      });
    } catch (err) {
      const errMsg = err?.message || String(err) || 'Unknown error';
      console.log(`[Error] Failed to process feed: ${feed.url} - ${errMsg}`);
      await markError(feed, errMsg);
      errorCount++;

      emitProgress({
        type: 'feed_error',
        feedId: feed.id,
        feedName: feed.feedName,
        currentFeed,
        totalFeeds: feeds.length,
        newArticles: totalNewArticles,
        updatedArticles: totalUpdatedArticles,
        errors: errorCount,
        timeouts: timeoutCount,
        processedFeeds: processedCount,
        message: errMsg
      });

      emitProgress({
        type: 'feed_completed',
        feedId: feed.id,
        feedName: feed.feedName,
        currentFeed,
        totalFeeds: feeds.length,
        feedNewArticles,
        feedUpdatedArticles,
        newArticles: totalNewArticles,
        updatedArticles: totalUpdatedArticles,
        errors: errorCount,
        timeouts: timeoutCount,
        processedFeeds: processedCount
      });
    } finally {
      //update lastFetched
      await feed.update({
        lastFetched: new Date()
      });
    }
  };

  const processedUserIds = new Set();

  const runFeedWithTimeout = async (feed, currentFeed) => {
    let status = 'success';
    let message = null;

    try {
      await withTimeout(processSingleFeed(feed, currentFeed), FEED_TIMEOUT_MS, feed.url);
    } catch (err) {
      const errMsg = err?.message || String(err) || 'Unknown error';

      if (errMsg.includes('timed out')) {
        console.log(`Timeout processing feed: ${feed.url} - skipping to next feed`);
        status = 'timeout';
        message = errMsg;
        timeoutCount++;
        await markError(feed, errMsg);

        emitProgress({
          type: 'feed_error',
          feedId: feed.id,
          feedName: feed.feedName,
          currentFeed,
          totalFeeds: feeds.length,
          newArticles: totalNewArticles,
          updatedArticles: totalUpdatedArticles,
          errors: errorCount + 1,
          timeouts: timeoutCount,
          processedFeeds: processedCount,
          message: errMsg
        });
      } else {
        console.log(`Failed to process feed: ${feed.url} - ${errMsg}`);
        status = 'error';
        message = errMsg;
        await markError(feed, errMsg);
      }

      errorCount++;
    } finally {
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
        errors: errorCount,
        timeouts: timeoutCount
      });
    }
  };

  if (runParallel) {
    console.log('[Parallel Mode] Processing feeds in parallel...');
    const remaining = CRAWL_TIMEOUT_MS - (Date.now() - (crawlDeadline - CRAWL_TIMEOUT_MS));
    const results = await Promise.race([
      Promise.all(feeds.map((feed, index) => runFeedWithTimeout(feed, index + 1))),
      new Promise(resolve =>
        setTimeout(() => {
          crawlTimedOut = true;
          resolve('timeout');
        }, Math.max(remaining, 0))
      )
    ]);
    if (results === 'timeout') {
      console.log(`[Crawl] Crawl timed out after ${CRAWL_TIMEOUT_MS / 1000}s (parallel mode)`);
    }
  } else {
    console.log('[Sequential Mode] Processing feeds sequentially...');
    for (let index = 0; index < feeds.length; index++) {
      const feed = feeds[index];
      if (Date.now() >= crawlDeadline) {
        crawlTimedOut = true;
        console.log(`[Crawl] Crawl timed out after ${CRAWL_TIMEOUT_MS / 1000}s — skipping remaining ${feeds.length - processedCount - errorCount} feeds`);
        break;
      }
      await runFeedWithTimeout(feed, index + 1);
    }
  }

  const result = {
    total: feeds.length,
    processed: processedCount,
    errors: errorCount,
    timeouts: timeoutCount,
    crawlTimedOut,
    processedUserIds: [...processedUserIds],
    crawlStartedAt,
    totalNewArticles,
    totalUpdatedArticles
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
      errors: result.errors,
      timeouts: result.timeouts,
      crawlTimedOut: result.crawlTimedOut
    });
  }

  return result;
};

// This function runs a crawl and then groups crawled articles semantically.
const performCrawlWithSemanticGrouping = async (userId = null, options = {}) => {
  const result = await performCrawl(userId, {
    ...options,
    suppressDoneEvent: true
  });

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
      errors: result.errors,
      timeouts: result.timeouts,
      crawlTimedOut: result.crawlTimedOut
    });
  }

  return result;
};

/* ------------------------------------------------------------------
 * HTTP handler
 * ------------------------------------------------------------------ */

const crawlRssLinks = catchAsync(async (req, res, next) => {
  const userId = req.userData?.userId || null;
  console.log(`[Crawl] HTTP trigger by userId: ${userId ?? 'unknown'}`);
  try {
    // For HTTP requests, start crawling asynchronously and return immediately
    performCrawlWithSemanticGrouping(userId)
      .then(async result => {
        resetRateLimitDelay();
        console.log(
          `Crawl completed: ${result.processed} feeds processed, ${result.errors} errors, ${result.timeouts} timeouts`
        );
      })
      .catch(err => {
        resetRateLimitDelay();
        console.error('Error during async crawl:', err);
      });

    return res.status(200).json({ message: 'Crawling started.' });
  } catch (err) {
    console.error('Error in crawlRssLinks:', err);
    return next(err);
  }
});

export default {
  crawlRssLinks,
  performCrawlWithSemanticGrouping,
  performCrawl,
  shouldCrawlFeed
}
