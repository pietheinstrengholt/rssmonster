import api from './client';

/**
 * Fetch articles for a cluster or topic group
 */
export const fetchClusterArticles = (
  clusterId,
  clusterView = 'all',
  topicKey = null,
  articleId = null
) => {
  console.log('fetchClusterArticles', { clusterId, clusterView, topicKey, articleId });
  return api.post('/clusters/articles', {
    clusterId,
    clusterView,
    topicKey,
    articleId
  });
};
