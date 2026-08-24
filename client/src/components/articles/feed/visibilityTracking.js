const MAX_SEEN_PERSISTENCE_ATTEMPTS = 3;
const SEEN_RETRY_BASE_DELAY_MS = 200;

// Waits with linear backoff before another automatic seen-state attempt.
const waitBeforeSeenRetry = attempt => new Promise(resolve => {
  window.setTimeout(resolve, SEEN_RETRY_BASE_DELAY_MS * attempt);
});

// Creates observer and timing state for rendered feed articles.
export function createArticleFeedVisibilityState() {
  return {
    visibilityObserver: null,
    loadMoreObserver: null,
    observedArticleElements: new Map(),

    // tracks previous visibility state per article
    visibleMap: new Map(),

    // timestamp when article became visible (ms)
    visibleSince: new Map(),

    // accumulated visible time per article (ms)
    visibleDuration: new Map()
  };
}

// Groups observer setup, visibility timing, and passed-article detection.
export const articleFeedVisibilityMethods = {
  // Creates observers for article visibility and incremental loading.
  setupObservers() {
    if (!('IntersectionObserver' in window)) return;

    this.visibilityObserver = new IntersectionObserver(
      this.handleArticleIntersections,
      { threshold: 0 }
    );
    this.loadMoreObserver = new IntersectionObserver(
      this.handleLoadMoreIntersections,
      {
        root: null,
        rootMargin: '300px 0px',
        threshold: 0
      }
    );

    this.$nextTick(() => {
      this.observeArticles();
      this.observeLoadMoreSentinel();
    });
  },

  // Disconnects observers and clears their tracked article elements.
  teardownObservers() {
    this.visibilityObserver?.disconnect();
    this.loadMoreObserver?.disconnect();
    this.observedArticleElements.clear();
  },

  // Clears visibility observations and timing state before a collection is replaced.
  resetVisibilityTracking() {
    this.visibilityObserver?.takeRecords?.();
    for (const element of this.observedArticleElements.values()) {
      this.visibilityObserver?.unobserve(element);
    }

    this.observedArticleElements.clear();
    this.visibleMap.clear();
    this.visibleSince.clear();
    this.visibleDuration.clear();
  },

  // Observes rendered articles and removes observers for stale elements.
  observeArticles() {
    if (!this.visibilityObserver) return;

    const activeIds = new Set(this.articles.map(article => String(article.id)));

    for (const [articleId, element] of this.observedArticleElements.entries()) {
      if (!activeIds.has(articleId)) {
        this.visibilityObserver.unobserve(element);
        this.observedArticleElements.delete(articleId);
        this.visibleMap.delete(Number(articleId));
        this.visibleSince.delete(Number(articleId));
      }
    }

    for (const article of this.articles) {
      const articleId = String(article.id);
      if (this.observedArticleElements.has(articleId)) continue;

      const element = this.getArticleElement(article.id);
      if (!element) continue;

      this.visibilityObserver.observe(element);
      this.observedArticleElements.set(articleId, element);
    }
  },

  // Observes the sentinel that triggers loading the next article page.
  observeLoadMoreSentinel() {
    if (!this.loadMoreObserver) return;

    const sentinel = this.getLoadMoreSentinel();
    if (sentinel) {
      this.loadMoreObserver.disconnect();
      this.loadMoreObserver.observe(sentinel);
    }
  },

  // Tracks article visibility and conditionally marks unread articles passed above the viewport.
  handleArticleIntersections(entries) {
    for (const entry of entries) {
      const articleId = Number(entry.target.id.replace('article-', ''));
      if (!Number.isFinite(articleId)) continue;

      if (entry.isIntersecting) {
        if (!this.visibleMap.get(articleId)) {
          this.visibleSince.set(articleId, performance.now());
        }
        this.visibleMap.set(articleId, true);
        continue;
      }

      if (this.visibleMap.get(articleId)) {
        this.finalizeVisibleDuration(articleId);
      }

      this.visibleMap.set(articleId, false);

      const selection = this.selectionStore.currentSelection;
      const effectiveMarkAsReadOnScroll = this.selectionStore.effectiveMarkAsReadOnScroll
        ?? selection.markAsReadOnScroll;
      const automaticUnreadTransitionDisabled = ['unread', 'briefing'].includes(selection.status)
        && effectiveMarkAsReadOnScroll === false;

      const articlePassedViewport = entry.boundingClientRect.bottom <= this.getReadingViewportTop();
      if (articlePassedViewport && !automaticUnreadTransitionDisabled) {
        this.addToPool(articleId);
      }
    }
  },

  // Adds an article's current visible interval to its accumulated duration.
  finalizeVisibleDuration(articleId) {
    const start = this.visibleSince.get(articleId);
    if (typeof start !== 'number') return;

    const elapsed = performance.now() - start;
    const total = (this.visibleDuration.get(articleId) || 0) + elapsed;
    this.visibleDuration.set(articleId, total);
    this.visibleSince.delete(articleId);
  },

  // Persists a passed article with bounded retries before committing it to the pool.
  async addToPool(articleId) {
    if (this.pool.has(articleId) || this.pendingSeenArticleIds.has(articleId)) return;

    // FINALIZE VISIBILITY IF ARTICLE IS STILL VISIBLE
    if (this.visibleSince.has(articleId)) {
      this.finalizeVisibleDuration(articleId);
    }

    const ms = this.visibleDuration.get(articleId) || 0;
    const visibleSeconds = Math.round(ms / 1000);

    if (this.selectionStore.currentSelection.viewMode === "minimal") {
      this.pool.add(articleId);
      return;
    }

    let attempt = this.seenPersistenceAttempts.get(articleId) || 0;
    if (attempt >= MAX_SEEN_PERSISTENCE_ATTEMPTS) return;

    this.pendingSeenArticleIds.add(articleId);

    // Automatic viewport callbacks can arrive in one observer batch. Persist them in order so
    // grouped event/topic updates cannot contend with each other for the same article rows.
    const persist = async () => {
      while (attempt < MAX_SEEN_PERSISTENCE_ATTEMPTS) {
        attempt += 1;
        this.seenPersistenceAttempts.set(articleId, attempt);

        const persisted = await this.markArticleSeen(articleId, visibleSeconds);
        if (persisted) {
          this.pool.add(articleId);
          this.seenPersistenceAttempts.delete(articleId);
          return;
        }

        if (attempt < MAX_SEEN_PERSISTENCE_ATTEMPTS) {
          await waitBeforeSeenRetry(attempt);
        }
      }
    };
    const queuedPersistence = this.seenPersistenceQueue
      ? this.seenPersistenceQueue.catch(() => {}).then(persist)
      : persist();
    this.seenPersistenceQueue = queuedPersistence;

    try {
      await queuedPersistence;
    } finally {
      this.pendingSeenArticleIds.delete(articleId);
    }
  }
};
