import api from './client';

export const fetchTopTags = (clusterView) =>
  api.get('/tags', { params: { clusterView } });
