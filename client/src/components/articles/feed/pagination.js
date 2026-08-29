import {
  fetchArticleDetails,
  fetchArticleIds,
  fetchNewerArticleCount,
  fetchArticlePage
} from '../../../api/articles.js';

const COMPUTED_SORT_PATTERN = /(?:^|\s)sort:(?:trust|topStories|recommended|quality|attention)(?:\s|$)/i;
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
    usesCursorPagination: false,
    legacyItemIds: [],
    hasLoadedContent: false,
    isLoading: false,
    currentViewSourceCount: null,
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
  context.hasMore = context.distance < ids.length;
  context.legacyItemIds = ids;
  context.nextCursor = null;
  context.snapshotMaxArticleId = null;
  context.usesCursorPagination = false;
  return true;
};

const requestInitialCollection = async (context, data) => {
  if (!supportsArticleCursorPagination(data)) return fetchArticleIds(data);
  try {
    return await fetchArticlePage(data, { pageSize: context.fetchCount });
  } catch (error) {
    if (error?.response?.status !== 422) throw error;
    return fetchArticleIds(data);
  }
};

export const articleFeedPaginationMethods = {
  async fetchArticleIds(data) {
    const requestId = ++this.activeRequestId;
    try {
      await this.resetCollectionState();
      this.scrollArticleListToTop();
      this.hasLoadedContent = false;
      this.isLoading = true;

      const response = await requestInitialCollection(this, data);
      if (requestId !== this.activeRequestId) return null;
      if (response.data.paginationVersion === 1) {
        installCursorPage(this, response, { replace: true });
      } else if (!await installLegacyCollection(this, response, data, requestId)) {
        return null;
      }

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
      this.hasLoadedContent = true;
      return false;
    } finally {
      if (requestId === this.activeRequestId) this.isLoading = false;
    }
  },

  // Preserves the visible collection until a complete replacement first page is ready.
  async refreshArticleIds(data) {
    const requestId = ++this.activeRequestId;
    this.isLoading = true;
    try {
      const response = await requestInitialCollection(this, data);
      if (requestId !== this.activeRequestId) return false;

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
          'container', 'articles', 'distance', 'totalCount', 'currentViewSourceCount',
          'hasMore', 'nextCursor', 'snapshotMaxArticleId', 'usesCursorPagination', 'legacyItemIds'
        ]) this[key] = legacyPrepared[key];
      }

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
        const response = await fetchArticlePage(this.selectionStore.currentSelection, {
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
      return await this.refreshArticleIds(this.selectionStore.currentSelection);
    } catch {
      this.paginationError = 'Could not reload the article list.';
      return false;
    }
  },

  async checkForNewerArticles() {
    const requestId = ++this.activeNewerArticlesRequestId;
    const snapshotMaxArticleId = this.snapshotMaxArticleId;
    if (snapshotMaxArticleId === null) {
      this.newerArticlesAvailable = false;
      this.newerArticleCount = 0;
      return false;
    }

    try {
      const response = await fetchNewerArticleCount(
        this.selectionStore.currentSelection,
        snapshotMaxArticleId
      );
      if (
        requestId !== this.activeNewerArticlesRequestId
        || snapshotMaxArticleId !== this.snapshotMaxArticleId
      ) return false;
      this.newerArticleCount = finiteCount(response.data.newerArticleCount);
      this.newerArticlesAvailable = this.newerArticleCount > 0;
      return this.newerArticlesAvailable;
    } catch {
      if (requestId === this.activeNewerArticlesRequestId) {
        this.newerArticlesAvailable = false;
        this.newerArticleCount = 0;
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
    this.newerArticlesAvailable = false;
    this.newerArticleCount = 0;
    this.snapshotMaxArticleId = null;
    this.usesCursorPagination = false;
    this.legacyItemIds = [];
    this.currentViewSourceCount = null;
  }
};
