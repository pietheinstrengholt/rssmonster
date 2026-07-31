import {
  fetchArticleDetails,
  fetchArticleIds
} from '../../api/articles.js';

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
      this.hasLoadedContent = false; // Show spinner immediately
      this.isLoading = true;

      const response = await fetchArticleIds(data);
      if (requestId !== this.activeRequestId) return;

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
    } catch (error) {
      if (requestId !== this.activeRequestId) return;

      console.warn('Article fetch failed', error?.message);
      this.hasLoadedContent = true;
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
        this.$store.data.currentSelection.sort
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
