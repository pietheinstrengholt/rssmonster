import api from './client';

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