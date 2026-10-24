<template>
  <p v-if="offlineReadingStore.readOnly" class="app-notice app-notice--info" role="status">Downloaded articles · Offline reading · {{ articles.length }} on this device · Read and saved changes are stored on this device and synchronize when connected. Search and live rankings are unavailable.</p>
  <SmartFoldersGridOverview
    v-if="showSmartFoldersOverview"
    :smart-folders="overviewStore.smartFolders"
    @selectSmartFolder="selectSmartFolderFromOverview"
  />
  <ArticleReaderLayout v-else-if="isReaderLayoutActive" ref="articleLayout" @vue:mounted="observeLoadMoreSentinel" @vue:updated="observeLoadMoreSentinel" @vue:unmounted="observeLoadMoreSentinel" :articles="articles" :container="container" :collection-summary="collectionSummary" :collection-progress="readerCollectionProgress" @flush-pool="flushPool" @clear-filters="clearFilters" @clear-tag="clearTag" @view-tag-status="viewTagStatus" @clear-search="clearSearch" @refresh-feeds="refreshFeeds" @open-smart-folders="openSmartFolders" @forceReload="forceReload" @retry-pagination="retryPagination" @load-more="getContent()" @reading-article-changing="handleReadingArticleChange" @mark-previous-article-read="markReaderPreviousArticleRead" @bulk-action="handleReaderBulkAction" @select-recommendation="openReaderRecommendation" @update-tags="updateArticleTags" @update-saved="updateSavedInd" @update-openedOriginal="updateOpenedOriginalInd" @toggle-read-status="toggleReaderArticleReadStatus" @shortcut-toggle-read="toggleShortcutArticleReadStatus" @shortcut-toggle-saved="toggleShortcutArticleSaved" @event-articles-loaded="insertClusterArticles" @event-articles-collapsed="removeClusterArticles" @duplicate-articles-loaded="insertDuplicateArticles" @duplicate-articles-collapsed="removeDuplicateArticles" @article-not-interested="removeArticle" @inspect-interest="$emit('inspect-interest', $event)">
    <template #before-context="{ readerMode }">
      <NewArticlesBanner v-if="selectionStore.currentSelection.status === 'unread'" :count="newerArticleCount" :loading="isLoading" :reader-mode="readerMode" @show-new="showNewArticles" @show-full="showFullUnreadList" />
    </template>
  </ArticleReaderLayout>
  <ArticleListView v-else ref="articleLayout" @vue:mounted="observeLoadMoreSentinel" @vue:updated="observeLoadMoreSentinel" @vue:unmounted="observeLoadMoreSentinel" :articles="articles" :container="container" :scroll-root="scrollRoot" :collection-summary="collectionSummary" :collection-progress="streamCollectionProgress" :view-mode="selectionStore.currentSelection.viewMode" :activeHeadlinesArticleId="activeHeadlinesArticleId" @bulk-action="handleReaderBulkAction" @flush-pool="flushPool" @clear-filters="clearFilters" @clear-tag="clearTag" @view-tag-status="viewTagStatus" @clear-search="clearSearch" @refresh-feeds="refreshFeeds" @open-smart-folders="openSmartFolders" @forceReload="forceReload" @retry-pagination="retryPagination" @load-more="getContent()" @update-tags="updateArticleTags" @update-saved="updateSavedInd" @update-openedOriginal="updateOpenedOriginalInd" @headlines-article-opened="handleHeadlinesArticleOpened" @headlines-article-closed="handleHeadlinesArticleClosed" @toggle-read-status="toggleArticleReadStatus" @toggle-headlines-read-status="toggleHeadlinesArticleReadStatus" @shortcut-toggle-read="toggleShortcutArticleReadStatus" @shortcut-toggle-saved="toggleShortcutArticleSaved" @event-articles-loaded="insertClusterArticles" @event-articles-collapsed="removeClusterArticles" @duplicate-articles-loaded="insertDuplicateArticles" @duplicate-articles-collapsed="removeDuplicateArticles" @article-not-interested="removeArticle" @inspect-interest="$emit('inspect-interest', $event)">
    <template #before-context="{ readerMode, headlineMode }">
      <NewArticlesBanner v-if="selectionStore.currentSelection.status === 'unread'" :count="newerArticleCount" :loading="isLoading" :reader-mode="readerMode" :headline-mode="headlineMode" @show-new="showNewArticles" @show-full="showFullUnreadList" />
    </template>
  </ArticleListView>
