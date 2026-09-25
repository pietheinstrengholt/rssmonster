import { loadUnreadBaseline, saveUnreadBaseline, newerUnreadSelection } from '../../../services/unreadBaseline.js';
import { withArticleDateFilters } from '../../../services/articleDateRange.js';
import { ageCutoffOptionsForOldest } from '../../../services/articleAgeCutoff.js';
import {
  fetchArticleDetails,
  fetchArticleIds,
  fetchNewerArticleCount,
  fetchArticlePage
} from '../../../api/articles.js';

const COMPUTED_SORT_PATTERN = /(?:^|\s)sort:(?:topStories|recommended|quality)(?:\s|$)/i;
const RUNTIME_FILTER_PATTERN = /(?:^|\s)(?:quality|freshness):/i;

// Returns whether the active selection can use database keyset pagination.
export const supportsArticleCursorPagination = selection => {
  const sort = String(selection?.sort || 'desc').toLowerCase();
  const search = String(selection?.search || '');
  return ['asc', 'desc'].includes(sort)
    && !COMPUTED_SORT_PATTERN.test(search)
    && !RUNTIME_FILTER_PATTERN.test(search);
};

const finiteCount = (value, fallback = 0) => {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : fallback;
};

// Publishes arrivals separately from the last full unread collection boundary.
const setNewerArticleCount = (context, count) => {
  context.newerArticleCount = count;
  context.newerArticlesAvailable = count > 0;
  context.overviewStore.setCurrentSelectionNewArticleCount(count);
};

const uniquePage = (itemIds = [], articles = [], existingIds = []) => {
  const existing = new Set(existingIds.map(id => String(id)));
  const articleMap = new Map(articles.map(article => [String(article.id), article]));
  const ids = [];
  const pageArticles = [];
  for (const id of itemIds) {
    const key = String(id);
    if (existing.has(key)) continue;
    const article = articleMap.get(key);
    if (!article) continue;
    existing.add(key);
    ids.push(id);
    pageArticles.push(article);
  }
  return { ids, articles: pageArticles };
};

// Creates article request and pagination state for the active feed selection.
export function createArticleFeedPaginationState() {
  return {
    distance: 0,
    articles: [],
    // container is retained as the ordered set of loaded collection IDs only.
    container: [],
    totalCount: 0,
    hasMore: false,
    nextCursor: null,
    paginationError: null,
    newerArticlesAvailable: false,
    newerArticleCount: 0,
    snapshotMaxArticleId: null,
    highestLoadedUnreadArticleId: null,
    showingNewOnly: false,
    loadedSelection: null,
    usesCursorPagination: false,
    legacyItemIds: [],
    hasLoadedContent: false,
    isLoading: false,
    currentViewSourceCount: null,
    oldestPublishedAt: null,
    activeRequestId: 0,
    activeNewerArticlesRequestId: 0,
    activeReaderRecommendationRequestId: 0
  };
}

const installCursorPage = (context, response, { replace = false } = {}) => {
  const page = response.data.page || {};
  const existingIds = replace ? [] : context.container;
  const unique = uniquePage(page.itemIds, page.articles, existingIds);
  context.container = replace ? unique.ids : [...context.container, ...unique.ids];

  const collectionArticleKeys = new Set(unique.ids.map(id => String(id)));
  const pageArticles = unique.articles.filter(article => collectionArticleKeys.has(String(article.id)));
  if (replace) {
    context.articles = pageArticles;
  } else {
    const incoming = new Set(pageArticles.map(article => String(article.id)));
    const retained = context.articles.filter(article => (
      !incoming.has(String(article.id))
      || article.readerRecommendationInd
    ));
    context.articles = [...retained, ...pageArticles];
  }

  context.distance = context.container.length;
  context.totalCount = finiteCount(response.data.totalCount, context.container.length);
  context.currentViewSourceCount = Number.isFinite(Number(response.data.sourceCount))
    ? Number(response.data.sourceCount)
    : null;
  if (replace) context.oldestPublishedAt = response.data.oldestPublishedAt ?? null;
  context.hasMore = Boolean(page.hasMore && page.nextCursor);
  context.nextCursor = context.hasMore ? page.nextCursor : null;
  context.paginationError = null;
  context.snapshotMaxArticleId = finiteCount(
    response.data.snapshot?.snapshotMaxArticleId
  );
  context.usesCursorPagination = true;
  if (replace) context.legacyItemIds = [];
};

