const MAX_SEEN_PERSISTENCE_ATTEMPTS = 3;
const SEEN_RETRY_BASE_DELAY_MS = 200;

export function resolveReadingIdleGraceMs(value = import.meta.env.VITE_READING_IDLE_GRACE_SECONDS) {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 120_000;
}

// Clip the content against the browser and every enclosing scroll/clip surface,
// including Reader's detail panel and Expanded's inset scrolling container.
export function readingContentArea(content) {
  const rect = content.getBoundingClientRect();
  const viewport = window.visualViewport;
  let top = viewport?.offsetTop || 0;
  let bottom = top + (viewport?.height || window.innerHeight);
  let readingTop = top;
  let readingBottom = bottom;
  let left = viewport?.offsetLeft || 0;
  let right = left + (viewport?.width || window.innerWidth);
  for (let node = content; node && node !== document.documentElement; node = node.parentElement) {
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    const bounds = node.getBoundingClientRect();
    // Card clipping limits visibility, but only scroll surfaces define the reading line.
    if (/(auto|scroll|overlay)/.test(style.overflowY)) {
      readingTop = Math.max(readingTop, bounds.top);
      readingBottom = Math.min(readingBottom, bounds.bottom);
    }
    if (/(auto|scroll|hidden|clip|overlay)/.test(style.overflowY)) {
      top = Math.max(top, bounds.top);
      bottom = Math.min(bottom, bounds.bottom);
    }
    if (/(auto|scroll|hidden|clip|overlay)/.test(style.overflowX)) {
      left = Math.max(left, bounds.left);
      right = Math.min(right, bounds.right);
    }
  }
  const visibleTop = Math.max(top, rect.top);
  const visibleBottom = Math.min(bottom, rect.bottom);
  if (visibleBottom - visibleTop < Math.min(48, rect.height) || rect.height <= 0
    || Math.min(right, rect.right) <= Math.max(left, rect.left)) return null;
  const line = readingTop + (readingBottom - readingTop) * 0.4;
  return { top: visibleTop, bottom: visibleBottom, line,
    distance: Math.max(visibleTop - line, line - visibleBottom, 0) };
}

// Waits with linear backoff before another automatic seen-state attempt.
const waitBeforeSeenRetry = attempt => new Promise(resolve => {
  window.setTimeout(resolve, SEEN_RETRY_BASE_DELAY_MS * attempt);
});

// Creates observer and timing state for rendered feed articles.
// Capture contract: keep first/last observation timestamps and accumulated duration
// local to the current reading session. Persist firstSeen for actual exposure and
// attention from eligible readable-content time; never use readAt, lastClickedAt,
// favoritedAt or lastMeaningfulReadAt as a generic "last observed" timestamp.
// Exposure remains separate from eligible time attributed to one active content area.
export function createArticleFeedVisibilityState() {
  return {
    readingIdleGraceMs: resolveReadingIdleGraceMs(),
    lastReadingActivityAt: 0,
    activeReadingArticleId: null,
    readingTimer: null,
    readingTrackingStarted: false,
    persistedVisibleDuration: new Map(),
    readingWordCounts: new Map(),
    visibilityObserver: null,
    loadMoreObserver: null,
    observedArticleElements: new Map(),

    // tracks previous visibility state per article
    visibleMap: new Map(),

    // Monotonic start of the active eligible interval (at most one article).
    visibleSince: new Map(),

    // Accumulated eligible content time in this collection (ms).
    visibleDuration: new Map()
  };
}

