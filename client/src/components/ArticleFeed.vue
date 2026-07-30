<template>
  <SmartFoldersGridOverview
    v-if="showSmartFoldersOverview"
    :smart-folders="$store.data.smartFolders"
    @selectSmartFolder="selectSmartFolderFromOverview"
  />
  <ArticleReaderLayout v-else-if="isReaderLayoutActive" :articles="articles" :container="container" :currentSelection="$store.data.currentSelection.status" :current-view-unread-count="currentViewUnreadCount" :current-view-source-count="currentViewSourceCount" :remainingItems="remainingItems" :fetchCount="fetchCount" :hasLoadedContent="hasLoadedContent" :isFlushed="isFlushed" :distance="distance" @flush-pool="flushPool" @clear-filters="clearFilters" @refresh-feeds="refreshFeeds" @open-smart-folders="openSmartFolders" @forceReload="forceReload" @mark-previous-article-read="markReaderPreviousArticleRead" @bulk-action="handleReaderBulkAction" @update-favorite="updateFavoriteInd" @update-clicked="updateClickedInd" @toggle-read-status="toggleReaderArticleReadStatus" @shortcut-toggle-read="toggleShortcutArticleReadStatus" @shortcut-toggle-favorite="toggleShortcutArticleFavorite" @event-articles-loaded="insertClusterArticles" @event-articles-collapsed="removeClusterArticles" @duplicate-articles-loaded="insertDuplicateArticles" @duplicate-articles-collapsed="removeDuplicateArticles" @article-not-interested="removeArticle">
  </ArticleReaderLayout>
  <ArticleListView v-else :articles="articles" :container="container" :pool="pool" :currentSelection="$store.data.currentSelection.status" :current-view-unread-count="currentViewUnreadCount" :current-view-source-count="currentViewSourceCount" :view-mode="$store.data.currentSelection.viewMode" :remainingItems="remainingItems" :fetchCount="fetchCount" :hasLoadedContent="hasLoadedContent" :isFlushed="isFlushed" :distance="distance" :activeMinimalArticleId="activeMinimalArticleId" @flush-pool="flushPool" @clear-filters="clearFilters" @refresh-feeds="refreshFeeds" @open-smart-folders="openSmartFolders" @forceReload="forceReload" @update-favorite="updateFavoriteInd" @update-clicked="updateClickedInd" @minimal-article-opened="handleMinimalArticleOpened" @minimal-article-closed="handleMinimalArticleClosed" @toggle-read-status="toggleReaderArticleReadStatus" @toggle-minimal-read-status="toggleMinimalArticleReadStatus" @shortcut-toggle-read="toggleShortcutArticleReadStatus" @shortcut-toggle-favorite="toggleShortcutArticleFavorite" @event-articles-loaded="insertClusterArticles" @event-articles-collapsed="removeClusterArticles" @duplicate-articles-loaded="insertDuplicateArticles" @duplicate-articles-collapsed="removeDuplicateArticles" @article-not-interested="removeArticle">
  </ArticleListView>
</template>

<script>
import ArticleListView from "./ArticleListView.vue";
import ArticleReaderLayout from "./ArticleReaderLayout.vue";
import SmartFoldersGridOverview from "./SmartFoldersGridOverview.vue";
import {
  markAsFavorite,
  markManyClicked,
  markManyAsFavorite
} from '../api/articles';
import { articleFeedClusterInsertionMethods } from './articleFeed/clusterInsertion.js';
import {
  createArticleFeedPaginationState,
  articleFeedPaginationMethods
} from './articleFeed/pagination.js';
import {
  createArticleFeedReadState,
  articleFeedReadStateMethods
} from './articleFeed/readState.js';
import {
  createArticleFeedVisibilityState,
  articleFeedVisibilityMethods
} from './articleFeed/visibilityTracking.js';
import { notifyActionError } from '../services/actionNotifications.js';

