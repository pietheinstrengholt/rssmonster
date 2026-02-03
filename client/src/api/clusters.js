import api from './client';

/**
 * Fetch articles for a cluster
 */
export const fetchClusterArticles = (clusterId) =>
  api.get(`/clusters/${clusterId}/articles`);
