import api from './client';

/**
 * Fetch all feeds
 */
export const fetchFeeds = () =>
  api.get('/feeds');

/**
 * Validate a feed URL
 */
export const validateFeed = (url, categoryId) =>
  api.post('/feeds/validate', { url, categoryId });

/**
 * Mute feed until a given ISO date
 */
export const muteFeed = (feedId, mutedUntil) =>
  api.post(`/feeds/mute/${feedId}`, { mutedUntil });

/**
 * Create a new feed
 */
export const createFeed = ({ categoryId, feedName, feedDesc, feedType, url, status, crawlSince }) =>
  api.post('/feeds', { categoryId, feedName, feedDesc, feedType, url, status, crawlSince });

/**
 * Update a feed
 */
export const updateFeed = (feedId, feedData) =>
  api.put(`/feeds/${feedId}`, feedData);

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