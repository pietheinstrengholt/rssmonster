import api from './client';

export const fetchTopTags = (params) =>
  api.get('/tags', { params });

export const fetchAvailableTags = (params, config = {}) =>
  api.get('/tags', { ...config, params: { ...params, scope: 'all' } });

export const fetchArticleTags = (articleId, config = {}) =>
  api.get(`/articles/${articleId}`, config);

export const addArticleTags = (articleId, tags) =>
  api.post(`/articles/${articleId}/tags`, { tags }, { suppressGlobalError: true });

export const removeArticleTag = (articleId, tagId) =>
  api.delete(`/articles/${articleId}/tags/${tagId}`, { suppressGlobalError: true });
