import api from './client';

/**
 * Fetch article IDs based on current selection
 */
export const fetchArticleIds = params =>
  api.get('/articles', { params: { ...params, includeFirstPage: true } });

/**
 * Fetch article details by IDs
 */
export const fetchArticleDetails = (articleIds, sort) =>
  api.post('/articles/details', {
    articleIds: articleIds.join(','),
    sort
  });

// This function fetches duplicates belonging to one canonical article.
export const fetchDuplicateArticles = articleId =>
  api.get(`/articles/duplicates/${articleId}`);

/**
 * Mark article as seen
 */
export const markArticleSeen = (id, payload) =>
  api.post(`/articles/markasseen/${id}`, payload, {
    suppressGlobalError: true,
    timeout: 30000
  });

/**
 * Mark article as unread
 */
export const markArticleUnread = (id) =>
  api.post(`/articles/marktounread/${id}`);

/**
 * Favorite / unfavorite article
 */
export const markAsFavorite = (articleId, update) =>
  api.post(`/articles/markasfavorite/${articleId}`, { update });

/**
 * Favorite / unfavorite multiple articles
 */
export const markManyAsFavorite = (articleIds, update) =>
  api.post('/articles/markasfavorite', { articleIds, update });

/**
 * Mark article as clicked
 */
export const markClicked = (articleId) =>
  api.post(`/articles/markclicked/${articleId}`);

/**
 * Mark multiple articles as clicked
 */
export const markManyClicked = (articleIds) =>
  api.post('/articles/markclicked', { articleIds });

/**
 * Mark article as not interested
 */
export const markNotInterested = (articleId) =>
  api.post(`/articles/marknotinterested/${articleId}`);

/**
 * Mark article as a positive recommendation signal
 */
export const markMoreLikeThis = (articleId) =>
  api.post(`/articles/markmorelikethis/${articleId}`);

/**
 * Mark all matching articles as read
 */
export const markAllAsRead = (currentSelection) =>
  api.post('/articles/markasread', currentSelection);

/**
 * Mark selected articles as read
 */
export const markArticlesAsRead = (articleIds) =>
  api.post('/articles/markasread', { articleIds });
