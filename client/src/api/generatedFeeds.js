import api from './client';

export const fetchGeneratedFeeds = () => api.get('/generated-feeds');

export const createGeneratedFeed = generatedFeed =>
  api.post('/generated-feeds', generatedFeed);

export const updateGeneratedFeed = (generatedFeedId, generatedFeed) =>
  api.put(`/generated-feeds/${generatedFeedId}`, generatedFeed);

export const deleteGeneratedFeed = generatedFeedId =>
  api.delete(`/generated-feeds/${generatedFeedId}`);

export const regenerateGeneratedFeedToken = generatedFeedId =>
  api.post(`/generated-feeds/${generatedFeedId}/regenerate-token`);
