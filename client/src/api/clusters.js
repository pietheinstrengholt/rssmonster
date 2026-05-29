import api from './client';

/**
 * Fetch articles for a cluster or topic group
 */
export const fetchClusterArticles = (
  clusterId,
  clusterView = 'all',
  articleId = null
) =>
  api.post('/clusters/articles', {
    clusterId,
    clusterView,
    articleId
  });
