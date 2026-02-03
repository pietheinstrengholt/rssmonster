import api from './client';

export const fetchTopTags = (params) =>
  api.get('/tags', { params });
