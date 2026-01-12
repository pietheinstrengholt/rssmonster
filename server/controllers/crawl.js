import db from '../models/index.js';
const { Feed } = db;
import discoverRssLink from '../util/discoverRssLink.js';
import parseFeed from '../util/parser.js';
import processArticle from './crawl/processArticle.js';

/* ------------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------------ */

//set the maximum number of feeds to be processed at once
const feedCount = parseInt(process.env.MAX_FEEDCOUNT) || 10;

// Timeout wrapper for feed processing (default 120 seconds)
const FEED_TIMEOUT_MS = parseInt(process.env.FEED_TIMEOUT_MS) || 120000;

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
        status: 'active',
        // DEBUG: Filter for specific URL - remove this line after debugging
        // url: 'http://www.engadget.com/rss.xml'
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

  // Check if AI is enabled (determines sequential vs parallel processing)
  const aiEnabled = !!process.env.OPENAI_API_KEY;
  
  if (aiEnabled) {
    console.log('[AI Mode] Processing feeds sequentially to avoid rate limits...');
    
    // Sequential processing when AI is enabled (avoids overwhelming OpenAI API)
    for (const feed of feeds) {
      try {
        // Wrap entire feed processing in a timeout
        await withTimeout(
          (async () => {
            //discover RssLink
            const discoveryInputUrl = feed.url;
            let url = await discoverRssLink.discoverRssLink(discoveryInputUrl, feed);

            if (!url) {
              throw new Error('Unable to discover RSS/Atom URL');
            }

            // If the url is valid, process the feed
            try {
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
              // feedsmith: favicon/image is feedObject.feed.icon or feedObject.feed.logo or null
              const faviconUrl = feedObject.feed?.icon || feedObject.feed?.logo || null;

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
              const newErrorCount = feed.errorCount + 1;
              const updateData = {
                errorCount: newErrorCount,
                errorMessage: errMsg
              };
              
              // Set errorSince on first error (if not already set)
              if (!feed.errorSince) {
                updateData.errorSince = new Date();
              }
              
              // Mark as error if failures persist for 7+ days
              if (feed.errorSince) {
                const daysSinceFirstError = (new Date() - new Date(feed.errorSince)) / (1000 * 60 * 60 * 24);
                if (daysSinceFirstError >= 7) {
                  updateData.status = 'error';
                  console.log(`[Error] Feed marked as error after ${daysSinceFirstError.toFixed(1)} days of failures: ${feed.url}`);
                }
              }
              
              await feed.update(updateData);

              errorCount++;
            }

            //update lastFetched
            await feed.update({
              lastFetched: new Date()
            });
          })(),
          FEED_TIMEOUT_MS,
          feed.url
        );
      } catch (err) {
        const errMsg = err?.message || String(err) || 'Unknown error';

        if (errMsg.includes('timed out')) {
          console.log(`Timeout processing feed: ${feed.url} - skipping to next feed`);

          timeoutCount++;

          const newErrorCount = feed.errorCount + 1;
          const updateData = {
            errorCount: newErrorCount,
            errorMessage: err.message
          };
          
          // Set errorSince on first error (if not already set)
          if (!feed.errorSince) {
            updateData.errorSince = new Date();
          }
          
          // Mark as error if failures persist for 7+ days
          if (feed.errorSince) {
            const daysSinceFirstError = (new Date() - new Date(feed.errorSince)) / (1000 * 60 * 60 * 24);
            if (daysSinceFirstError >= 7) {
              updateData.status = 'error';
              console.log(`[Timeout] Feed marked as error after ${daysSinceFirstError.toFixed(1)} days of failures: ${feed.url}`);
            }
          }
          
          await feed.update(updateData);
        } else {
          console.log(`Failed to process feed: ${feed.url} - ${errMsg}`);
        }

        errorCount++;
      }
    }
  } else {
    console.log('[No AI] Processing feeds in parallel...');
    
    // Parallel processing when AI is disabled (faster)
    await Promise.all(
    feeds.map(async feed => {
      try {
        // Wrap entire feed processing in a timeout
        await withTimeout(
          (async () => {
            //discover RssLink
            const discoveryInputUrl = feed.url;
            let url = await discoverRssLink.discoverRssLink(discoveryInputUrl, feed);

            if (!url) {
              throw new Error('Unable to discover RSS/Atom URL');
            }

            // If the url is valid, process the feed
            try {
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
              // feedsmith: favicon/image is feedObject.feed.icon or feedObject.feed.logo or null
              const faviconUrl = feedObject.feed?.icon || feedObject.feed?.logo || null;

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
              const newErrorCount = feed.errorCount + 1;
              const updateData = {
                errorCount: newErrorCount,
                errorMessage: errMsg
              };
              
              // Set errorSince on first error (if not already set)
              if (!feed.errorSince) {
                updateData.errorSince = new Date();
              }
              
              // Mark as error if failures persist for 7+ days
              if (feed.errorSince) {
                const daysSinceFirstError = (new Date() - new Date(feed.errorSince)) / (1000 * 60 * 60 * 24);
                if (daysSinceFirstError >= 7) {
                  updateData.status = 'error';
                  console.log(`[Error] Feed marked as error after ${daysSinceFirstError.toFixed(1)} days of failures: ${feed.url}`);
                }
              }
              
              await feed.update(updateData);

              errorCount++;
            }

            //update lastFetched
            await feed.update({
              lastFetched: new Date()
            });
          })(),
          FEED_TIMEOUT_MS,
          feed.url
        );
      } catch (err) {
        const errMsg = err?.message || String(err) || 'Unknown error';

        if (errMsg.includes('timed out')) {
          console.log(`Timeout processing feed: ${feed.url} - skipping to next feed`);

          timeoutCount++;

          const newErrorCount = feed.errorCount + 1;
          const updateData = {
            errorCount: newErrorCount,
            errorMessage: err.message
          };
          
          // Set errorSince on first error (if not already set)
          if (!feed.errorSince) {
            updateData.errorSince = new Date();
          }
          
          // Mark as error if failures persist for 7+ days
          if (feed.errorSince) {
            const daysSinceFirstError = (new Date() - new Date(feed.errorSince)) / (1000 * 60 * 60 * 24);
            if (daysSinceFirstError >= 7) {
              updateData.status = 'error';
              console.log(`[Timeout] Feed marked as error after ${daysSinceFirstError.toFixed(1)} days of failures: ${feed.url}`);
            }
          }
          
          await feed.update(updateData);
        } else {
          console.log(`Failed to process feed: ${feed.url} - ${errMsg}`);
        }

        errorCount++;
      }
    })
  );
  }

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