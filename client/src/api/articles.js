import api from './client';
import { newerUnreadSelection } from '../services/unreadBaseline.js';
import { normalizeSortValueForApi } from '../services/queryValidation';
import { articleStateActions } from '../services/articleStateActions.js';

// Normalizes sort identifiers and disables settings persistence for folder requests.
const normalizeArticleParams = params => {
  const normalized = { ...params };
  if (normalized.smartFolderId != null) normalized.persistSettings = false;
  if (Object.hasOwn(normalized, 'sort')) {
    normalized.sort = normalizeSortValueForApi(normalized.sort);
  }
  return normalized;
};

const overlayResponse = async response => {
  if (!response) return response;
  if (Array.isArray(response.data)) response.data = await articleStateActions.overlay(response.data);
  else {
    if (response.data?.page?.articles) response.data.page.articles = await articleStateActions.overlay(response.data.page.articles);
    if (response.data?.firstPage) response.data.firstPage = await articleStateActions.overlay(response.data.firstPage);
  }
  return response;
};

export const syncArticleActions = (actions, token) => api.post('/articles/sync-actions', { actions }, {
  headers: { Authorization: `Bearer ${token}` }, allowOfflineSync: true, suppressGlobalError: true
});

/**
 * Fetch article IDs based on current selection
 */
export const fetchArticleIds = async params =>
  overlayResponse(await api.get('/articles', { params: { ...normalizeArticleParams(params), includeFirstPage: true } }));

// Fetches one bounded page from a stable database-native article snapshot.
export const fetchArticlePage = async (params, { pageSize, cursor = null } = {}) =>
  overlayResponse(await api.get('/articles', {
    params: {
      ...normalizeArticleParams(params),
      pagination: 'cursor',
      pageSize,
      ...(cursor ? { cursor } : {})
    }
  }));

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
export const fetchArticleDetails = async (articleIds, sort) =>
  overlayResponse(await api.post('/articles/details', {
    articleIds: articleIds.join(','),
    sort: normalizeSortValueForApi(sort)
  }));

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
const disconnected = () => navigator.onLine === false || articleStateActions.offline();
const articlesFor = (ids, articles = []) => ids.map(id => articles.find(article => String(article.id) === String(id)) || { id });
const stateOnlyReadFallback = articles => error => {
  if (!articleStateActions.available() || articles.some(article => article.duplicateOfArticleId != null) ||
    !(['ERR_NETWORK', 'ECONNABORTED', 'ETIMEDOUT'].includes(error.code) || error.response?.status >= 500)) throw error;
  return bulkAssignment(articles, 'set-status', 'read');
};
const bulkAssignment = async (articles, kind, value) => {
  const response = await articleStateActions.assign(articles, kind, value);
  return { data: { articles: response.data.articles || [response.data] } };
};

export const markArticleSeen = (id, payload, article = { id }) => {
  if (articleStateActions.available() && (article.duplicateOfArticleId == null || disconnected()) && payload.markRead && (disconnected() || (payload.recordObservation === false && payload.grouping !== 'event'))) {
    return articleStateActions.assign([article], 'set-status', 'read');
  }
  return articleStateActions.online(() => api.post(`/articles/markasseen/${id}`, payload, { suppressGlobalError: true, timeout: 30000 }),
    payload.markRead ? async error => {
      const response = await stateOnlyReadFallback([article])(error);
      return { data: response.data.articles[0] };
    } : undefined);
};
export const markArticleUnread = (id, article = { id }) => articleStateActions.available() && (article.duplicateOfArticleId == null || disconnected())
  ? articleStateActions.assign([article], 'set-status', 'unread')
  : articleStateActions.online(() => api.post(`/articles/marktounread/${id}`));
export const markAsFavorite = (id, update, article = { id }) => articleStateActions.available() && (article.duplicateOfArticleId == null || disconnected())
  ? articleStateActions.assign([article], 'set-favorite', update === 'mark')
  : articleStateActions.online(() => api.post(`/articles/markasfavorite/${id}`, { update }));
export const markManyAsFavorite = (articleIds, update, articles) => articleStateActions.available() && (!articles?.some(article => article.duplicateOfArticleId != null) || disconnected())
  ? bulkAssignment(articlesFor(articleIds, articles), 'set-favorite', update === 'mark')
  : articleStateActions.online(() => api.post('/articles/markasfavorite', { articleIds, update }));

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
  articleStateActions.online(() => api.post('/articles/markasread', {
    ...normalizeArticleParams(currentSelection),
    scope: 'matching',
    ...(snapshotArticleIds === undefined ? {} : { snapshotArticleIds })
  }));

/**
 * Mark selected articles as read
 */
export const markArticlesAsRead = (articleIds, grouping = 'none', articles) => articleStateActions.available() && (disconnected() || (grouping !== 'event' && !articles?.some(article => article.duplicateOfArticleId != null)))
  ? bulkAssignment(articlesFor(articleIds, articles), 'set-status', 'read')
  : articleStateActions.online(() => api.post('/articles/markasread', { articleIds, grouping }), stateOnlyReadFallback(articlesFor(articleIds, articles)));
