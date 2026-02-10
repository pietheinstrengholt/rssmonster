import api from './client';

/**
 * Fetch articles for a cluster or topic group
 */
export const fetchClusterArticles = (
  clusterId,
  clusterView = 'all',
  topicKey = null
) =>
  api.get(`/clusters/${clusterId}/articles`, {
    params: {
      clusterView,
      topicKey
    }
  });
