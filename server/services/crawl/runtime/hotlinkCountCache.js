import normalizeUrl from '../content/normalizeUrl.js';

// This function creates an in-memory hotlink count index for one user's crawl.
const createHotlinkCountCache = (hotlinks = []) => {
  // Derives the counts by url and feed required while creating hotlink count cache.
  const countsByUrlAndFeed = new Map();

  // This function indexes a hotlink by its normalized URL prefix and feed.
  const add = (hotlink) => {
    // Returns early when hotlink url is unavailable.
    if (!hotlink.url) return;

    // Normalizes the url before performing add.
    const url = normalizeUrl(hotlink.url);
    // Derives the counts by feed required while performing add.
    const countsByFeed = countsByUrlAndFeed.get(url) || new Map();

    countsByFeed.set(hotlink.feedId, (countsByFeed.get(hotlink.feedId) || 0) + 1);
    countsByUrlAndFeed.set(url, countsByFeed);
  };

  hotlinks.forEach(add);

  return {
    // This function counts links from feeds other than the article's own feed.
    count(url, feedId) {
      // Derives the counts by feed through get while creating hotlink count cache.
      const countsByFeed = countsByUrlAndFeed.get(normalizeUrl(url));
      // Returns early when counts by feed is unavailable.
      if (!countsByFeed) return 0;

      let count = 0;
      // Processes each counts by feed entry in turn.
      for (const [hotlinkFeedId, feedCount] of countsByFeed) {
        // Handles the case where hotlink feed id is not feed id.
        if (hotlinkFeedId !== feedId) count += feedCount;
      }

      return count;
    },
    add
  };
};

export default createHotlinkCountCache;
