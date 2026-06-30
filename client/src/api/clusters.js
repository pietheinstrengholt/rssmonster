import api from './client';

/**
 * Fetch articles for a cluster or topic group
 */
export const fetchClusterArticles = (
  clusterId,
  eventView = 'all',
  articleId = null
) =>
  api.post('/clusters/articles', {
    clusterId,
    eventView,
    articleId
  });
