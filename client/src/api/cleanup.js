import api from './client';

/**
 * Cleanup old articles (removes non-favorited articles older than one week)
 */
export const cleanupOldArticles = () =>
  api.post('/cleanup');
