import api from './client';

/**
 * Cleanup articles using the current user's saved archiving settings.
 */
export const cleanupOldArticles = () =>
  // Wait for the transaction to commit, even when a large cleanup exceeds the default timeout.
  api.post('/cleanup', null, { timeout: 0 });
