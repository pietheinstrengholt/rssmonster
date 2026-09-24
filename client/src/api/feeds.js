import api from './client';

/**
 * Fetch all feeds
 */
export const fetchFeeds = ({ forceRefresh = false } = {}) => forceRefresh
  ? api.get('/feeds', { params: { refreshedAt: Date.now() } })
  : api.get('/feeds');

/**
 * Fetch one feed's overview observability snapshot.
 */
export const fetchFeedObservability = feedId =>
  api.get(`/feeds/${feedId}/observability`);

/**
 * Fetch expanded diagnostics for one feed crawl result.
 */
export const fetchFeedCrawlResult = (feedId, crawlResultId) =>
  api.get(`/feeds/${feedId}/crawls/${crawlResultId}`);

/**
 * Retry one feed through the production crawl pipeline.
 */
export const retryFeed = feedId =>
  api.post(`/feeds/${feedId}/retry`, null, { timeout: 120000 });

/**
 * Validate a feed URL
 */
const authenticationData = input => input.authenticationType === 'basic'
  ? { authenticationType: 'basic', authenticationUsername: input.authenticationUsername, authenticationPassword: input.authenticationPassword }
  : input.authenticationType === null ? { authenticationType: null } : {};

export const validateFeed = (url, categoryId, authentication = {}) =>
  api.post('/feeds/validate', { url, categoryId, ...authenticationData(authentication) });

/**
 * Test an HTML/XPath source without persisting it.
 */
export const testHtmlXpathSource = ({ url, sourceConfig }) =>
  api.post('/feeds/test-scraper', {
    url,
    sourceType: 'html_xpath',
    sourceConfig
  }, { timeout: 30000 });

/**
 * Mute feed until a given ISO date
 */
export const muteFeed = (feedId, mutedUntil) =>
  api.post(`/feeds/mute/${feedId}`, { mutedUntil });

/**
 * Create a new feed
 */
export const createFeed = ({
  categoryId,
  feedName,
  feedDesc,
  feedType,
  url,
  status,
  crawlSince,
  sourceConfig,
  ...authentication
}) => api.post('/feeds', {
  categoryId,
  feedName,
  feedDesc,
  feedType,
  url,
  status,
  crawlSince,
  ...(sourceConfig ? { sourceConfig } : {}),
  ...authenticationData(authentication)
});

/**
 * Update a feed
 */
export const updateFeed = (feedId, feedData) => {
  const { authenticationType, authenticationUsername, authenticationPassword, ...details } = feedData;
  return api.put(`/feeds/${feedId}`, {
    ...details,
    ...authenticationData({ authenticationType, authenticationUsername, authenticationPassword })
  });
};

/**
 * Rediscover RSS feed using AI
 */
export const rediscoverRss = (feedId) =>
  api.post(`/feeds/${feedId}/rediscover-rss`);

/**
 * Delete a feed
 */
export const deleteFeed = (feedId) =>
  api.delete(`/feeds/${feedId}`);

/**
 * Start a feed refresh job
 */
export const startFeedRefresh = () =>
  api.post('/feeds/refresh');

/**
 * Recalculate feed trust scores
 */
export const recalculateFeedTrust = () =>
  api.post('/feeds/recalculate-trust', null, { timeout: 120000 });
