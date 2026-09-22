import api from './client';
import { newerUnreadSelection } from '../services/unreadBaseline.js';
import { normalizeSortValueForApi } from '../services/queryValidation';

// Normalizes sort identifiers and disables settings persistence for folder requests.
const normalizeArticleParams = params => {
  const normalized = { ...params };
  if (normalized.smartFolderId != null) normalized.persistSettings = false;
  if (Object.hasOwn(normalized, 'sort')) {
    normalized.sort = normalizeSortValueForApi(normalized.sort);
  }
  return normalized;
};

/**
 * Fetch article IDs based on current selection
 */
export const fetchArticleIds = params =>
  api.get('/articles', { params: { ...normalizeArticleParams(params), includeFirstPage: true } });

// Fetches one bounded page from a stable database-native article snapshot.
export const fetchArticlePage = (params, { pageSize, cursor = null } = {}) =>
  api.get('/articles', {
    params: {
      ...normalizeArticleParams(params),
      pagination: 'cursor',
      pageSize,
      ...(cursor ? { cursor } : {})
    }
  });

// Counts unread arrivals using the active selection's other filters.
export const fetchNewerArticleCount = (params, snapshotMaxArticleId) =>
  api.get('/articles', {
    params: { ...normalizeArticleParams(newerUnreadSelection(params, snapshotMaxArticleId)), newerThanArticleId: snapshotMaxArticleId }
  });

// This function fetches the structured Daily Briefing for the selected period and status.
export const fetchDailyBriefing = params =>
  api.get('/articles/briefing', { params });

/**
 * Fetch article details by IDs
 */
export const fetchArticleDetails = (articleIds, sort) =>
  api.post('/articles/details', {
    articleIds: articleIds.join(','),
    sort: normalizeSortValueForApi(sort)
  });

// This function fetches semantic recommendations for one selected Reader article.
export const fetchArticleRecommendations = articleId =>
  api.get(`/articles/${articleId}/recommendations`, {
    suppressGlobalError: true
  });

// This function fetches the other articles belonging to one developing story.
export const fetchDevelopingStoryArticles = articleId =>
  api.get(`/articles/${articleId}/developing-story`, {
    suppressGlobalError: true
  });

// This function fetches same-story articles published by different feeds.
export const fetchStorySourceArticles = articleId =>
  api.get(`/articles/${articleId}/story-sources`, {
    suppressGlobalError: true
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
 * Mark / unmark an article as clicked
 */
export const updateClickedStatus = (articleId, update) =>
  api.post(`/articles/markclicked/${articleId}`, { update });

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
export const markAllAsRead = (currentSelection, snapshotArticleIds) =>
  api.post('/articles/markasread', {
    ...normalizeArticleParams(currentSelection),
    scope: 'matching',
    ...(snapshotArticleIds === undefined ? {} : { snapshotArticleIds })
  });

/**
 * Mark selected articles as read
 */
export const markArticlesAsRead = (articleIds, grouping = 'none') =>
  api.post('/articles/markasread', { articleIds, grouping });
