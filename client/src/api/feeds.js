import api from './client';

/**
 * Fetch all feeds
 */
export const fetchFeeds = () =>
  api.get('/feeds');

/**
 * Mute feed until a given ISO date
 */
export const muteFeed = (feedId, mutedUntil) =>
  api.post(`/feeds/mute/${feedId}`, { mutedUntil });

/**
 * Create a new feed
 */
export const createFeed = ({ categoryId, feedName, url }) =>
  api.post('/feeds', { categoryId, feedName, url });

/**
 * Delete a feed
 */
export const deleteFeed = (feedId) =>
  api.delete(`/feeds/${feedId}`);