import api from './client';

/**
 * Fetch article IDs based on current selection
 */
export const fetchArticleIds = params =>
  api.get('/articles', { params });

/**
 * Fetch article details by IDs
 */
export const fetchArticleDetails = (articleIds, sort) =>
  api.post('/articles/details', {
    articleIds: articleIds.join(','),
    sort
  });

/**
 * Mark article as seen
 */
export const markArticleSeen = (id, payload) =>
  api.post(`/articles/markasseen/${id}`, payload);

/**
 * Track article opened
 */
export const markArticleOpened = id =>
  api.post(`/articles/markopened/${id}`);

/**
 * Star / unstar article
 */
export const markWithStar = (articleId, update) =>
  api.post(`/articles/markwithstar/${articleId}`, { update });

/**
 * Mark article as clicked
 */
export const markClicked = (articleId) =>
  api.post(`/articles/markclicked/${articleId}`);

/**
 * Mark article as not interested
 */
export const markNotInterested = (articleId) =>
  api.post(`/articles/marknotinterested/${articleId}`);

/**
 * Mark all matching articles as read
 */
export const markAllAsRead = (currentSelection) =>
  api.post('/articles/markasread', currentSelection);