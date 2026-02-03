<template>
  <ArticleListView :articles="articles" :container="container" :pool="pool" :currentSelection="$store.data.currentSelection.status" :remainingItems="remainingItems" :fetchCount="fetchCount" :hasLoadedContent="hasLoadedContent" :isFlushed="isFlushed" :distance="distance" @forceReload="forceReload" @update-star="updateStarInd" @update-clicked="updateClickedInd" @cluster-articles-loaded="insertClusterArticles" @article-not-interested="removeArticle">
  </ArticleListView>
</template>

<script>
import ArticleListView from "./ArticleListView.vue";
import {
  fetchArticleIds,
  fetchArticleDetails,
  markArticleSeen,
  markArticleOpened
} from '../api/articles';

export default {
  components: {
    ArticleListView
  },

  data() {
    return {
      // distance is used to keep track of the current position in the container
      distance: 0,

      // articles containing the article details
      articles: [],

      // container contains a list with all article ids
      container: [],

      // is used to keep track of which articles are already flagged as passed
      pool: [],

      // scroll variables for comparing the scroll positions
      prevScroll: 0,
      scrollDirection: "down",

      hasLoadedContent: false,
      isFlushed: false,
      isLoading: false,

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
      return this.container.length - this.pool.length;
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
      handler(data) {
        this.fetchArticleIds(data);
      },
      deep: true
    }
  },

  async created() {
    window.addEventListener("scroll", this.handleScroll);
  },

  unmounted() {
    window.removeEventListener("scroll", this.handleScroll);
  },

  methods: {
    async fetchArticleIds(data) {
      try {
        const response = await fetchArticleIds(data);

        await this.resetPool();
        this.container = response.data.itemIds;

        if (this.container.length > 0) {
          this.getContent();
        } else {
          this.hasLoadedContent = true;
        }
      } catch (error) {
        console.warn('Article fetch failed', error?.message);
      }
    },

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

      if (direction === "down") {
        if (curScroll > 200) mobileToolbar?.classList.add("hide");

        const mainContainer = document.getElementById("main-container");
        if (
          mainContainer &&
          window.innerHeight +
            Math.ceil(document.documentElement.scrollTop) +
            150 >=
            mainContainer.offsetHeight
        ) {
          if (!(this.container.length < this.distance)) {
            if (!this.isLoading) {
              this.isLoading = true;
              this.getContent();
            }
          } else {
            this.flushPool();
          }
        }

        const articlesEl = document.getElementById("articles");

        if (articlesEl) {
          let screenHeight = Math.ceil(document.documentElement.scrollTop);

          for (const child of articlesEl.children) {
            const el = document.getElementById(child.id);
            if (!el) continue;

            const rect = el.getBoundingClientRect();
            const now = performance.now();

            /* ---------- PASS LOGIC (authoritative) ---------- */
            screenHeight -= el.offsetHeight;

            if (screenHeight > 0) {
              this.addToPool(child.id);
            }

            /* ---------- VISIBILITY / DWELL LOGIC ---------- */
            const isVisible = rect.top < window.innerHeight && rect.bottom > 0;

            const wasVisible = this.visibleMap.get(child.id) || false;

            // article just entered viewport, call opened()
            if (isVisible && !wasVisible) {
              this.opened(child.id);
              this.visibleSince.set(child.id, now);
            }

            // article just left viewport
            if (!isVisible && wasVisible) {
              const start = this.visibleSince.get(child.id);
              if (start) {
                // finalize dwell time
                const elapsed = now - start;
                const total = (this.visibleDuration.get(child.id) || 0) + elapsed;
                this.visibleDuration.set(child.id, total);
                this.visibleSince.delete(child.id);
              }
            }

            this.visibleMap.set(child.id, isVisible);
          }
        }
      }

      this.prevScroll = curScroll;
      this.scrollDirection = direction;
    },

    async getContent() {
      if (this.container.length === 0) return;

      setTimeout(async () => {
        try {
          const response = await fetchArticleDetails(
            this.container.slice(
              this.distance,
              this.distance + this.fetchCount
            ),
            this.$store.data.getSelectedSort
          );

          this.hasLoadedContent = true;

          if (response.data.length) {
            this.distance += this.fetchCount;
            this.articles = this.articles.concat(response.data);
          } else {
            this.flushPool();
          }
        } catch (error) {
          console.error(
            "Error fetching article details:",
            error
          );
        } finally {
          this.isLoading = false;
        }
      }, 10);
    },

    addToPool(articleId) {
      if (this.pool.includes(articleId)) return;

      const now = performance.now();

      // FINALIZE VISIBILITY IF ARTICLE IS STILL VISIBLE
      if (this.visibleSince.has(articleId)) {
        const start = this.visibleSince.get(articleId);
        const elapsed = now - start;
        const total = (this.visibleDuration.get(articleId) || 0) + elapsed;
        this.visibleDuration.set(articleId, total);
        this.visibleSince.delete(articleId);
      }

      this.pool.push(articleId);

      const ms = this.visibleDuration.get(articleId) || 0;
      const visibleSeconds = Math.round(ms / 1000);

      console.log("[MARK SEEN]", articleId, `visibleSeconds=${visibleSeconds}`);

      if (this.$store.data.currentSelection.viewMode !== "minimal") {
        this.markArticleSeen(articleId, visibleSeconds);
      }
    },

    async flushPool() {
      if (this.container.length && !this.isFlushed) {
        if (this.$store.data.currentSelection.viewMode !== "minimal") {
          for (const id of this.container) {
            if (!this.pool.includes(id)) {
              const ms = this.visibleDuration.get(id) || 0;
              const visibleSeconds = Math.round(ms / 1000);
              console.log("[FLUSH MARK SEEN]", id, `visibleSeconds=${visibleSeconds}`);
              await this.markArticleSeen(id, visibleSeconds);
            }
          }
        }
      }
      this.isFlushed = true;
    },

    async resetPool() {
      this.articles = [];
      this.container = [];
      this.pool = [];
      this.distance = 0;
      this.isFlushed = false;

      this.visibleMap.clear();
      this.visibleSince.clear();
      this.visibleDuration.clear();
    },

    async markArticleSeen(articleId, visibleSeconds = 0) {
      try {
        const response = await markArticleSeen(articleId, {
          clusterView: true,
          visibleSeconds,
          selectedStatus: this.$store.data.currentSelection.status
        });
        
        // Always reflect latest status (and related fields) in local articles array
        this.updateArticleStatusLocal(response.data);

        // Update counters when transitioning from unread view to read
        if (this.$store.data.currentSelection.status === 'unread' && response.data.status === "read") {
          this.$store.data.increaseReadCount(response.data);
        }
      } catch (error) {
        console.log("oops something went wrong", error);
      }
    },

    // Update article in local array with new status and optional fields
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

    // track article opened event
    async opened(articleId) {
      try {
        await markArticleOpened(articleId);
      } catch (error) {
        console.log("Error tracking article open", error);
      }
    },

    forceReload() {
      this.$emit("forceReload");
    },

    updateStarInd({ id, starInd }) {
      const idx = this.articles.findIndex(a => a.id === id);
      if (idx !== -1) {
        this.articles[idx].starInd = starInd;
      }
    },

    updateClickedInd({ id, clickedAmount }) {
      const idx = this.articles.findIndex(a => a.id === id);
      if (idx !== -1) {
        this.articles[idx].clickedAmount = clickedAmount;
      }
    },

    insertClusterArticles({ articleId, articles }) {
      console.log(`Inserting ${articles.length} cluster articles after article ${articleId}`);
      
      // Find the index of the clicked article
      const clickedIndex = this.articles.findIndex(a => a.id === articleId);
      
      if (clickedIndex === -1) {
        console.error('Could not find clicked article in articles list');
        return;
      }

      // Filter out articles that are already in the list to avoid duplicates
      const newArticles = articles.filter(
        article => !this.articles.some(a => a.id === article.id)
      );

      if (newArticles.length === 0) {
        console.log('All cluster articles are already in the list');
        return;
      }

      // Mark new articles as cluster articles
      const markedArticles = newArticles.map(article => ({
        ...article,
        isClusterArticle: true
      }));

      // Insert cluster articles right after the clicked article
      this.articles.splice(clickedIndex + 1, 0, ...markedArticles);
      
      console.log(`Successfully inserted ${markedArticles.length} cluster articles`);
    },

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