</template>

<script>
import { articleStateActions } from '../../services/articleStateActions.js';
import { OFFLINE_STATE_EVENT, sameOfflineAccount } from '../../services/offlineCoordination.js';
import { useOfflineReadingStore } from '../../store/offlineReading.js';
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { useOverviewStore } from '../../store/overview.js';
import { useAuthStore } from '../../store/auth.js';
import { useUiStore } from '../../store/ui.js';
import { defineAsyncComponent } from 'vue';
import ArticleListView from "./ArticleListView.vue";
import NewArticlesBanner from "./NewArticlesBanner.vue";
import {
  markAsSaved,
  markManyOpenedOriginal,
  markManyAsSaved
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
  articleFeedVisibilityMethods,
  readingContentArea
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
    NewArticlesBanner,
    ArticleReaderLayout,
    SmartFoldersGridOverview
  },

  emits: [
    'forceReload',
    'mobile-toolbar-visibility',
    'refresh-feeds',
    'inspect-interest'
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
      scrollResetFrameId: null,
      scrollResetTimeoutId: null,
      showSmartFoldersOverview: false,
      pendingSavedArticleIds: new Set(),
      pendingOfflineChanges: [],
      reconcilingOfflineChanges: false
    };
  },

  computed: {

    articleDateFilterKey() {
      const { ageCutoff, dateRange, customDateRange } = this.selectionStore;
      return JSON.stringify([ageCutoff, dateRange, dateRange === 'custom' ? customDateRange : null]);
    },

    ...mapStores(useSelectionStore, useOverviewStore, useUiStore, useAuthStore, useOfflineReadingStore),
    // Returns the stable key for selection fields that change collection membership or ordering.
    articleCollectionSelectionKey() {
      const selection = this.selectionStore.currentSelection;
      return JSON.stringify([
        selection.status,
        selection.categoryId,
        selection.feedId,
        selection.search,
        selection.tag,
        selection.smartFolderId,
        selection.minAdvertisementScore,
        selection.minToneScore,
        selection.minOverallQualityScore,
        selection.minQualityScore,
        selection.sort,
        selection.grouping,
        selection.includeDevelopingEvents,
        selection.briefingRevision
      ]);
    },
    // Returns the stable key for settings that only change the current collection's presentation.
    articlePresentationSelectionKey() {
      const selection = this.selectionStore.currentSelection;
      return JSON.stringify([
        selection.viewMode
      ]);
    },
    // calculate the remaining items in the container
    remainingItems() {
      return this.container.length - this.pool.size;
    },

    // adjust fetchCount based on viewMode
    fetchCount() {
      return this.selectionStore.currentSelection.viewMode === "headlines"
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

      if (this.showingNewOnly || this.loadedSelection?.publishedAfter || this.loadedSelection?.publishedBefore) {
        const collectionIds = new Set(this.container.map(String));
        const readIds = new Set(this.articles.filter(article => (
          collectionIds.has(String(article.id)) && article.status === 'read'
        )).map(article => String(article.id)));
        return Math.max(0, (this.totalCount ?? collectionIds.size) - readIds.size);
      }

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
      if (this.offlineReadingStore.readOnly) return { status: '%', selectedTag: null, sourceCount: new Set(this.articles.map(article => article.feedId)).size, unreadCount: this.articles.filter(article => article.status === 'unread').length, totalCount: this.articles.length };
      return {
        status: this.selectionStore.currentSelection.status,
        selectedTag: this.selectionStore.currentSelection.tag,
        unreadCount: this.currentViewUnreadCount,
        sourceCount: this.currentViewSourceCount,
        oldestPublishedAt: this.oldestPublishedAt,
        totalCount: this.totalCount ?? this.container.length
      };
    },

    // Derives stream loading and completion presentation from feed-owned pagination state.
    streamCollectionProgress() {
      return {
        hasLoadedContent: this.hasLoadedContent,
        hasMore: this.hasMore,
        isLoading: this.isLoading || this.paginationRequestActive,
        isFlushed: this.isFlushed,
        showingNewOnly: this.showingNewOnly,
        hasReachedEnd: hasReachedArticleCollectionEnd({
          articleCount: this.totalCount,
          distance: this.distance,
          status: this.selectionStore.currentSelection.status,
          remainingItems: this.remainingItems,
          fetchCount: this.fetchCount,
          allowUnreadFinalPage: true,
          hasMore: this.hasMore
        }),
        loadedCount: this.container.length,
        isCollectionEmpty: this.articles.length === 0 && !this.hasMore,
        newerArticlesAvailable: this.newerArticlesAvailable,
        newerArticleCount: this.newerArticleCount,
        paginationError: this.paginationError,
        showFeedRefreshProgress: this.showFeedRefreshProgress
      };
    },

    // Derives Reader loading and completion presentation without stream final-page semantics.
    readerCollectionProgress() {
      return {
        hasLoadedContent: this.hasLoadedContent,
        hasMore: this.hasMore,
        isLoading: this.isLoading || this.paginationRequestActive,
        isFlushed: this.isFlushed,
        showingNewOnly: this.showingNewOnly,
        hasReachedEnd: hasReachedArticleCollectionEnd({
          articleCount: this.totalCount,
          distance: this.distance,
          status: this.selectionStore.currentSelection.status,
          remainingItems: this.remainingItems,
          fetchCount: this.fetchCount,
          hasMore: this.hasMore
        }),
        loadedCount: this.container.length,
        isCollectionEmpty: this.articles.length === 0 && !this.hasMore,
        newerArticlesAvailable: this.newerArticlesAvailable,
        newerArticleCount: this.newerArticleCount,
        paginationError: this.paginationError,
        showFeedRefreshProgress: this.showFeedRefreshProgress
      };
    }
  },

  watch: {
    'offlineReadingStore.profile.activeGeneration'() {
      if (this.offlineReadingStore.readOnly) this.fetchArticleIds(this.selectionStore.currentSelection);
    },
    'offlineReadingStore.readOnly'() {
      this.fetchArticleIds(this.selectionStore.currentSelection);
    },
    articleDateFilterKey() {
      if (this.selectionStore.currentSelection.status === 'unread') this.reloadDateFilters();
    },
    'overviewStore.articleAvailabilityRevision'() {
      this.checkForNewerArticles();
    },
    // Reconnects scrolling behavior when the app shell supplies a replacement scroll surface.
    scrollRoot(value) {
      this.connectScrollContainer(value);
      this.reconnectLayoutObservers();
    },
    articleCollectionSelectionKey: {
      // Reloads articles only when the active collection changes.
      handler() {
        this.showSmartFoldersOverview = false;
        this.fetchArticleIds(this.selectionStore.currentSelection);
      },
      immediate: true
    },
    // Returns representation changes to the beginning without reloading the same article IDs.
    activeHeadlinesArticleId: {
      flush: 'sync',
      handler() { this.handleReadingArticleChange(); }
    },
    articlePresentationSelectionKey() {
      this.finishReadingSession();
      // A different presentation has a different text length. Save the old summary
      // before starting measurements against the new displayed content.
      this.visibleDuration.clear();
      this.readingWordCounts.clear();
      this.persistedVisibleDuration = new Map();
      this.showSmartFoldersOverview = false;
      this.$nextTick(() => {
        this.scrollArticleListToTop();
        this.observeLoadMoreSentinel();
        if (this.readingTrackingStarted) this.handleReadingActivity();
      });
    },
    // Reconnects observers after the rendered article layout changes.
    isReaderLayoutActive() {
      this.finishReadingSession();
      this.reconnectLayoutObservers();
    }
  },

  // Starts scroll handling and article observers after mounting.
  mounted() {
    window.addEventListener(OFFLINE_STATE_EVENT, this.reconcileOfflineState);
    document.addEventListener('visibilitychange', this.flushOfflineChanges);
    this.connectScrollContainer(this.scrollRoot);
    window.addEventListener("scroll", this.handleScroll, { passive: true });
    window.addEventListener("keydown", this.handleGlobalShortcut);
    this.setupObservers();
  },

  // Finalize while the old layout and article context still exist.
  beforeUnmount() {
    window.removeEventListener(OFFLINE_STATE_EVENT, this.reconcileOfflineState);
    document.removeEventListener('visibilitychange', this.flushOfflineChanges);
    this.pendingOfflineChanges = [];
    this.activeRequestId += 1;
    this.teardownObservers();
  },

  // Removes scroll handling after unmounting.
  unmounted() {
    this.activeNewerArticlesRequestId += 1;
    this.overviewStore.setCurrentSelectionNewArticleCount(0);
    window.removeEventListener("scroll", this.handleScroll);
    window.removeEventListener("keydown", this.handleGlobalShortcut);
    if (this.scrollResetFrameId !== null) {
      window.cancelAnimationFrame?.(this.scrollResetFrameId);
      this.scrollResetFrameId = null;
    }
    if (this.scrollResetTimeoutId !== null) {
      window.clearTimeout(this.scrollResetTimeoutId);
      this.scrollResetTimeoutId = null;
    }
    this.connectScrollContainer(null);
  },

  methods: {
    async reconcileOfflineState(event) {
      if (!sameOfflineAccount(event.detail?.account, this.offlineReadingStore.account)) return;
      // The initiating control owns its optimistic count delta. Broadcast/replay patches never repeat it.
      if (event.detail.local && !event.detail.remote) return;
      this.pendingOfflineChanges.push({ event, requestId: this.activeRequestId, sessionId: this.offlineReadingStore.sessionId });
      await this.flushOfflineChanges();
    },
    async flushOfflineChanges() {
      if (this.reconcilingOfflineChanges || document.visibilityState !== 'visible') return;
      this.reconcilingOfflineChanges = true;
      try {
        // Reconcile in notification order so an older overlay cannot overwrite a newer patch.
        while (this.pendingOfflineChanges.length && document.visibilityState === 'visible') {
          const change = this.pendingOfflineChanges.shift();
          if (change.requestId !== this.activeRequestId || change.sessionId !== this.offlineReadingStore.sessionId) continue;
          await this.applyOfflineChange(change);
        }
      } finally {
        this.reconcilingOfflineChanges = false;
      }
    },
    async applyOfflineChange(change) {
      const { event, requestId, sessionId } = change;
      const records = new Map((event.detail.articles || []).map(article => [String(article.id), article]));
      try {
        if (event.detail.discarded) {
          const cached = await this.offlineReadingStore.loadSnapshot();
          if (!cached || requestId !== this.activeRequestId || sessionId !== this.offlineReadingStore.sessionId) return;
          const storedArticles = new Map(cached.map(article => [String(article.id), article]));
          this.articles = this.articles.map(article => {
            const next = { ...article };
            for (const action of event.detail.discardedActions || []) {
              if (String(action.articleId) === String(article.id) && action.baseValue !== undefined) next[action.kind === 'set-status' ? 'status' : 'savedInd'] = action.baseValue;
            }
            const stored = storedArticles.get(String(article.id));
            return stored ? { ...next, status: stored.status, savedInd: stored.savedInd } : next;
          });
          return;
        }
        const unavailable = new Set((event.detail.sent || []).filter(action => event.detail.results?.some(result => result.actionId === action.actionId && result.errorCode === 'ARTICLE_UNAVAILABLE')).map(action => String(action.articleId)));
        const articles = await articleStateActions.overlay(this.articles.filter(article => !unavailable.has(String(article.id))).map(article => ({ ...article, ...records.get(String(article.id)), feed: { ...article.feed, ...records.get(String(article.id))?.feed } })));
        if (requestId !== this.activeRequestId || sessionId !== this.offlineReadingStore.sessionId) return;
        this.articles = articles;
        this.container = this.container.filter(id => !unavailable.has(String(id)));
      } catch (error) {
        if (requestId !== this.activeRequestId || sessionId !== this.offlineReadingStore.sessionId) return;
        // A read already in progress can be aborted when iOS suspends the page.
        // Retain its server patch and retry only when the page becomes visible again.
        if (document.visibilityState !== 'visible') {
          this.pendingOfflineChanges.unshift(change);
          return;
        }
        if (event.detail.discarded) return;
        notifyActionError('Could not reconcile local article changes.', error, undefined, {
          operation: 'reconcile-local-article-changes',
          articleCount: this.articles.length,
          receivedArticleCount: records.size,
          remote: Boolean(event.detail.remote),
          local: Boolean(event.detail.local),
          readOnly: this.offlineReadingStore.readOnly,
          viewMode: this.selectionStore.currentSelection.viewMode,
          requestChanged: requestId !== this.activeRequestId
        });
      }
    },
    ...articleFeedPaginationMethods,
    ...articleFeedVisibilityMethods,
    ...articleFeedReadStateMethods,
    ...articleFeedClusterInsertionMethods,

    // Resets each helper-owned state group before pagination installs a new collection.
    resetCollectionState() {
      this.pendingOfflineChanges = [];
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
      const resetScrollSurfaces = () => {
        this.$refs.articleLayout?.scrollToTop?.();
        if (this.scrollContainer) this.scrollContainer.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        window.scrollTo({ top: 0, behavior: 'auto' });
      };

      resetScrollSurfaces();
      if (this.scrollResetFrameId !== null) {
        window.cancelAnimationFrame?.(this.scrollResetFrameId);
      }
      if (this.scrollResetTimeoutId !== null) {
        window.clearTimeout(this.scrollResetTimeoutId);
      }

      // iOS Safari may restore its scroll anchor after the toolbar and visual viewport finish
      // settling, which happens later than Vue's DOM update and the next paint frames.
      this.scrollResetTimeoutId = window.setTimeout(() => {
        this.scrollResetTimeoutId = null;
        resetScrollSurfaces();
      }, 250);
      if (typeof window.requestAnimationFrame !== 'function') {
        this.scrollResetFrameId = null;
        return;
      }

      // Safari can restore its scroll anchor after Vue's DOM update but before the next paint.
      this.scrollResetFrameId = window.requestAnimationFrame(() => {
        resetScrollSurfaces();
        this.scrollResetFrameId = window.requestAnimationFrame(() => {
          this.scrollResetFrameId = null;
          resetScrollSurfaces();
        });
      });
    },

    getSelectedReadingArticleId() {
      return this.isReaderLayoutActive
        ? this.$refs.articleLayout?.getSelectedReadingArticleId?.() ?? null
        : this.selectionStore.currentSelection.viewMode === 'headlines' ? this.activeHeadlinesArticleId : null;
    },

    handleReadingArticleChange() {
      this.finishReadingSession();
      this.$nextTick(() => {
        if (!this.readingTrackingStarted) return;
        this.observeArticles();
        this.handleReadingActivity();
      });
    },

    // Returns an article element through the active layout's explicit DOM contract.
    getArticleElement(articleId) {
      return this.$refs.articleLayout?.getArticleElement?.(articleId) || null;
    },

    // Returns the active layout's pagination sentinel without querying descendant markup.
    getLoadMoreSentinel() {
      return this.$refs.articleLayout?.getLoadMoreSentinel?.() || null;
    },

    // Returns the scrolling surface that contains the active pagination sentinel.
    getPaginationScrollRoot() {
      return this.$refs.articleLayout?.getPaginationScrollRoot?.() || null;
    },

    // Returns the active layout's reading viewport edge for visibility transitions.
    getReadingViewportTop() {
      return this.$refs.articleLayout?.getReadingViewportTop?.() || 0;
    },

    // Reconnects article observers after Vue installs the active list or Reader layout.
    reconnectLayoutObservers() {
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
    // Toggles an article saved state from a keyboard shortcut.
    async toggleShortcutArticleSaved({ id }) {
      const article = this.articles.find(item => String(item.id) === String(id));
      if (!article) return;

      const articleKey = String(article.id);
      if (this.pendingSavedArticleIds.has(articleKey)) return;

      const previousSavedInd = article.savedInd === 1 ? 1 : 0;
      const requestedSavedInd = previousSavedInd === 1 ? 0 : 1;
      const updateType = requestedSavedInd ? 'mark' : 'unmark';
      this.pendingSavedArticleIds.add(articleKey);
      try {
        const response = await markAsSaved(id, updateType, article);
        const persistedSavedInd = response.data.savedInd === 1
          ? 1
          : response.data.savedInd === 0
            ? 0
            : requestedSavedInd;
        const delta = persistedSavedInd - previousSavedInd;

        if (delta !== 0) {
          this.overviewStore.applySavedDelta({
            categoryId: response.data.feed?.categoryId,
            feedId: response.data.feedId,
            delta
          });
        }

        this.updateSavedInd({ id, savedInd: persistedSavedInd });
      } catch (error) {
        console.error('Error toggling article saved:', error);
        notifyActionError('Could not update saved status. Please try again.', error);
      } finally {
        this.pendingSavedArticleIds.delete(articleKey);
      }
    },

    // Explicit sidebar actions include on-screen cards, not the entire loaded page.
    async markVisibleArticlesRead() {
      if (this.isLoading) return;
      const layout = this.$refs.articleLayout;
      const visibleArticles = this.articles.filter(article => {
        if (article.readerRecommendationInd) return false;
        const elements = [layout?.getArticleListElement?.(article.id), this.getArticleElement(article.id)];
        return elements.some(element => element && readingContentArea(element, 1));
      });
      await this.markReaderArticlesRead(visibleArticles);
      await this.overviewStore.fetchSmartFolderCounts();
    },

    // Only articles intersecting the clipped viewport belong to the visible bulk scope.
    getVisibleReaderArticles() {
      const layout = this.$refs.articleLayout;
      return this.articles.filter(article => {
        if (article.readerRecommendationInd || article.clusterParentId) return false;
        const element = layout?.getArticleListElement
          ? layout.getArticleListElement(article.id)
          : layout?.getArticleElement?.(article.id);
        return element && readingContentArea(element, 1);
      });
    },

    // Handles bulk actions from the active article layout.
    async handleReaderBulkAction({ action, selectedArticleId }) {
      if (!['reader', 'expanded', 'summarized', 'summaryBullets', 'headlines'].includes(this.selectionStore.currentSelection.viewMode)) return;

      try {
        if (action === 'saved-visible') {
          await this.savedReaderArticles(this.getVisibleReaderArticles());
          return;
        }

        if (action === 'mark-visible-opened-original') {
          await this.markReaderArticlesOpenedOriginal(this.getVisibleReaderArticles());
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

    // Reuse supplemental Article retrieval and each layout's normal selection/read handling.
    async openExampleArticle(articleId) {
      const collectionRequestId = this.activeRequestId;
      try {
        const article = await this.loadReaderRecommendationArticle(articleId);
        if (collectionRequestId !== this.activeRequestId) return;
        if (!article) throw new Error('Article is no longer available');
        await this.$nextTick();
        if (this.isReaderLayoutActive) this.$refs.articleLayout?.selectArticle(article.id, { markPreviousAsRead: false });
        else this.$refs.articleLayout?.selectArticleByIndex(this.articles.findIndex(row => String(row.id) === String(article.id)));
      } catch (error) {
        notifyActionError('Could not open this article. Please try again.', error);
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

    // Saved each visible reader article that is not already saved.
    async savedReaderArticles(articles) {
      const unsavedArticles = articles.filter(article =>
        article.savedInd !== 1
        && !this.pendingSavedArticleIds.has(String(article.id))
      );
      if (!unsavedArticles.length) return;

      const articleKeys = unsavedArticles.map(article => String(article.id));
      for (const articleKey of articleKeys) {
        this.pendingSavedArticleIds.add(articleKey);
      }

      try {
        const response = await markManyAsSaved(unsavedArticles.map(article => article.id), 'mark', unsavedArticles);
        const updatedArticles = response.data.articles || [];

        for (const updatedArticle of updatedArticles) {
          this.applyReaderSavedResponse(updatedArticle);
        }
      } finally {
        for (const articleKey of articleKeys) {
          this.pendingSavedArticleIds.delete(articleKey);
        }
      }
    },

    // Applies the local and overview count changes for a saved reader article.
    applyReaderSavedResponse(updatedArticle) {
      const article = this.articles.find(item => String(item.id) === String(updatedArticle.id));
      if (!article) return;

      const previousSavedInd = article.savedInd === 1 ? 1 : 0;
      const persistedSavedInd = updatedArticle.savedInd === 0 ? 0 : 1;
      const delta = persistedSavedInd - previousSavedInd;

      if (delta !== 0) {
        this.overviewStore.applySavedDelta({
          categoryId: updatedArticle.feed?.categoryId,
          feedId: updatedArticle.feedId,
          delta
        });
      }
      this.updateSavedInd({
        id: updatedArticle.id,
        savedInd: persistedSavedInd
      });
    },

    // Marks each visible reader article as opened original.
    async markReaderArticlesOpenedOriginal(articles) {
      if (!articles.length) return;

      const response = await markManyOpenedOriginal(articles.map(article => article.id));
      const updatedArticles = response.data.articles || [];

      for (const article of updatedArticles) {
        this.updateOpenedOriginalInd({
          id: article.id,
          openedOriginalCount: article.openedOriginalCount
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

    clearSearch() {
      this.uiStore.setSearchQuery('');
      this.selectionStore.setCurrentSelection({ search: null });
    },

    // Clears only the selected tag while preserving the active article state.
    clearTag() {
      this.selectionStore.setTag('');
    },

    // Reloads an unchanged unread selection without the temporary new-only boundary.
    viewTagStatus(status) {
      if (status === 'unread' && this.selectionStore.currentSelection.status === status) {
        return this.showFullUnreadList();
      }
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

    // Keep every rendered copy in sync without replacing the current list snapshot.
    updateArticleTags({ id, tags }) {
      for (const article of this.articles) {
        if (String(article.id) === String(id)) article.tags = tags;
      }
    },

    // Updates an article's local saved indicator.
    updateSavedInd({ id, savedInd }) {
      const idx = this.articles.findIndex(a => a.id === id);
      if (idx !== -1) {
        this.articles[idx].savedInd = savedInd;
      }
    },

    // Updates an article's local click count.
    updateOpenedOriginalInd({ id, openedOriginalCount }) {
      const idx = this.articles.findIndex(a => a.id === id);
      if (idx !== -1) {
        this.articles[idx].openedOriginalCount = openedOriginalCount;
      }
    },

    // Removes an article from the currently rendered feed.
    removeArticle({ id }) {
      const nextArticles = this.articles.filter(a => a.id !== id);
      const currentContainer = this.container || [];
      const nextContainer = currentContainer.filter(articleId => String(articleId) !== String(id));

      if (nextArticles.length !== this.articles.length) {
        this.articles = nextArticles;
        if (nextContainer.length !== currentContainer.length) {
          this.container = nextContainer;
          this.totalCount = Math.max(0, Number(this.totalCount || currentContainer.length) - 1);
          this.pool?.delete(Number(id));
        }
      } else {
        console.error('Could not find article to remove:', id);
      }
    }
  }
};
</script>
