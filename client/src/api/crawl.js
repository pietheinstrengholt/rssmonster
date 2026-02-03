import api from './client';

/**
 * Trigger feed crawl
 */
export const triggerCrawl = () =>
  api.get('/crawl');