export default {
  components: {
    ArticleListView,
    ArticleReaderLayout,
    SmartFoldersGridOverview
  },

  // Initializes article feed state and observer bookkeeping.
  data() {
    return {
      ...createArticleFeedPaginationState(),
      ...createArticleFeedReadState(),
      ...createArticleFeedVisibilityState(),

      // scroll variables for comparing the scroll positions
      prevScroll: 0,
      scrollDirection: "down",
      scrollContainer: null,
      desktopReaderQuery: null,
      isDesktopReaderWidth: false,
      showSmartFoldersOverview: false
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
    },

    // Returns whether the reader layout should replace the normal stream.
    isReaderLayoutActive() {
      return this.$store.data.currentSelection.viewMode === 'reader' && this.isDesktopReaderWidth;
    },

    // Returns the unread count for the currently selected article scope.
    currentViewUnreadCount() {
      const selection = this.$store.data.currentSelection;
      if (selection.status !== 'unread') return 0;

      if (selection.smartFolderId !== null) {
        const smartFolder = this.$store.data.smartFolders.find(folder => folder.id === selection.smartFolderId);
        return smartFolder?.ArticleCount ?? 0;
      }

      const categoryId = Number(selection.categoryId);
      const feedId = Number(selection.feedId);
      const category = Number.isFinite(categoryId)
        ? this.$store.data.categories.find(item => item.id === categoryId)
        : null;

      if (Number.isFinite(feedId) && category) {
        const feed = category.feeds?.find(item => item.id === feedId);
        return feed?.unreadCount ?? 0;
      }

      if (category) {
        return category.unreadCount ?? 0;
      }

      return this.$store.data.unreadCount;
    }
  },

  watch: {
    "$store.data.currentSelection": {
      // Reloads articles when the active selection changes.
      handler(data) {
        this.showSmartFoldersOverview = false;
        this.fetchArticleIds(data);
      },
      deep: true,
      immediate: true
    },
    isReaderLayoutActive() {
      this.$nextTick(() => {
        this.observeArticles();
        this.observeLoadMoreSentinel();
      });
    }
  },

  // Starts scroll handling and article observers after mounting.
  mounted() {
    this.scrollContainer = document.getElementById("home");
    this.desktopReaderQuery = window.matchMedia('(min-width: 1024px)');
    this.isDesktopReaderWidth = this.desktopReaderQuery.matches;
    this.desktopReaderQuery.addEventListener('change', this.handleReaderWidthChange);
    window.addEventListener("scroll", this.handleScroll, { passive: true });
    window.addEventListener("keydown", this.handleGlobalShortcut);
    this.scrollContainer?.addEventListener("scroll", this.handleScroll, { passive: true });
    this.setupObservers();
  },

  // Removes scroll handling and disconnects observers before unmounting.
  unmounted() {
    window.removeEventListener("scroll", this.handleScroll);
    window.removeEventListener("keydown", this.handleGlobalShortcut);
    this.scrollContainer?.removeEventListener("scroll", this.handleScroll);
    this.desktopReaderQuery?.removeEventListener('change', this.handleReaderWidthChange);
    this.teardownObservers();
  },

  methods: {
    ...articleFeedPaginationMethods,
    ...articleFeedVisibilityMethods,
    ...articleFeedReadStateMethods,
    ...articleFeedClusterInsertionMethods,

    // Updates reader layout activation when the desktop breakpoint changes.
    handleReaderWidthChange(event) {
      this.isDesktopReaderWidth = event.matches;
      this.$nextTick(() => {
        this.observeArticles();
        this.observeLoadMoreSentinel();
      });
    },

    // Shows or hides the mobile toolbar based on scroll direction.
    handleScroll() {
      const mobileToolbar = document.getElementById("mobile-toolbar");
      const curScroll =
        Math.ceil(this.scrollContainer?.scrollTop) ||
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
    // Handles shortcuts that apply to every article view mode.
    handleGlobalShortcut(event) {
      if (this.shouldIgnoreGlobalShortcut(event)) return;

      if (event.key === 'R') {
        event.preventDefault();
        this.forceReload();
        return;
      }

      if (event.key === '/') {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent('rssmonster:focus-search'));
      }
    },
    // Returns whether a global shortcut should ignore the current target.
    shouldIgnoreGlobalShortcut(event) {
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      const isEditableTarget = ['input', 'textarea', 'select'].includes(tagName)
        || target?.isContentEditable
        || Boolean(target?.closest?.('[contenteditable="true"], [contenteditable=""]'));

      return Boolean(event.altKey || event.ctrlKey || event.metaKey || isEditableTarget);
    },

    // Toggles an article favorite state from a keyboard shortcut.
    async toggleShortcutArticleFavorite({ id }) {
      const article = this.articles.find(item => String(item.id) === String(id));
      if (!article) return;

      const newFavoriteInd = article.favoriteInd === 1 ? 0 : 1;
      const updateType = newFavoriteInd ? 'mark' : 'unmark';

      try {
        const response = await markAsFavorite(id, updateType);
        const category = this.$store.data.categories.find(
          item => item.id === response.data.feed?.categoryId
        );
        const delta = newFavoriteInd ? 1 : -1;

        if (category) {
          category.favoriteCount += delta;
          const feed = category.feeds?.find(item => item.id === response.data.feedId);
          if (feed) feed.favoriteCount += delta;
        }

        newFavoriteInd
          ? this.$store.data.increaseFavoriteCount()
          : this.$store.data.decreaseFavoriteCount();

        this.updateFavoriteInd({ id, favoriteInd: newFavoriteInd });
      } catch (error) {
        console.error('Error toggling article favorite:', error);
        notifyActionError('Could not update the favorite. Please try again.', error);
      }
    },

    // Handles reader list bulk actions selected from the middle pane header.
    async handleReaderBulkAction({ action, selectedArticleId }) {
      if (this.$store.data.currentSelection.viewMode !== 'reader') return;

      try {
        if (action === 'favorite-visible') {
          await this.favoriteReaderArticles(this.articles);
          return;
        }

        if (action === 'mark-visible-clicked') {
          await this.markReaderArticlesClicked(this.articles);
          return;
        }

        const articles = this.getReaderBulkReadArticles(action, selectedArticleId);
        await this.markReaderArticlesRead(articles);
      } catch (error) {
        console.error('Error handling reader bulk action:', error);
        notifyActionError('Could not update the selected articles. Please try again.', error);
      }
    },

    // Favorites each visible reader article that is not already favorited.
    async favoriteReaderArticles(articles) {
      const unfavoritedArticles = articles.filter(article => article.favoriteInd !== 1);
      if (!unfavoritedArticles.length) return;

      const response = await markManyAsFavorite(unfavoritedArticles.map(article => article.id), 'mark');
      const updatedArticles = response.data.articles || [];

      for (const updatedArticle of updatedArticles) {
        this.applyReaderFavoriteResponse(updatedArticle);
      }
    },

    // Applies the local and overview count changes for a favorited reader article.
    applyReaderFavoriteResponse(updatedArticle) {
      const category = this.$store.data.categories.find(
        item => item.id === updatedArticle.feed?.categoryId
      );

      if (category) {
        category.favoriteCount++;
        const feed = category.feeds?.find(item => item.id === updatedArticle.feedId);
        if (feed) feed.favoriteCount++;
      }

      this.$store.data.increaseFavoriteCount();
      this.updateFavoriteInd({ id: updatedArticle.id, favoriteInd: 1 });
    },

    // Marks each visible reader article as clicked.
    async markReaderArticlesClicked(articles) {
      if (!articles.length) return;

      const response = await markManyClicked(articles.map(article => article.id));
      const updatedArticles = response.data.articles || [];

      for (const article of updatedArticles) {
        this.updateClickedInd({
          id: article.id,
          clickedAmount: article.clickedAmount
        });
      }
    },

    // Requests a full feed reload from the parent component.
    forceReload() {
      this.$emit("forceReload");
    },

    // Clears the active article filters using the existing selection state.
    clearFilters() {
      this.showSmartFoldersOverview = false;
      this.$store.data.setSearchQuery('');
      this.$store.data.setCurrentSelection({
        status: 'unread',
        categoryId: '%',
        feedId: '%',
        search: null,
        tag: null,
        smartFolderId: null,
        minAdvertisementScore: 0,
        minSentimentScore: 0,
        minQualityScore: 0,
        grouping: 'none',
        sort: 'desc'
      });
    },

    // Requests the existing feed refresh flow from the app shell.
    refreshFeeds() {
      this.$emit("refresh-feeds");
    },

    // Shows the smart folders navigation overview when smart folders are available.
    async openSmartFolders() {
      if (!this.$store.data.smartFolders.length) {
        await this.$store.data.fetchSmartFolders();
      }

      this.showSmartFoldersOverview = true;
    },

    // Selects a smart folder from the overview using the existing store behavior.
    selectSmartFolderFromOverview(smartFolder) {
      this.showSmartFoldersOverview = false;
      this.$store.data.setSmartFolder(smartFolder);
    },

    // Updates an article's local favorite indicator.
    updateFavoriteInd({ id, favoriteInd }) {
      const idx = this.articles.findIndex(a => a.id === id);
      if (idx !== -1) {
        this.articles[idx].favoriteInd = favoriteInd;
      }
    },

    // Updates an article's local click count.
    updateClickedInd({ id, clickedAmount }) {
      const idx = this.articles.findIndex(a => a.id === id);
      if (idx !== -1) {
        this.articles[idx].clickedAmount = clickedAmount;
      }
    },

    // Removes an article from the currently rendered feed.
    removeArticle({ id }) {
      console.log(`Removing article ${id} from view`);

      const nextArticles = this.articles.filter(a => a.id !== id);

      if (nextArticles.length !== this.articles.length) {
        this.articles = nextArticles;
        console.log(`Successfully removed article ${id}`);
      } else {
        console.error('Could not find article to remove:', id);
      }
    }
  }
};
</script>