// Groups observer setup, visibility timing, and passed-article detection.
export const articleFeedVisibilityMethods = {
  // Own one active interval. Timer callbacks are capped at the inactivity deadline,
  // including callbacks delayed by background throttling or a suspended computer.
  pauseReadingTime() {
    window.clearTimeout(this.readingTimer);
    this.readingTimer = null;
    for (const id of this.visibleSince.keys()) this.finalizeVisibleDuration(id);
    this.activeReadingArticleId = null;
  },

  // Snapshot before the DOM/collection changes. Attention saves never change read state.
  finishReadingSession() {
    this.pauseReadingTime();
    return this.flushReadingTime();
  },

  // Exposure shares the existing seen endpoint, with zero seconds and no read transition.
  // A zero local duration also deduplicates repeated observer callbacks in this collection.
  recordArticleExposure(articleId) {
    if (this.visibleDuration.has(articleId)) return false;
    this.visibleDuration.set(articleId, 0);
    if (this.articles.find(article => Number(article.id) === articleId)?.firstSeen) {
      this.persistedVisibleDuration.set(articleId, 0);
      return false;
    }
    return true;
  },

  async flushReadingTime() {
    const durations = this.persistedVisibleDuration;
    const selection = { ...this.selectionStore.currentSelection };
    const observations = [...this.visibleDuration].map(([id, ms]) => ({ id, ms,
      readingWordCount: this.readingWordCounts.get(id) }));
    const persist = async () => {
      for (const { id, ms, readingWordCount } of observations) {
        if (durations.has(id) && Math.round(ms / 1000) <= Math.round(durations.get(id) / 1000)) continue;
        for (let attempt = 1; attempt <= MAX_SEEN_PERSISTENCE_ATTEMPTS; attempt++) {
          const saved = await this.markArticleSeen(id, Math.round(ms / 1000), { attentionOnly: true, selection, ...(readingWordCount !== undefined ? { readingWordCount } : {}) });
          if (saved) {
            durations.set(id, ms);
            break;
          }
          if (attempt < MAX_SEEN_PERSISTENCE_ATTEMPTS) await waitBeforeSeenRetry(attempt);
        }
      }
    };
    // Share the existing queue so lifecycle summaries cannot race a passed-article save.
    const queuedPersistence = this.seenPersistenceQueue
      ? this.seenPersistenceQueue.catch(() => {}).then(persist)
      : persist();
    this.seenPersistenceQueue = queuedPersistence;
    return queuedPersistence;
  },

  handleReadingVisibility() {
    if (document.visibilityState !== 'visible') {
      this.finishReadingSession();
      return;
    }
    this.handleReadingActivity();
  },

  handleReadingActivity() {
    if (document.visibilityState !== 'visible') return;
    // Close using the OLD deadline before renewing it; idle gaps cannot be recovered.
    for (const id of this.visibleSince.keys()) this.finalizeVisibleDuration(id);
    this.lastReadingActivityAt = performance.now();
    this.refreshReadingTime();
  },

  refreshReadingTime() {
    window.clearTimeout(this.readingTimer);
    this.readingTimer = null;
    if (document.visibilityState !== 'visible') {
      this.pauseReadingTime();
      return;
    }
    const now = performance.now();
    if (now >= this.lastReadingActivityAt + this.readingIdleGraceMs) {
      this.finishReadingSession();
      return;
    }

    const selectedId = this.getSelectedReadingArticleId();
    const candidates = [];
    let newExposure = false;
    const requiresSelection = this.isReaderLayoutActive
      || this.selectionStore.currentSelection.viewMode === 'minimal';
    for (const [key, root] of this.observedArticleElements) {
      const id = Number(key);
      if (this.visibleMap.get(id) === false) continue;
      if (readingContentArea(root)) newExposure = this.recordArticleExposure(id) || newExposure;
      if ((requiresSelection && selectedId == null)
        || (selectedId != null && String(selectedId) !== key)) continue;
      for (const content of root.querySelectorAll('[data-reading-content]')) {
        if (!content.textContent.trim()) continue;
        const area = readingContentArea(content);
        if (area) candidates.push({ id, ...area });
      }
    }
    // Keep the current article unless a challenger is at least 24px closer to the
    // reading line. Comparing distances also prevents jitter in gaps between cards.
    const current = candidates.find(candidate => candidate.id === this.activeReadingArticleId);
    const best = candidates.sort((a, b) => a.distance - b.distance || a.id - b.id)[0];
    const next = current && current.distance <= best.distance + 24 ? current : best;
    const nextId = next?.id ?? null;
    const previousId = this.activeReadingArticleId;
    if (nextId !== previousId) {
      this.pauseReadingTime();
      this.activeReadingArticleId = nextId;
    }
    // Reading evidence is independent of the one-time mark-read pool and its setting.
    if (newExposure || (previousId != null && nextId !== previousId)) this.flushReadingTime();
    if (nextId != null && !this.visibleSince.has(nextId)) {
      if (!this.readingWordCounts.has(nextId)) {
        const root = this.observedArticleElements.get(String(nextId));
        // innerText follows rendered block boundaries and excludes hidden descendants.
        const text = [...root.querySelectorAll('[data-reading-content]')]
          .map(content => content.innerText ?? content.textContent).join(' ').replace(/\s+/gu, ' ').trim();
        this.readingWordCounts.set(nextId, Math.min(1000000, text ? text.split(' ').length : 0));
      }
      this.visibleSince.set(nextId, now);
    }
    this.readingTimer = window.setTimeout(this.refreshReadingTime,
      Math.min(250, this.lastReadingActivityAt + this.readingIdleGraceMs - now));
  },

  // Creates observers for article visibility and incremental loading.
  setupObservers() {
    this.readingTrackingStarted = true;
    document.addEventListener('visibilitychange', this.handleReadingVisibility);
    document.addEventListener('scroll', this.handleReadingActivity, { capture: true, passive: true });
    for (const type of ['keydown', 'touchstart', 'touchmove', 'wheel', 'pointerdown']) {
      document.addEventListener(type, this.handleReadingActivity, { passive: true });
    }
    window.addEventListener('pagehide', this.finishReadingSession);
    window.addEventListener('pageshow', this.handleReadingVisibility);
    this.lastReadingActivityAt = performance.now();
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
    this.finishReadingSession();
    this.readingTrackingStarted = false;
    document.removeEventListener('visibilitychange', this.handleReadingVisibility);
    document.removeEventListener('scroll', this.handleReadingActivity, true);
    for (const type of ['keydown', 'touchstart', 'touchmove', 'wheel', 'pointerdown']) {
      document.removeEventListener(type, this.handleReadingActivity);
    }
    window.removeEventListener('pagehide', this.finishReadingSession);
    window.removeEventListener('pageshow', this.handleReadingVisibility);
    this.visibilityObserver?.disconnect();
    this.loadMoreObserver?.disconnect();
    this.observedArticleElements.clear();
  },

  // Clears visibility observations and timing state before a collection is replaced.
  resetVisibilityTracking() {
    if (this.readingTrackingStarted) this.finishReadingSession();
    this.persistedVisibleDuration = new Map();
    this.readingWordCounts.clear();
    this.lastReadingActivityAt = performance.now();
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
      if (!activeIds.has(articleId) || this.getArticleElement(Number(articleId)) !== element) {
        this.finalizeVisibleDuration(Number(articleId));
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
    if (this.readingTrackingStarted) this.refreshReadingTime();
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
    if (this.readingTrackingStarted) this.refreshReadingTime();
  },

  // Adds an article's current visible interval to its accumulated duration.
  finalizeVisibleDuration(articleId) {
    const start = this.visibleSince.get(articleId);
    if (typeof start !== 'number') return;

    const end = Math.min(performance.now(), this.lastReadingActivityAt + this.readingIdleGraceMs);
    const elapsed = Math.max(0, end - start);
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

    const durations = this.persistedVisibleDuration;
    const readingWordCount = this.readingWordCounts?.get(articleId);
    const hasObservation = this.visibleDuration.has(articleId);
    const ms = this.visibleDuration.get(articleId) || 0;
    const selection = { ...this.selectionStore.currentSelection };
    const markAsReadOnScroll = this.selectionStore.effectiveMarkAsReadOnScroll === true;

    if (selection.viewMode === "minimal" && !this.isDesktopReaderWidth) {
      this.pool.add(articleId);
      return;
    }

    let attempt = this.seenPersistenceAttempts.get(articleId) || 0;
    if (attempt >= MAX_SEEN_PERSISTENCE_ATTEMPTS) return;

    this.pendingSeenArticleIds.add(articleId);

    // Automatic viewport callbacks can arrive in one observer batch. Persist them in order so
    // grouped event updates cannot contend with each other for the same article rows.
    const persist = async () => {
      while (attempt < MAX_SEEN_PERSISTENCE_ATTEMPTS) {
        attempt += 1;
        this.seenPersistenceAttempts.set(articleId, attempt);

        const visibleSeconds = Math.round(ms / 1000) > Math.round((durations?.get(articleId) || 0) / 1000) ? Math.round(ms / 1000) : 0;
        const persisted = await this.markArticleSeen(articleId, visibleSeconds, {
          selection, markAsReadOnScroll,
          recordObservation: hasObservation && (visibleSeconds > 0 || !durations?.has(articleId)),
          ...(readingWordCount !== undefined ? { readingWordCount } : {})
        });
        if (persisted) {
          durations?.set(articleId, Math.max(ms, durations.get(articleId) || 0));
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
