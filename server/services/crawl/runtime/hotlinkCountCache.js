import normalizeUrl from '../content/normalizeUrl.js';

// This function creates an in-memory hotlink count index for one user's crawl.
const createHotlinkCountCache = (hotlinks = []) => {
  const countsByUrlAndFeed = new Map();

  // This function indexes a hotlink by its normalized URL prefix and feed.
  const add = (hotlink) => {
    if (!hotlink.url) return;

    const url = normalizeUrl(hotlink.url);
    const countsByFeed = countsByUrlAndFeed.get(url) || new Map();

    countsByFeed.set(hotlink.feedId, (countsByFeed.get(hotlink.feedId) || 0) + 1);
    countsByUrlAndFeed.set(url, countsByFeed);
  };

  hotlinks.forEach(add);

  return {
    // This function counts links from feeds other than the article's own feed.
    count(url, feedId) {
      const countsByFeed = countsByUrlAndFeed.get(normalizeUrl(url));
      if (!countsByFeed) return 0;

      let count = 0;
      for (const [hotlinkFeedId, feedCount] of countsByFeed) {
        if (hotlinkFeedId !== feedId) count += feedCount;
      }

      return count;
    },
    add
  };
};

export default createHotlinkCountCache;