const installLegacyCollection = async (context, response, data, requestId) => {
  const ids = [...new Map((response.data.itemIds || []).map(id => [String(id), id])).values()];
  let articles = Array.isArray(response.data.firstPage) ? response.data.firstPage : null;
  if (ids.length > 0 && (!articles || articles.length === 0)) {
    const detailResponse = await fetchArticleDetails(
      ids.slice(0, context.fetchCount),
      data.sort ?? context.selectionStore.currentSelection.sort
    );
    if (requestId !== context.activeRequestId) return false;
    articles = detailResponse.data || [];
  }
  const loaded = uniquePage(ids, articles || []);
  context.container = loaded.ids;
  context.articles = loaded.articles;
  context.distance = Math.min(ids.length, context.fetchCount);
  context.totalCount = ids.length;
  context.currentViewSourceCount = Number.isFinite(Number(response.data.sourceCount))
    ? Number(response.data.sourceCount)
    : null;
  context.oldestPublishedAt = response.data.oldestPublishedAt ?? null;
  context.hasMore = context.distance < ids.length;
  context.legacyItemIds = ids;
  context.nextCursor = null;
  context.snapshotMaxArticleId = response.data.snapshot?.snapshotMaxArticleId == null
    ? null
    : finiteCount(response.data.snapshot.snapshotMaxArticleId, null);
  context.usesCursorPagination = false;
  return true;
};

const acceptUnreadCollection = (context, response, selection, newOnly) => {
  context.loadedSelection = { ...selection };
  context.showingNewOnly = newOnly;
  if (selection.status !== 'unread') return;
  if (newOnly) {
    setNewerArticleCount(context, context.totalCount);
    return;
  }
  // An age-limited subset must not advance the full unread-list baseline.
  if (selection.publishedAfter) return;
  // Legacy ID responses contain the full ordered result; cursor responses supply its unread maximum.
  const highestId = response.data.snapshot?.highestUnreadArticleId
    ?? (response.data.itemIds || []).reduce((max, id) => Math.max(max, Number(id)), 0);
  context.highestLoadedUnreadArticleId = highestId;
  saveUnreadBaseline(context.authStore?.userId, selection, highestId);
};

const requestInitialCollection = async (context, data) => {
  const requestData = data.status === 'unread'
    ? { ...data, includeOldestPublishedAt: true, ageCutoff: context.selectionStore.ageCutoff }
    : data;
  if (!supportsArticleCursorPagination(data)) return fetchArticleIds(requestData);
  try {
    return await fetchArticlePage(requestData, { pageSize: context.fetchCount });
  } catch (error) {
    if (error?.response?.status !== 422) throw error;
    return fetchArticleIds(requestData);
  }
};

const resetUnavailableAgeCutoff = (context, response) => {
  if (!Object.hasOwn(response.data, 'oldestPublishedAt')) return false;
  const values = ageCutoffOptionsForOldest(response.data.oldestPublishedAt).map(option => option.value);
  if (values.includes(context.selectionStore.ageCutoff)) return false;
  context.selectionStore.setAgeCutoff('all');
  return true;
};

