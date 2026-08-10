<template>
  <SmartFoldersGridOverview
    v-if="showSmartFoldersOverview"
    :smart-folders="overviewStore.smartFolders"
    @selectSmartFolder="selectSmartFolderFromOverview"
  />
  <ArticleReaderLayout v-else-if="isReaderLayoutActive" ref="articleLayout" :articles="articles" :container="container" :collection-summary="collectionSummary" :collection-progress="readerCollectionProgress" @flush-pool="flushPool" @clear-filters="clearFilters" @clear-tag="clearTag" @view-tag-status="viewTagStatus" @refresh-feeds="refreshFeeds" @open-smart-folders="openSmartFolders" @forceReload="forceReload" @mark-previous-article-read="markReaderPreviousArticleRead" @bulk-action="handleReaderBulkAction" @select-recommendation="openReaderRecommendation" @update-favorite="updateFavoriteInd" @update-clicked="updateClickedInd" @toggle-read-status="toggleReaderArticleReadStatus" @shortcut-toggle-read="toggleShortcutArticleReadStatus" @shortcut-toggle-favorite="toggleShortcutArticleFavorite" @event-articles-loaded="insertClusterArticles" @event-articles-collapsed="removeClusterArticles" @duplicate-articles-loaded="insertDuplicateArticles" @duplicate-articles-collapsed="removeDuplicateArticles" @article-not-interested="removeArticle">
  </ArticleReaderLayout>
  <ArticleListView v-else ref="articleLayout" :articles="articles" :container="container" :scroll-root="scrollRoot" :collection-summary="collectionSummary" :collection-progress="streamCollectionProgress" :view-mode="selectionStore.currentSelection.viewMode" :activeMinimalArticleId="activeMinimalArticleId" @flush-pool="flushPool" @clear-filters="clearFilters" @clear-tag="clearTag" @view-tag-status="viewTagStatus" @refresh-feeds="refreshFeeds" @open-smart-folders="openSmartFolders" @forceReload="forceReload" @update-favorite="updateFavoriteInd" @update-clicked="updateClickedInd" @minimal-article-opened="handleMinimalArticleOpened" @minimal-article-closed="handleMinimalArticleClosed" @toggle-read-status="toggleReaderArticleReadStatus" @toggle-minimal-read-status="toggleMinimalArticleReadStatus" @shortcut-toggle-read="toggleShortcutArticleReadStatus" @shortcut-toggle-favorite="toggleShortcutArticleFavorite" @event-articles-loaded="insertClusterArticles" @event-articles-collapsed="removeClusterArticles" @duplicate-articles-loaded="insertDuplicateArticles" @duplicate-articles-collapsed="removeDuplicateArticles" @article-not-interested="removeArticle">
  </ArticleListView>
</template>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { useOverviewStore } from '../../store/overview.js';
import { useUiStore } from '../../store/ui.js';
import { defineAsyncComponent } from 'vue';
import ArticleListView from "./ArticleListView.vue";
import {
  markAsFavorite,
  markManyClicked,
  markManyAsFavorite
} from '../../api/articles';
import { articleFeedClusterInsertionMethods } from './feed/clusterInsertion.js';
import {
  createArticleFeedPaginationState,
  articleFeedPaginationMethods
} from './feed/pagination.js';
import {
  createArticleFeedReadState,
  articleFeedReadStateMethods
} from './feed/readState.js';
import {
  createArticleFeedVisibilityState,
  articleFeedVisibilityMethods
} from './feed/visibilityTracking.js';
import { notifyActionError } from '../../services/actionNotifications.js';
import { isArticleKeyboardEventEligible } from '../../services/articleKeyboardCommands.js';
import { useMediaQuery } from '../../composables/useMediaQuery.js';
import { hasReachedArticleCollectionEnd } from '../../services/articleCollectionState.js';

// This async boundary defers the desktop-only reader layout until it is selected.
const ArticleReaderLayout = defineAsyncComponent(() => import("./ArticleReaderLayout.vue"));

// This async boundary defers the Smart Folders overview until the user opens it.
const SmartFoldersGridOverview = defineAsyncComponent(() => import("./SmartFoldersGridOverview.vue"));

