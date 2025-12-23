import { Op } from 'sequelize';

import Feed from '../models/feed.js';

import discoverRssLink from '../util/discoverRssLink.js';
import parseFeed from '../util/parser.js';
import processArticle from './crawl/processArticle.js';

/* ------------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------------ */

//set the maximum number of feeds to be processed at once
const feedCount = parseInt(process.env.MAX_FEEDCOUNT) || 10;

// Timeout wrapper for feed processing (default 60 seconds)
const FEED_TIMEOUT_MS = parseInt(process.env.FEED_TIMEOUT_MS) || 60000;

// Rate limit delay tracking for OpenAI API
let rateLimitDelay = 0;

/* ------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------ */

// Helper function to wrap async functions and catch errors
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

// Helper function to add timeout to a promise
const withTimeout = (promise, timeoutMs, feedUrl) => {
  return Promise.race([
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
};

// Helper function to extract base URL from a feed URL
const getBaseUrl = feedUrl => {
  try {
    const urlObj = new URL(feedUrl);
    return `${urlObj.protocol}//${urlObj.hostname}${
      urlObj.port ? ':' + urlObj.port : ''
    }/`;
  } catch (e) {
    return null;
  }
};

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

//this function crawls all feeds for all users
const getFeeds = async () => {
  try {
    //only get feeds with an errorCount lower than 25
    const feeds = await Feed.findAll({
      where: {
        active: true,
        errorCount: {
          [Op.lt]: 25
        },
        // DEBUG: Filter for specific URL - remove this line after debugging
        // url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCHCUGm7WwWCEVVN0Gzl3KAA'
      },
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

// Core crawl function that processes feeds synchronously
const performCrawl = async () => {
  const feeds = await getFeeds();

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

  // Use Promise.all with map to wait for all feeds to be processed
  await Promise.all(
    feeds.map(async feed => {
      try {
        // Wrap entire feed processing in a timeout
        await withTimeout(
          (async () => {
            //discover RssLink - first try feed.url, then fallback to rssUrl, then try base URL
            let url = await discoverRssLink.discoverRssLink(feed.url);
            let usedBaseUrl = false;

            console.log(
              `Crawling feed: ${feed.url} (Discovered RSS: ${url})`
            );

            // If discovery failed and we have a stored rssUrl, try that instead
            if (typeof url === 'undefined' && feed.rssUrl) {
              console.log(
                `Discovery failed for ${feed.url}, trying stored rssUrl: ${feed.rssUrl}`
              );
              url = await discoverRssLink.discoverRssLink(feed.rssUrl);
            }

            // If still no URL and the feed.url looks like a feed path, try the base URL
            if (typeof url === 'undefined') {
              const baseUrl = getBaseUrl(feed.url);
              if (baseUrl && baseUrl !== feed.url) {
                console.log(`Discovery failed, trying base URL: ${baseUrl}`);
                url = await discoverRssLink.discoverRssLink(baseUrl);
                if (typeof url !== 'undefined') {
                  usedBaseUrl = true;
                }
              }
            }

            //do not process undefined URLs
            if (typeof url === 'undefined') {
              const errMsg = 'No RSS link discovered';
              console.log(`${errMsg} for feed: ${feed.url}`);

              await feed.update({
                errorCount: feed.errorCount + 1,
                errorMessage: errMsg
              });

              errorCount++;
              return;
            }

            try {
              const feedJson = await parseFeed.process(url);
              const feedObject = JSON.parse(feedJson);

              if (!feedJson) {
                throw new Error('No valid feed data returned');
              }

              // feedsmith: entries are in feedJson.feed.entries
              const entries = feedObject?.feed?.entries ?? feedObject?.feed?.items ?? [];

              console.log(`Processing ${entries.length} entries for feed: ${feed.url}`);

              //process each article entry
              for (const entry of entries) {
                await processArticle(feed, entry);
              }

              // feedsmith: favicon/image is feedObject.feed.icon or feedObject.feed.logo or null
              const faviconUrl = feedObject.feed?.icon || feedObject.feed?.logo || null;

              const updateData = {
                feedType: feedObject.format || null,
                favicon: faviconUrl,
                rssUrl: url,
                errorCount: 0,
                errorMessage: null
              };

              // If we used the base URL to discover a working feed, update feed.url too
              if (usedBaseUrl) {
                updateData.url = getBaseUrl(feed.url);
                console.log(`Updating feed.url from ${feed.url} to ${updateData.url}`);
              }

              await feed.update(updateData);

              processedCount++;
              console.log( `Successfully processed feed: ${feed.url} with ${entries.length} items.`);
            } catch (err) {
              const errMsg = err.message || 'Unknown error';

              console.error(
                'Error processing feed:',
                err.stack?.split('\n', 1).join('') || errMsg,
                '-',
                feed.url
              );

              await feed.update({
                errorCount: feed.errorCount + 1,
                errorMessage: errMsg
              });

              errorCount++;
            }

            //touch updatedAt
            feed.changed('updatedAt', true);
            await feed.update({
              updatedAt: new Date()
            });
          })(),
          FEED_TIMEOUT_MS,
          feed.url
        );
      } catch (err) {
        if (err.message.includes('timed out')) {
          console.error(`Timeout processing feed: ${feed.url} - skipping to next feed`);

          timeoutCount++;

          await feed.update({
            errorCount: feed.errorCount + 1,
            errorMessage: err.message,
            updatedAt: new Date()
          });
        } else {
          console.error('Error processing feed:', feed.url, err);
        }

        errorCount++;
      }
    })
  );

  return {
    total: feeds.length,
    processed: processedCount,
    errors: errorCount,
    timeouts: timeoutCount
  };
};

/* ------------------------------------------------------------------
 * HTTP handler
 * ------------------------------------------------------------------ */

const crawlRssLinks = catchAsync(async (req, res, next) => {
  try {
    // For HTTP requests, start crawling asynchronously and return immediately
    performCrawl()
      .then(result => {
        resetRateLimitDelay();
        console.log(`Crawl completed: ${result.processed} feeds processed, ${result.errors} errors, ${result.timeouts} timeouts`);
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