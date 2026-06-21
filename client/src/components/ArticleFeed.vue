<template>
  <ArticleListView :articles="articles" :container="container" :pool="pool" :currentSelection="$store.data.currentSelection.status" :remainingItems="remainingItems" :fetchCount="fetchCount" :hasLoadedContent="hasLoadedContent" :isFlushed="isFlushed" :distance="distance" @flush-pool="flushPool" @forceReload="forceReload" @update-star="updateStarInd" @update-clicked="updateClickedInd" @cluster-articles-loaded="insertClusterArticles" @cluster-articles-collapsed="removeClusterArticles" @article-not-interested="removeArticle">
  </ArticleListView>
</template>

<script>
import ArticleListView from "./ArticleListView.vue";
import {
  fetchArticleIds,
  fetchArticleDetails,
  markAllAsRead,
  markArticleSeen
} from '../api/articles';

export default {
  components: {
    ArticleListView
  },

  // Initializes article feed state and observer bookkeeping.
  data() {
    return {
      // distance is used to keep track of the current position in the container
      distance: 0,

      // articles containing the article details
      articles: [],

      // container contains a list with all article ids
      container: [],

      // is used to keep track of which articles are already flagged as passed
      pool: new Set(),

      // scroll variables for comparing the scroll positions
      prevScroll: 0,
      scrollDirection: "down",
      visibilityObserver: null,
      loadMoreObserver: null,
      observedArticleElements: new Map(),

      hasLoadedContent: false,
      isFlushed: false,
      isLoading: false,
      activeRequestId: 0,

      // tracks previous visibility state per article
      visibleMap: new Map(),

      // timestamp when article became visible (ms)
      visibleSince: new Map(),

      // accumulated visible time per article (ms)
      visibleDuration: new Map()
    };
  },

  computed: {
    // calculate the remaining items in the container
    remainingItems() {
      return this.container.length - this.pool.size;
    },

    // adjust fetchCount based on viewMode
    fetchCount() {
      return this.$store.data.currentSelection.viewMode === "minimal"
        ? 50
        : 20;
    }
  },

  watch: {
    "$store.data.currentSelection": {
      // Reloads articles when the active selection changes.
      handler(data) {
        this.fetchArticleIds(data);
      },
      deep: true,
      immediate: true
    }
  },

  // Starts scroll handling and article observers after mounting.
  mounted() {
    window.addEventListener("scroll", this.handleScroll);
    this.setupObservers();
  },

  // Removes scroll handling and disconnects observers before unmounting.
  unmounted() {
    window.removeEventListener("scroll", this.handleScroll);
    this.teardownObservers();
  },

  methods: {
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

        if (response.data.firstPage) {
          this.distance += response.data.firstPage.length;
          this.articles = response.data.firstPage;
          this.hasLoadedContent = true;
          this.$nextTick(() => {
            this.observeArticles();
            this.observeLoadMoreSentinel();
          });
        } else if (this.container.length > 0) {
          this.getContent();
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

    // Shows or hides the mobile toolbar based on scroll direction.
    handleScroll() {
      const mobileToolbar = document.getElementById("mobile-toolbar");
      const curScroll =
        Math.ceil(window.scrollY) ||
        Math.ceil(document.documentElement.scrollTop);

      const direction =
        curScroll > this.prevScroll
          ? "down"
          : curScroll < this.prevScroll
          ? "up"
          : this.scrollDirection;

      if (direction !== this.scrollDirection && direction === "up") {
        mobileToolbar?.classList.remove("hide");
      }

      if (direction === "down" && curScroll > 200) {
        mobileToolbar?.classList.add("hide");
      }

      this.prevScroll = curScroll;
      this.scrollDirection = direction;
    },

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

        const element = document.getElementById(`article-${article.id}`);
        if (!element) continue;

        this.visibilityObserver.observe(element);
        this.observedArticleElements.set(articleId, element);
      }
    },

    // Observes the sentinel that triggers loading the next article page.
    observeLoadMoreSentinel() {
      if (!this.loadMoreObserver) return;

      const sentinel = document.getElementById('article-load-sentinel');
      if (sentinel) {
        this.loadMoreObserver.disconnect();
        this.loadMoreObserver.observe(sentinel);
      }
    },

    // Tracks article visibility and marks articles passed above the viewport.
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

        if (entry.boundingClientRect.bottom <= 0) {
          this.addToPool(articleId);
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

    // Adds an article's current visible interval to its accumulated duration.
    finalizeVisibleDuration(articleId) {
      const start = this.visibleSince.get(articleId);
      if (typeof start !== 'number') return;

      const elapsed = performance.now() - start;
      const total = (this.visibleDuration.get(articleId) || 0) + elapsed;
      this.visibleDuration.set(articleId, total);
      this.visibleSince.delete(articleId);
    },

    // Fetches and appends details for the next page of article IDs.
    async getContent() {
      if (!this.container.length || this.isLoading) return;

      this.isLoading = true;

      try {
        const ids = this.container.slice(this.distance, this.distance + this.fetchCount);

        const response = await fetchArticleDetails(
          ids,
          this.$store.data.getSelectedSort
        );

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
        console.error("Error fetching article details:", error);
      } finally {
        this.isLoading = false;
      }
    },

    // Records a passed article and marks it seen outside minimal view.
    addToPool(articleId) {
      if (this.pool.has(articleId)) return;

      // FINALIZE VISIBILITY IF ARTICLE IS STILL VISIBLE
      if (this.visibleSince.has(articleId)) {
        this.finalizeVisibleDuration(articleId);
      }

      this.pool.add(articleId);

      const ms = this.visibleDuration.get(articleId) || 0;
      const visibleSeconds = Math.round(ms / 1000);

      console.log("[MARK SEEN]", articleId, `visibleSeconds=${visibleSeconds}`);

      if (this.$store.data.currentSelection.viewMode !== "minimal") {
        this.markArticleSeen(articleId, visibleSeconds);
      }
    },

    // Marks all unread articles in the current selection as read.
    async flushPool() {
      if (!this.container.length || this.isFlushed) return;

      try {
        await markAllAsRead(this.$store.data.currentSelection);
        this.articles = this.articles.map(article => ({ ...article, status: 'read' }));
        this.isFlushed = true;
        await this.$store.data.fetchOverviewSplit({ forceUpdate: true });
      } catch (error) {
        console.error('Error marking all articles as read:', error);
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
      this.distance = 0;
      this.isFlushed = false;

      this.observedArticleElements.clear();
      this.visibleMap.clear();
      this.visibleSince.clear();
      this.visibleDuration.clear();
    },

    // Persists an article's seen status and updates local read state.
    async markArticleSeen(articleId, visibleSeconds = 0) {
      try {
        const response = await markArticleSeen(articleId, {
          clusterView: this.$store.data.currentSelection.clusterView,
          visibleSeconds,
          selectedStatus: this.$store.data.currentSelection.status
        });
        
        // Always reflect latest status (and related fields) in local articles array.
        this.updateArticleStatusLocal(response.data);

        const readArticles = response.data.readArticles?.length
          ? response.data.readArticles
          : (response.data.status === "read" ? [response.data] : []);

        for (const readArticle of readArticles) {
          this.updateArticleStatusLocal({ id: readArticle.id, status: 'read' });
        }

        // Update counters when transitioning from unread view to read.
        if (this.$store.data.currentSelection.status === 'unread') {
          for (const readArticle of readArticles) {
            this.$store.data.increaseReadCount(readArticle);
          }
        }
      } catch (error) {
        console.log("oops something went wrong", error);
      }
    },

    // Updates an article's local status and optional returned fields.
    updateArticleStatusLocal(updatedArticle) {
      const idx = this.articles.findIndex(a => a.id === updatedArticle.id);
      if (idx !== -1) {
        const current = this.articles[idx];
        this.articles[idx] = {
          ...current,
          status: updatedArticle.status ?? current.status,
          firstSeen: updatedArticle.firstSeen ?? current.firstSeen,
          attentionBucket: updatedArticle.attentionBucket ?? current.attentionBucket
        };
      }
    },

    // Requests a full feed reload from the parent component.
    forceReload() {
      this.$emit("forceReload");
    },

    // Updates an article's local star indicator.
    updateStarInd({ id, starInd }) {
      const idx = this.articles.findIndex(a => a.id === id);
      if (idx !== -1) {
        this.articles[idx].starInd = starInd;
      }
    },

    // Updates an article's local click count.
    updateClickedInd({ id, clickedAmount }) {
      const idx = this.articles.findIndex(a => a.id === id);
      if (idx !== -1) {
        this.articles[idx].clickedAmount = clickedAmount;
      }
    },

    // Inserts related cluster articles directly after their parent article.
    insertClusterArticles({ articleId, articles }) {
      console.log(`Inserting ${articles.length} cluster articles after article ${articleId}`);
      
      // Remove any previously inserted cluster articles for this parent first
      this.removeClusterArticles({ articleId });

      // Build related list in server order, excluding the parent itself when present
      const relatedArticles = articles.filter(article => article.id !== articleId);

      if (relatedArticles.length === 0) {
        console.log('No related cluster articles to insert');
        return;
      }

      // Re-home existing related items to the parent location instead of dropping them
      const articlesToInsert = relatedArticles.map((article) => {
        const existingIndex = this.articles.findIndex(a => a.id === article.id);

        if (existingIndex !== -1) {
          const [existingArticle] = this.articles.splice(existingIndex, 1);
          return {
            ...existingArticle,
            ...article
          };
        }

        return article;
      });

      // Find the index of the clicked article after re-homing
      const clickedIndex = this.articles.findIndex(a => a.id === articleId);

      if (clickedIndex === -1) {
        console.error('Could not find clicked article in articles list');
        return;
      }

      // Mark cluster children with parent reference
      const markedArticles = articlesToInsert.map(article => ({
        ...article,
        isClusterArticle: true,
        clusterParentId: articleId
      }));

      // Insert cluster articles right after the clicked article
      this.articles.splice(clickedIndex + 1, 0, ...markedArticles);
      
      console.log(`Successfully inserted ${markedArticles.length} cluster articles`);
    },

    // Removes cluster articles currently inserted for a parent article.
    removeClusterArticles({ articleId }) {
      const before = this.articles.length;
      this.articles = this.articles.filter(a => a.clusterParentId !== articleId);
      const removed = before - this.articles.length;
      if (removed > 0) {
        console.log(`Removed ${removed} cluster articles for parent ${articleId}`);
      }
    },

    // Removes an article from the currently rendered feed.
    removeArticle({ id }) {
      console.log(`Removing article ${id} from view`);
      
      // Find and remove the article from the articles array
      const index = this.articles.findIndex(a => a.id === id);
      
      if (index !== -1) {
        this.articles.splice(index, 1);
        console.log(`Successfully removed article ${id}`);
      } else {
        console.error('Could not find article to remove:', id);
      }
    }
  }
};
</script>