export default {
  components: {
    ArticleListView,
    ArticleReaderLayout,
    SmartFoldersGridOverview
  },

  emits: [
    'forceReload',
    'mobile-toolbar-visibility',
    'refresh-feeds'
  ],

  props: {
    scrollRoot: {
      type: Object,
      default: null
    },
    showFeedRefreshProgress: {
      type: Boolean,
      default: true
    }
  },

  // Exposes the desktop Reader breakpoint while preserving Options API component logic.
  setup() {
    return {
      isDesktopReaderWidth: useMediaQuery('(min-width: 1024px)')
    };
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
      showSmartFoldersOverview: false,
      pendingFavoriteArticleIds: new Set()
    };
  },

  computed: {

    ...mapStores(useSelectionStore, useOverviewStore, useUiStore),
    // calculate the remaining items in the container
    remainingItems() {
      return this.container.length - this.pool.size;
    },

    // adjust fetchCount based on viewMode
    fetchCount() {
      return this.selectionStore.currentSelection.viewMode === "minimal"
        ? 50
        : 20;
    },

    // Returns whether the reader layout should replace the normal stream.
    isReaderLayoutActive() {
      return this.selectionStore.currentSelection.viewMode === 'reader' && this.isDesktopReaderWidth;
    },

    // Returns the unread count for the currently selected article scope.
    currentViewUnreadCount() {
      const selection = this.selectionStore.currentSelection;
      if (selection.status === 'briefing') {
        const collectionArticleIds = new Set(this.container.map(id => String(id)));
        return this.articles.filter(article => (
          collectionArticleIds.has(String(article.id))
          && article.status !== 'read'
        )).length;
      }

      if (selection.status !== 'unread') return 0;

      if (selection.smartFolderId !== null) {
        const smartFolder = this.overviewStore.smartFolders.find(folder => folder.id === selection.smartFolderId);
        return smartFolder?.ArticleCount ?? 0;
      }

      const categoryId = Number(selection.categoryId);
      const feedId = Number(selection.feedId);
      const category = Number.isFinite(categoryId)
        ? this.overviewStore.categories.find(item => item.id === categoryId)
        : null;

      if (Number.isFinite(feedId) && category) {
        const feed = category.feeds?.find(item => item.id === feedId);
        return feed?.unreadCount ?? 0;
      }

      if (category) {
        return category.unreadCount ?? 0;
      }

      return this.overviewStore.unreadCount;
    },

    // Groups the stable collection labels and counts rendered by either layout.
    collectionSummary() {
      return {
        status: this.selectionStore.currentSelection.status,
        selectedTag: this.selectionStore.currentSelection.tag,
        unreadCount: this.currentViewUnreadCount,
        sourceCount: this.currentViewSourceCount
      };
    },

    // Derives stream loading and completion presentation from feed-owned pagination state.
    streamCollectionProgress() {
      return {
        hasLoadedContent: this.hasLoadedContent,
        isFlushed: this.isFlushed,
        hasReachedEnd: hasReachedArticleCollectionEnd({
          articleCount: this.container.length,
          distance: this.distance,
          status: this.selectionStore.currentSelection.status,
          remainingItems: this.remainingItems,
          fetchCount: this.fetchCount,
          allowUnreadFinalPage: true
        }),
        showFeedRefreshProgress: this.showFeedRefreshProgress
      };
    },

    // Derives Reader loading and completion presentation without stream final-page semantics.
    readerCollectionProgress() {
      return {
        hasLoadedContent: this.hasLoadedContent,
        isFlushed: this.isFlushed,
        hasReachedEnd: hasReachedArticleCollectionEnd({
          articleCount: this.container.length,
          distance: this.distance,
          status: this.selectionStore.currentSelection.status,
          remainingItems: this.remainingItems,
          fetchCount: this.fetchCount
        }),
        showFeedRefreshProgress: this.showFeedRefreshProgress
      };
    }
  },

  watch: {
    // Reconnects scrolling behavior when the app shell supplies a replacement scroll surface.
    scrollRoot(value) {
      this.connectScrollContainer(value);
    },
    "selectionStore.currentSelection": {
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
    },
    // Reconnects article observers when the Reader breakpoint crosses either direction.
    isDesktopReaderWidth() {
      this.handleReaderWidthChange();
    }
  },

  // Starts scroll handling and article observers after mounting.
  mounted() {
    this.connectScrollContainer(this.scrollRoot);
    window.addEventListener("scroll", this.handleScroll, { passive: true });
    window.addEventListener("keydown", this.handleGlobalShortcut);
    this.setupObservers();
  },

  // Removes scroll handling and disconnects observers before unmounting.
  unmounted() {
    window.removeEventListener("scroll", this.handleScroll);
    window.removeEventListener("keydown", this.handleGlobalShortcut);
    this.connectScrollContainer(null);
    this.teardownObservers();
  },

  methods: {
    ...articleFeedPaginationMethods,
    ...articleFeedVisibilityMethods,
    ...articleFeedReadStateMethods,
    ...articleFeedClusterInsertionMethods,

    // Resets each helper-owned state group before pagination installs a new collection.
    resetCollectionState() {
      this.resetVisibilityTracking();
      this.resetReadTracking();
      this.resetPaginationState();
    },

    // Connects scroll handling to the shell-owned article surface without querying shell markup.
    connectScrollContainer(scrollContainer) {
      if (this.scrollContainer === scrollContainer) return;
      this.scrollContainer?.removeEventListener("scroll", this.handleScroll);
      this.scrollContainer = scrollContainer;
      this.scrollContainer?.addEventListener("scroll", this.handleScroll, { passive: true });
    },

    // Restores every owned article layout and shared page scroll surface to the beginning.
    scrollArticleListToTop() {
      const windowWasScrolled = window.scrollY > 0;
      this.$refs.articleLayout?.scrollToTop?.();
      if (this.scrollContainer) this.scrollContainer.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      if (windowWasScrolled) window.scrollTo({ top: 0, behavior: 'auto' });
    },

    // Returns an article element through the active layout's explicit DOM contract.
    getArticleElement(articleId) {
      return this.$refs.articleLayout?.getArticleElement?.(articleId) || null;
    },

    // Returns the active layout's pagination sentinel without querying descendant markup.
    getLoadMoreSentinel() {
      return this.$refs.articleLayout?.getLoadMoreSentinel?.() || null;
    },

    // Returns the active layout's reading viewport edge for visibility transitions.
    getReadingViewportTop() {
      return this.$refs.articleLayout?.getReadingViewportTop?.() || 0;
    },

    // Updates reader layout activation when the desktop breakpoint changes.
    handleReaderWidthChange() {
      this.$nextTick(() => {
        this.observeArticles();
        this.observeLoadMoreSentinel();
      });
    },

    // Shows or hides the mobile toolbar based on scroll direction.
    handleScroll() {
      const curScroll =
        Math.ceil(this.scrollContainer?.scrollTop) ||
        Math.ceil(window.scrollY) ||
        Math.ceil(document.documentElement.scrollTop);

      if (curScroll <= 0) {
        this.$emit('mobile-toolbar-visibility', true);
        this.prevScroll = 0;
        this.scrollDirection = "up";
        return;
      }

      const direction =
        curScroll > this.prevScroll
          ? "down"
          : curScroll < this.prevScroll
          ? "up"
          : this.scrollDirection;

      if (direction !== this.scrollDirection && direction === "up") {
        this.$emit('mobile-toolbar-visibility', true);
      }

      if (direction === "down" && curScroll > 200) {
        this.$emit('mobile-toolbar-visibility', false);
      }

      this.prevScroll = curScroll;
      this.scrollDirection = direction;
    },
    // Handles shortcuts that apply to every article view mode.
    handleGlobalShortcut(event) {
      if (!isArticleKeyboardEventEligible(event, {
        allowShiftKey: true,
        allowInteractiveTarget: true
      })) return;

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
    // Toggles an article favorite state from a keyboard shortcut.
    async toggleShortcutArticleFavorite({ id }) {
      const article = this.articles.find(item => String(item.id) === String(id));
      if (!article) return;

      const articleKey = String(article.id);
      if (this.pendingFavoriteArticleIds.has(articleKey)) return;

      const previousFavoriteInd = article.favoriteInd === 1 ? 1 : 0;
      const requestedFavoriteInd = previousFavoriteInd === 1 ? 0 : 1;
      const updateType = requestedFavoriteInd ? 'mark' : 'unmark';
      this.pendingFavoriteArticleIds.add(articleKey);
      try {
        const response = await markAsFavorite(id, updateType);
        const persistedFavoriteInd = response.data.favoriteInd === 1
          ? 1
          : response.data.favoriteInd === 0
            ? 0
            : requestedFavoriteInd;
        const delta = persistedFavoriteInd - previousFavoriteInd;

        if (delta !== 0) {
          this.overviewStore.applyFavoriteDelta({
            categoryId: response.data.feed?.categoryId,
            feedId: response.data.feedId,
            delta
          });
        }

        this.updateFavoriteInd({ id, favoriteInd: persistedFavoriteInd });
      } catch (error) {
        console.error('Error toggling article favorite:', error);
        notifyActionError('Could not update the favorite. Please try again.', error);
      } finally {
        this.pendingFavoriteArticleIds.delete(articleKey);
      }
    },

    // Handles reader list bulk actions selected from the middle pane header.
    async handleReaderBulkAction({ action, selectedArticleId }) {
      if (this.selectionStore.currentSelection.viewMode !== 'reader') return;

      const readerCollectionArticles = this.articles.filter(article => !article.readerRecommendationInd);

      try {
        if (action === 'favorite-visible') {
          await this.favoriteReaderArticles(readerCollectionArticles);
          return;
        }

        if (action === 'mark-visible-clicked') {
          await this.markReaderArticlesClicked(readerCollectionArticles);
          return;
        }

        const articles = this.getReaderBulkReadArticles(action, selectedArticleId)
          .filter(article => !article.readerRecommendationInd);
        await this.markReaderArticlesRead(articles);
      } catch (error) {
        console.error('Error handling reader bulk action:', error);
        notifyActionError('Could not update the selected articles. Please try again.', error);
      }
    },

    // Opens a recommendation through the Reader's existing selection and scroll-reset behavior.
    async openReaderRecommendation(articleId) {
      if (!this.isReaderLayoutActive) return;

      try {
        const article = await this.loadReaderRecommendationArticle(articleId);
        if (!article || !this.isReaderLayoutActive) return;

        await this.$nextTick();
        this.$refs.articleLayout?.selectArticle(article.id);
      } catch (error) {
        console.error(`Error loading Reader recommendation ${articleId}:`, error);
      }
    },

    // Favorites each visible reader article that is not already favorited.
    async favoriteReaderArticles(articles) {
      const unfavoritedArticles = articles.filter(article =>
        article.favoriteInd !== 1
        && !this.pendingFavoriteArticleIds.has(String(article.id))
      );
      if (!unfavoritedArticles.length) return;

      const articleKeys = unfavoritedArticles.map(article => String(article.id));
      for (const articleKey of articleKeys) {
        this.pendingFavoriteArticleIds.add(articleKey);
      }

      try {
        const response = await markManyAsFavorite(unfavoritedArticles.map(article => article.id), 'mark');
        const updatedArticles = response.data.articles || [];

        for (const updatedArticle of updatedArticles) {
          this.applyReaderFavoriteResponse(updatedArticle);
        }
      } finally {
        for (const articleKey of articleKeys) {
          this.pendingFavoriteArticleIds.delete(articleKey);
        }
      }
    },

    // Applies the local and overview count changes for a favorited reader article.
    applyReaderFavoriteResponse(updatedArticle) {
      const article = this.articles.find(item => String(item.id) === String(updatedArticle.id));
      if (!article) return;

      const previousFavoriteInd = article.favoriteInd === 1 ? 1 : 0;
      const persistedFavoriteInd = updatedArticle.favoriteInd === 0 ? 0 : 1;
      const delta = persistedFavoriteInd - previousFavoriteInd;

      if (delta !== 0) {
        this.overviewStore.applyFavoriteDelta({
          categoryId: updatedArticle.feed?.categoryId,
          feedId: updatedArticle.feedId,
          delta
        });
      }
      this.updateFavoriteInd({
        id: updatedArticle.id,
        favoriteInd: persistedFavoriteInd
      });
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
      this.uiStore.setSearchQuery('');
      this.selectionStore.resetArticleFilters();
    },

    // Clears only the selected tag while preserving the active article state.
    clearTag() {
      this.selectionStore.setTag('');
    },

    // Changes the article state offered by an empty tag result while preserving the tag.
    viewTagStatus(status) {
      this.selectionStore.setSelectedStatus(status);
    },

    // Requests the existing feed refresh flow from the app shell.
    refreshFeeds() {
      this.$emit("refresh-feeds");
    },

    // Shows the smart folders navigation overview when smart folders are available.
    async openSmartFolders() {
      if (!this.overviewStore.smartFolders.length) {
        await this.overviewStore.fetchSmartFolders();
      }

      this.showSmartFoldersOverview = true;
    },

    // Selects a smart folder from the overview using the existing store behavior.
    selectSmartFolderFromOverview(smartFolder) {
      this.showSmartFoldersOverview = false;
      this.selectionStore.setSmartFolder(smartFolder);
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
