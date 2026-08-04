import {
  fetchArticleDetails,
  fetchArticleIds
} from '../../../api/articles.js';

// Creates article request and pagination state for the active feed selection.
export function createArticleFeedPaginationState() {
  return {
    // distance is used to keep track of the current position in the container
    distance: 0,

    // articles containing the article details
    articles: [],

    // container contains a list with all article ids
    container: [],

    hasLoadedContent: false,
    isLoading: false,
    currentViewSourceCount: null,
    activeRequestId: 0
  };
}

// Groups selection requests, page loading, and stale-response protection.
export const articleFeedPaginationMethods = {
  // Fetches article IDs and initializes the current selection's content.
  async fetchArticleIds(data) {
    const requestId = ++this.activeRequestId;

    try {
      await this.resetPool();
      this.scrollArticleListToTop();
      this.hasLoadedContent = false; // Show spinner immediately
      this.isLoading = true;

      const response = await fetchArticleIds(data);
      if (requestId !== this.activeRequestId) return null;

      this.container = response.data.itemIds;
      this.currentViewSourceCount = Number.isFinite(Number(response.data.sourceCount))
        ? Number(response.data.sourceCount)
        : null;

      if (response.data.firstPage) {
        this.distance += response.data.firstPage.length;
        this.articles = response.data.firstPage;
        this.hasLoadedContent = true;
        this.$nextTick(() => {
          this.observeArticles();
          this.observeLoadMoreSentinel();
        });
      } else if (this.container.length > 0) {
        this.isLoading = false;
        await this.getContent(requestId);
      } else {
        this.hasLoadedContent = true;
        this.$nextTick(() => this.observeLoadMoreSentinel());
      }
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
      if (requestId === this.activeRequestId) {
        this.isLoading = false;
      }
    }
  },

  // Returns every fully rebuilt article collection to the beginning across responsive scroll roots.
  scrollArticleListToTop() {
    const windowWasScrolled = window.scrollY > 0;
    const expandedArticlePane = document.querySelector('.expandedArticleLayout');
    const articlePane = document.getElementById('home');
    if (expandedArticlePane) expandedArticlePane.scrollTop = 0;
    if (articlePane) articlePane.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    if (windowWasScrolled) window.scrollTo({ top: 0, behavior: 'auto' });
  },

  // Refreshes the active selection while preserving rendered articles until replacement data is ready.
  async refreshArticleIds(data) {
    const requestId = ++this.activeRequestId;
    this.isLoading = true;

    try {
      const response = await fetchArticleIds(data);
      if (requestId !== this.activeRequestId) return false;

      const nextContainer = response.data.itemIds || [];
      let nextArticles = Array.isArray(response.data.firstPage)
        ? response.data.firstPage
        : null;

      if (nextContainer.length > 0 && (!nextArticles || nextArticles.length === 0)) {
        const ids = nextContainer.slice(0, this.fetchCount);
        const detailResponse = await fetchArticleDetails(ids, data.sort);
        if (requestId !== this.activeRequestId) return false;
        nextArticles = detailResponse.data || [];
      }

      await this.resetPool();
      if (requestId !== this.activeRequestId) return false;

      this.container = nextContainer;
      this.articles = nextArticles || [];
      this.distance = this.articles.length;
      this.currentViewSourceCount = Number.isFinite(Number(response.data.sourceCount))
        ? Number(response.data.sourceCount)
        : null;
      this.hasLoadedContent = true;
      this.$nextTick(() => {
        this.observeArticles();
        this.observeLoadMoreSentinel();
      });
      return true;
    } catch (error) {
      if (requestId !== this.activeRequestId) return false;

      console.error('Error refreshing articles:', error);
      throw error;
    } finally {
      if (requestId === this.activeRequestId) {
        this.isLoading = false;
      }
    }
  },

  // Loads the next article page when the list boundary is reached.
  handleLoadMoreIntersections(entries) {
    if (!entries.some(entry => entry.isIntersecting)) return;
    if (this.isLoading || !this.hasLoadedContent) return;

    if (this.distance < this.container.length) {
      this.getContent();
    }
  },

  // Fetches and appends details for the next page of article IDs.
  async getContent(requestId = this.activeRequestId) {
    if (!this.container.length || this.isLoading) return;

    this.isLoading = true;

    try {
      const ids = this.container.slice(this.distance, this.distance + this.fetchCount);

      const response = await fetchArticleDetails(
        ids,
        this.selectionStore.currentSelection.sort
      );
      if (requestId !== this.activeRequestId) return;

      this.hasLoadedContent = true;

      if (!response.data.length) {
        this.distance = this.container.length;
        return;
      }

      this.distance += response.data.length;
      this.articles = [...this.articles, ...response.data];

      this.$nextTick(() => {
        this.observeArticles();
        this.observeLoadMoreSentinel();
      });
    } catch (error) {
      if (requestId !== this.activeRequestId) return;
      console.error("Error fetching article details:", error);
    } finally {
      if (requestId === this.activeRequestId) {
        this.isLoading = false;
      }
    }
  },

  // Resets article, visibility, and observer state for a new selection.
  async resetPool() {
    this.visibilityObserver?.takeRecords?.();
    for (const element of this.observedArticleElements.values()) {
      this.visibilityObserver?.unobserve(element);
    }

    this.articles = [];
    this.container = [];
    this.pool = new Set();
    this.activeMinimalArticleId = null;
    this.pendingReadStatusArticleIds.clear();
    this.pendingSeenArticleIds.clear();
    this.seenPersistenceAttempts.clear();
    this.distance = 0;
    this.isFlushed = false;
    this.currentViewSourceCount = null;

    this.observedArticleElements.clear();
    this.visibleMap.clear();
    this.visibleSince.clear();
    this.visibleDuration.clear();
  }
};