export const articleFeedPaginationMethods = {
  async fetchArticleIds(data, { newOnly = false } = {}) {
    data = withArticleDateFilters(data, this.selectionStore);
    this.showingNewOnly = newOnly;
    if (!newOnly) this.highestLoadedUnreadArticleId = loadUnreadBaseline(this.authStore?.userId, data);
    const requestId = ++this.activeRequestId;
    try {
      await this.resetCollectionState();
      this.scrollArticleListToTop();
      this.hasLoadedContent = false;
      this.isLoading = true;

      const response = await requestInitialCollection(this, data);
      if (requestId !== this.activeRequestId) return null;
      if (resetUnavailableAgeCutoff(this, response)) return null;
      if (response.data.paginationVersion === 1) {
        installCursorPage(this, response, { replace: true });
      } else if (!await installLegacyCollection(this, response, data, requestId)) {
        return null;
      }

      acceptUnreadCollection(this, response, data, newOnly);
      this.hasLoadedContent = true;
      this.$nextTick(() => {
        this.observeArticles();
        this.observeLoadMoreSentinel();
      });
      await this.$nextTick();
      if (requestId !== this.activeRequestId) return null;
      this.scrollArticleListToTop();
      return true;
    } catch (error) {
      if (requestId !== this.activeRequestId) return null;
      console.warn('Article fetch failed', error?.message);
      this.paginationError = 'Could not load articles. Please try again.';
      return false;
    } finally {
      if (requestId === this.activeRequestId) this.isLoading = false;
    }
  },

  // Preserves the visible collection until a complete replacement first page is ready.
  async refreshArticleIds(data, { newOnly = false } = {}) {
    data = withArticleDateFilters(data, this.selectionStore);
    const requestId = ++this.activeRequestId;
    this.isLoading = true;
    try {
      const response = await requestInitialCollection(this, data);
      if (requestId !== this.activeRequestId) return false;
      if (resetUnavailableAgeCutoff(this, response)) return false;

      let legacyPrepared = null;
      if (response.data.paginationVersion !== 1) {
        const staged = {
          ...createArticleFeedPaginationState(),
          fetchCount: this.fetchCount,
          selectionStore: this.selectionStore,
          activeRequestId: requestId
        };
        if (!await installLegacyCollection(staged, response, data, requestId)) return false;
        legacyPrepared = staged;
      }

      await this.resetCollectionState();
      if (requestId !== this.activeRequestId) return false;
      if (response.data.paginationVersion === 1) {
        installCursorPage(this, response, { replace: true });
      } else {
        for (const key of [
          'container', 'articles', 'distance', 'totalCount', 'currentViewSourceCount', 'oldestPublishedAt',
          'hasMore', 'nextCursor', 'snapshotMaxArticleId', 'usesCursorPagination', 'legacyItemIds'
        ]) this[key] = legacyPrepared[key];
      }

      acceptUnreadCollection(this, response, data, newOnly);
      this.hasLoadedContent = true;
      this.$nextTick(() => {
        this.observeArticles();
        this.observeLoadMoreSentinel();
      });
      await this.$nextTick();
      if (requestId !== this.activeRequestId) return false;
      this.scrollArticleListToTop();
      return true;
    } catch (error) {
      if (requestId !== this.activeRequestId) return false;
      console.error('Error refreshing articles:', error);
      throw error;
    } finally {
      if (requestId === this.activeRequestId) this.isLoading = false;
    }
  },

  handleLoadMoreIntersections(entries) {
    if (!entries.some(entry => entry.isIntersecting)) return;
    if (this.isLoading || !this.hasLoadedContent || !this.hasMore) return;
    this.getContent();
  },

  async getContent(requestId = this.activeRequestId) {
    if (this.isLoading || !this.hasMore) return;
    this.isLoading = true;
    try {
      if (this.usesCursorPagination) {
        const response = await fetchArticlePage(this.loadedSelection || this.selectionStore.currentSelection, {
          pageSize: this.fetchCount,
          cursor: this.nextCursor
        });
        if (requestId !== this.activeRequestId) return;
        installCursorPage(this, response);
      } else {
        const ids = this.legacyItemIds.slice(this.distance, this.distance + this.fetchCount);
        const response = await fetchArticleDetails(ids, this.selectionStore.currentSelection.sort);
        if (requestId !== this.activeRequestId) return;
        const unique = uniquePage(ids, response.data, this.articles.map(article => article.id));
        this.distance += ids.length;
        this.container = [...this.container, ...unique.ids];
        this.articles = [...this.articles, ...unique.articles];
        this.hasMore = this.distance < this.legacyItemIds.length;
      }

      this.hasLoadedContent = true;
      this.$nextTick(() => {
        this.observeArticles();
        this.observeLoadMoreSentinel();
      });
    } catch (error) {
      if (requestId !== this.activeRequestId) return;
      if (this.usesCursorPagination) {
        this.hasMore = false;
        this.nextCursor = null;
        if (error?.response?.data?.error?.restartRequired === true) {
          return this.retryPagination();
        }
        this.paginationError = 'Could not load more articles.';
      }
      console.error('Error fetching article details:', error);
    } finally {
      if (requestId === this.activeRequestId) this.isLoading = false;
    }
  },

  async retryPagination() {
    this.paginationError = null;
    try {
      return await this.refreshArticleIds(this.loadedSelection || this.selectionStore.currentSelection, { newOnly: this.showingNewOnly });
    } catch {
      this.paginationError = 'Could not reload the article list.';
      return false;
    }
  },

  async showNewArticles() {
    const selection = newerUnreadSelection(this.selectionStore.currentSelection, this.highestLoadedUnreadArticleId);
    if (!selection) return this.showFullUnreadList();
    try {
      const loaded = await this.refreshArticleIds(selection, { newOnly: true });
      if (loaded && this.totalCount === 0) return this.showFullUnreadList();
      return loaded;
    } catch {
      this.paginationError = 'Could not load new articles. Please try again.';
      return false;
    }
  },

  async reloadDateFilters() {
    const newOnly = this.showingNewOnly;
    const selection = newOnly
      ? newerUnreadSelection(this.selectionStore.currentSelection, this.highestLoadedUnreadArticleId)
      : this.selectionStore.currentSelection;
    return this.fetchArticleIds(selection || this.selectionStore.currentSelection, { newOnly: newOnly && Boolean(selection) });
  },

  async showFullUnreadList() {
    try {
      return await this.refreshArticleIds(this.selectionStore.currentSelection);
    } catch {
      this.paginationError = 'Could not reload the article list. Please try again.';
      return false;
    }
  },

  async checkForNewerArticles() {
    if (this.isLoading) return false;
    const requestId = ++this.activeNewerArticlesRequestId;
    const collectionRequestId = this.activeRequestId;
    const selection = withArticleDateFilters(this.selectionStore.currentSelection, this.selectionStore);
    const selectionKey = JSON.stringify(this.selectionStore.currentSelection);
    const snapshotMaxArticleId = this.highestLoadedUnreadArticleId;
    if (selection.status !== 'unread' || snapshotMaxArticleId === null) {
      setNewerArticleCount(this, 0);
      return false;
    }

    try {
      const response = await fetchNewerArticleCount(
        selection,
        snapshotMaxArticleId
      );
      if (
        requestId !== this.activeNewerArticlesRequestId
        || collectionRequestId !== this.activeRequestId
        || selectionKey !== JSON.stringify(this.selectionStore.currentSelection)
        || snapshotMaxArticleId !== this.highestLoadedUnreadArticleId
      ) return false;
      setNewerArticleCount(this, finiteCount(response.data.newerArticleCount));
      return this.newerArticlesAvailable;
    } catch {
      if (requestId === this.activeNewerArticlesRequestId && collectionRequestId === this.activeRequestId) {
        setNewerArticleCount(this, 0);
      }
      return false;
    }
  },

  async loadReaderRecommendationArticle(articleId) {
    const requestId = ++this.activeReaderRecommendationRequestId;
    const existingArticle = this.articles.find(article => String(article.id) === String(articleId));
    if (existingArticle) return existingArticle;
    const collectionRequestId = this.activeRequestId;
    const response = await fetchArticleDetails([articleId], this.selectionStore.currentSelection.sort);
    if (requestId !== this.activeReaderRecommendationRequestId || collectionRequestId !== this.activeRequestId) return null;
    const article = response.data?.[0];
    if (!article) return null;
    const readerArticle = { ...article, readerRecommendationInd: true };
    this.articles = [...this.articles, readerArticle];
    return readerArticle;
  },

  resetPaginationState() {
    this.activeReaderRecommendationRequestId += 1;
    this.activeNewerArticlesRequestId += 1;
    this.articles = [];
    this.container = [];
    this.distance = 0;
    this.totalCount = 0;
    this.hasMore = false;
    this.nextCursor = null;
    this.paginationError = null;
    setNewerArticleCount(this, 0);
    this.snapshotMaxArticleId = null;
    this.loadedSelection = null;
    this.usesCursorPagination = false;
    this.legacyItemIds = [];
    this.currentViewSourceCount = null;
    this.oldestPublishedAt = null;
  }
};
