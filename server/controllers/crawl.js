import db from '../models/index.js';
const { Feed } = db;
import discoverRssLink from '../util/discoverRssLink.js';
import parseFeed from '../util/parser.js';
import processArticle from './crawl/processArticle.js';
import { incrementalClusterForUser } from './cluster/reclusterForUser.js';

/* ------------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------------ */

//set the maximum number of feeds to be processed at once
const feedCount = parseInt(process.env.MAX_FEEDCOUNT) || 10;

// Timeout wrapper for feed processing (default 300 seconds)
const FEED_TIMEOUT_MS = parseInt(process.env.FEED_TIMEOUT_MS) || 300000;

// Controls whether feeds are processed in parallel (1) or sequentially (0, default)
const PARALLELPROCESSFLAG = Number(process.env.PARALLELPROCESSFLAG || 0);

// Rate limit delay tracking for OpenAI API
let rateLimitDelay = 0;

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

    const feeds = await Feed.findAll({
      where,
      order: [['updatedAt', 'ASC']],
      limit: feedCount
    });
    return feeds;
  } catch (err) {
    console.error('Error fetching feeds from database:', err.message);
    return [];
  }
};

/* ------------------------------------------------------------------
 * Core crawl logic
 * ------------------------------------------------------------------ */

// Core crawl function with shared feed processing
const performCrawl = async (userId = null, { waitForCluster = false } = {}) => {
  const feeds = await getFeeds(userId);

  let processedCount = 0;
  let errorCount = 0;
  let timeoutCount = 0;

  console.log(`Starting crawl for ${feeds.length} feeds...`);

  if (feeds.length === 0) {
    return {
      total: 0,
      processed: 0,
      errors: 0,
      timeouts: 0
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

  const processSingleFeed = async (feed) => {
    try {
      //discover RssLink
      const discoveryInputUrl = feed.url;
      const url = await discoverRssLink.discoverRssLink(discoveryInputUrl, feed);

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

      // Process each article entry. This will add newly discovered articles to the database
      for (const entry of entries) {
        await processArticle(feed, entry);
      }

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
    } catch (err) {
      const errMsg = err?.message || String(err) || 'Unknown error';
      console.log(`[Error] Failed to process feed: ${feed.url} - ${errMsg}`);
      await markError(feed, errMsg);
      errorCount++;
    } finally {
      //update lastFetched
      await feed.update({
        lastFetched: new Date()
      });
    }
  };

  const processedUserIds = new Set();

  const runFeedWithTimeout = async (feed) => {
    try {
      await withTimeout(processSingleFeed(feed), FEED_TIMEOUT_MS, feed.url);
      if (feed.userId) processedUserIds.add(feed.userId);
    } catch (err) {
      const errMsg = err?.message || String(err) || 'Unknown error';

      if (errMsg.includes('timed out')) {
        console.log(`Timeout processing feed: ${feed.url} - skipping to next feed`);
        timeoutCount++;
        await markError(feed, errMsg);
      } else {
        console.log(`Failed to process feed: ${feed.url} - ${errMsg}`);
        await markError(feed, errMsg);
      }

      errorCount++;
    }
  };

  if (runParallel) {
    console.log('[Parallel Mode] Processing feeds in parallel...');
    await Promise.all(feeds.map(feed => runFeedWithTimeout(feed)));
  } else {
    console.log('[Sequential Mode] Processing feeds sequentially...');
    for (const feed of feeds) {
      await runFeedWithTimeout(feed);
    }
  }

  const result = {
    total: feeds.length,
    processed: processedCount,
    errors: errorCount,
    timeouts: timeoutCount
  };

  // Post-ingest incremental clustering (unclustered articles only)
  // Resolve actual userIds from processed feeds
  const clusterUserIds = userId
    ? [userId]
    : [...processedUserIds];

  if (clusterUserIds.length) {
    console.log(
      `[CLUSTER] Starting post-ingest incremental clustering for ${clusterUserIds.length} user(s)`
    );

    const clusterAll = async () => {
      for (const uid of clusterUserIds) {
        try {
          await incrementalClusterForUser(uid);
        } catch (err) {
          console.error(`[CLUSTER] Incremental clustering failed for user ${uid}:`, err);
        }
      }
      console.log('[CLUSTER] Incremental clustering completed');
    };

    if (waitForCluster) {
      await clusterAll();
    } else {
      clusterAll().catch(err => {
        console.error('[CLUSTER] Incremental clustering failed:', err);
      });
    }
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
    performCrawl(userId)
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
  performCrawl
}