import api from './client';

/**
 * Cleanup old articles (removes non-starred articles older than one week)
 */
export const cleanupOldArticles = () =>
  api.post('/cleanup');
