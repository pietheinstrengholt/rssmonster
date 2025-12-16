<template>
  <ArticleListView :articles="articles" :container="container" :pool="pool" :currentSelection="$store.data.currentSelection.status" :remainingItems="remainingItems" :fetchCount="fetchCount" :hasLoadedContent="hasLoadedContent" :isFlushed="isFlushed" :distance="distance" @forceReload="forceReload" @update-star="updateStarInd" @update-clicked="updateClickedInd">
  </ArticleListView>
</template>

<script>
import ArticleListView from "./ArticleListView.vue";
import axios from 'axios';

export default {
  components: {
    ArticleListView
  },
  data() {
    return {
      //distance is used to keep track of the current position in the container
      distance: 0,
      //articles containing the article details
      articles: [],
      //container contains a list with all article ids
      container: [],
      //is used to keep track of which articles are already flagged as passed
      pool: [],
      //scroll variables for comparing the scroll positions
      prevScroll: 0,
      scrollDirection: "down",
      hasLoadedContent: false,
      isFlushed: false,
      isLoading: false
    };
  },
  computed: {
    //calculate the remaining items in the container
    remainingItems() {
      return this.container.length - this.pool.length;
    },
    //adjust fetchCount based on viewMode
    fetchCount() {
      return this.$store.data.currentSelection.viewMode === "minimal" ? 50 : 20;
    }
  },
  //watch the currentSelection, fetch articleIds when detecting changes
  watch: {
    "$store.data.currentSelection": {
      handler: function(data) {
        this.fetchArticleIds(data);
      },
      deep: true
    }
  },
  async created() {
    window.addEventListener("scroll", this.handleScroll);
    axios.defaults.headers.common['Authorization'] = `Bearer ${this.$store.auth.token}`;
    
    //fetch the current selection from the server
    try {
      console.log("Fetching current selection from server.");
      const response = await axios.get(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/setting");
      this.$store.data.setCurrentSelection(response.data); // Note: this triggers the watcher to fetch article IDs
    } catch (error) {
      console.error("Error fetching settings:", error);
    }
  },
  unmounted() {
    window.removeEventListener("scroll", this.handleScroll);
  },
  methods: {
    async fetchArticleIds(data) {
      try {
        const response = await axios.get(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/articles", {
          params: data
        });
        await this.resetPool();
        this.container = response.data.itemIds;
        if (response.data.query && response.data.query.length > 0) {
          const sort = response.data.query[0].sort;
          if (sort) {
            this.$store.data.setSelectedSort(sort);
          }
        }
        if (this.container.length > 0) {
          this.getContent();
        } else {
          this.hasLoadedContent = true;
        }
      } catch (error) {
        console.error("Error fetching article IDs:", error);
      }
    },
    handleScroll() {
      const mobileToolbar = document.getElementById('mobile-toolbar');
      const curScroll = Math.ceil(window.scrollY) || Math.ceil(document.documentElement.scrollTop);
      let direction = curScroll > this.prevScroll ? "down" : (curScroll < this.prevScroll ? "up" : this.scrollDirection);
      if (direction !== this.scrollDirection && direction === "up") {
        mobileToolbar.classList.remove('hide');
      }
      if (direction === "down") {
        if (curScroll > 200) mobileToolbar.classList.add('hide');
        const mainContainer = document.getElementById('main-container');
        if (mainContainer && window.innerHeight + Math.ceil(document.documentElement.scrollTop) + 150 >= mainContainer.offsetHeight) {
          if (!(this.container.length < this.distance)) {
            if (!this.isLoading) {
              this.isLoading = true;
              this.getContent();
            }
          } else {
            this.flushPool();
          }
        }
        const articlesEl = document.getElementById('articles');
        if (articlesEl) {
          let screenHeight = Math.ceil(document.documentElement.scrollTop);
          for (const child of articlesEl.children) {
            screenHeight -= document.getElementById(child.id).offsetHeight;
            if (screenHeight > 0) {
              this.addToPool(child.id);
            }
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
          const response = await axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/articles/details", {
            articleIds: this.container.slice(this.distance, this.distance + this.fetchCount).join(","),
            sort: this.$store.data.getSelectedSort
          });
          this.hasLoadedContent = true;
          if (response.data.length) {
            this.distance += this.fetchCount;
            this.articles = this.articles.concat(response.data);
          } else {
            this.flushPool();
          }
        } catch (error) {
          console.error("Error fetching article details:", error);
        } finally {
          this.isLoading = false;
        }
      }, 10);
    },
    addToPool(articleId) {
      if (!this.pool.includes(articleId)) {
        this.pool.push(articleId);
        if (this.$store.data.getSelectedStatus === "unread" && this.$store.data.currentSelection.viewMode !== "minimal") {
          this.markArticleRead(articleId);
        }
      }
    },
    async flushPool() {
      if (this.container.length && !this.isFlushed) {
        if (this.$store.data.getSelectedStatus === "unread" && this.$store.data.currentSelection.viewMode !== "minimal") {
          for (const id of this.container) {
            if (!this.pool.includes(id)) {
              await this.markArticleRead(id);
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
    },
    async markArticleRead(articleId) {
      try {
        const response = await axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/articles/marktoread/" + articleId);
        this.$store.data.increaseReadCount(response.data);
      } catch (error) {
        console.log("oops something went wrong", error);
      }
    },
    forceReload() {
      this.$emit('forceReload');
    },
    updateStarInd({ id, starInd }) {
      const idx = this.articles.findIndex(a => a.id === id);
      if (idx !== -1) {
        this.articles[idx].starInd = starInd;
      }
    },
    updateClickedInd({ id, clickedInd }) {
      const idx = this.articles.findIndex(a => a.id === id);
      if (idx !== -1) {
        this.articles[idx].clickedInd = clickedInd;
      }
    }
  }
};
</script>