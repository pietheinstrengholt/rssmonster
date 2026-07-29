import hotlink from '../../../controllers/hotlink.js';

const DEFAULT_FLUSH_THRESHOLD = 250;
const DEFAULT_MAX_PENDING_URLS = 1000;

// This function creates a bounded, best-effort hotlink writer for one feed.
const createHotlinkBatcher = (feed, options = {}) => {
  const flushThreshold = options.flushThreshold || DEFAULT_FLUSH_THRESHOLD;
  const maxPendingUrls = options.maxPendingUrls || DEFAULT_MAX_PENDING_URLS;
  const pendingUrlsByArticleId = new Map();
  let pendingUrlCount = 0;
  let flushPromise = null;
  let overflowLogged = false;

  // This function flushes the queued URLs without allowing failures to interrupt crawling.
  const flush = async () => {
    while (flushPromise || pendingUrlsByArticleId.size > 0) {
      if (flushPromise) {
        await flushPromise;
        continue;
      }

      const pendingWrites = [...pendingUrlsByArticleId.entries()];
      pendingUrlsByArticleId.clear();
      pendingUrlCount = 0;
      flushPromise = hotlink.replaceMany(
        pendingWrites.map(([sourceArticleId, urls]) => ({
          sourceArticleId,
          urls: [...urls]
        })),
        feed.id,
        feed.userId
      )
        .catch(err => {
          console.error(`Error saving hotlink batch for feed ${feed.id}:`, err);
        })
        .finally(() => {
          flushPromise = null;
        });

      await flushPromise;
    }
  };

  return {
    // This function queues one article's unique URLs and starts a best-effort periodic flush.
    add(urls, sourceArticleId) {
      if (!sourceArticleId) return;

      const previousUrls = pendingUrlsByArticleId.get(sourceArticleId);
      if (previousUrls) {
        pendingUrlCount -= previousUrls.size;
      }

      const articleUrls = new Set();
      for (const url of urls) {
        if (articleUrls.has(url)) continue;

        if (pendingUrlCount + articleUrls.size >= maxPendingUrls) {
          if (!overflowLogged) {
            console.warn(`Hotlink batch queue reached ${maxPendingUrls} URLs for feed ${feed.id}; dropping excess URLs.`);
            overflowLogged = true;
          }
          break;
        }

        articleUrls.add(url);
      }
      pendingUrlsByArticleId.set(sourceArticleId, articleUrls);
      pendingUrlCount += articleUrls.size;

      if (pendingUrlCount >= flushThreshold) {
        void flush();
      }
    },
    flush
  };
};

export default createHotlinkBatcher;
