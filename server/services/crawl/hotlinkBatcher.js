import hotlink from '../../controllers/hotlink.js';

const DEFAULT_FLUSH_THRESHOLD = 250;
const DEFAULT_MAX_PENDING_URLS = 1000;

// This function creates a bounded, best-effort hotlink writer for one feed.
const createHotlinkBatcher = (feed, options = {}) => {
  const flushThreshold = options.flushThreshold || DEFAULT_FLUSH_THRESHOLD;
  const maxPendingUrls = options.maxPendingUrls || DEFAULT_MAX_PENDING_URLS;
  const pendingUrls = new Set();
  let flushPromise = null;
  let overflowLogged = false;

  // This function flushes the queued URLs without allowing failures to interrupt crawling.
  const flush = async () => {
    if (flushPromise) {
      await flushPromise;
      return;
    }

    if (pendingUrls.size === 0) {
      return;
    }

    const urls = [...pendingUrls];
    pendingUrls.clear();
    flushPromise = hotlink.setMany(urls, feed.id, feed.userId)
      .catch(err => {
        console.error(`Error saving hotlink batch for feed ${feed.id}:`, err);
      })
      .finally(() => {
        flushPromise = null;
      });

    await flushPromise;
  };

  return {
    // This function queues unique URLs and starts a best-effort periodic flush.
    add(urls) {
      for (const url of urls) {
        if (pendingUrls.has(url)) continue;

        if (pendingUrls.size >= maxPendingUrls) {
          if (!overflowLogged) {
            console.warn(`Hotlink batch queue reached ${maxPendingUrls} URLs for feed ${feed.id}; dropping excess URLs.`);
            overflowLogged = true;
          }
          break;
        }

        pendingUrls.add(url);
      }

      if (pendingUrls.size >= flushThreshold) {
        void flush();
      }
    },
    flush
  };
};

export default createHotlinkBatcher;
