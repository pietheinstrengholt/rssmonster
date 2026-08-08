<template>
  <div
    id="main-container"
    ref="expandedArticleScrollRef"
    :class="{ expandedArticleLayout: viewMode === 'full' }"
    @scroll="handleExpandedArticleScroll"
  >
    <div id="articles" :class="{ 'mobile-search-open': mobileSearchOpen }">
      <DailyBriefingIntro v-if="showDailyBriefingIntro" />
      <UnreadSelectionContext
        v-if="currentSelection === 'unread' && hasLoadedContent && container.length > 0 && currentViewSourceCount !== null"
        :article-count="currentViewUnreadCount"
        :source-count="currentViewSourceCount"
      />
      <ArticleItem
        v-for="article in articles"
        v-bind="article"
        :key="article.id"
        :ref="element => setMinimalArticleRef(element, article.id)"
        :class="{ 'article-list-card-selected': isMinimalArticleSelected(article.id) }"
        :aria-current="isMinimalArticleSelected(article.id) ? 'true' : null"
        :tabindex="minimalArticleTabindex(article.id)"
        :isMinimalContentOpen="String(article.id) === String(activeMinimalArticleId)"
        @update-favorite="$emit('update-favorite', $event)"
        @update-clicked="$emit('update-clicked', $event)"
        @minimal-article-opened="$emit('minimal-article-opened', $event)"
        @minimal-article-closed="$emit('minimal-article-closed', $event)"
        @toggle-read-status="$emit('toggle-read-status', $event)"
        @toggle-minimal-read-status="$emit('toggle-minimal-read-status', $event)"
        @event-articles-loaded="$emit('event-articles-loaded', $event)"
        @event-articles-collapsed="$emit('event-articles-collapsed', $event)"
        @duplicate-articles-loaded="$emit('duplicate-articles-loaded', $event)"
        @duplicate-articles-collapsed="$emit('duplicate-articles-collapsed', $event)"
        @article-not-interested="$emit('article-not-interested', $event)"
      />
    </div>
    <div id="article-load-sentinel" ref="loadMoreSentinel" class="article-load-sentinel" aria-hidden="true"></div>
    <div
      id="no-more"
      v-if="hasLoadedContent"
      :class="{ 'article-empty-state-container': container.length === 0 }"
    >
      <ArticleEmptyState
        v-if="container.length === 0"
        :current-status="currentSelection"
        :selected-tag="selectedTag"
        :refresh-progress="feedRefreshStore.progress"
        :show-refresh-progress="showFeedRefreshProgress"
        @clear-filters="$emit('clear-filters')"
        @clear-tag="$emit('clear-tag')"
        @refresh-feeds="$emit('refresh-feeds')"
        @open-smart-folders="$emit('open-smart-folders')"
        @view-tag-status="$emit('view-tag-status', $event)"
      />
      <ArticleEndState
        v-if="collectionTailState.showEndState"
        :unread-count="currentViewUnreadCount"
        :show-actions="collectionTailState.showEndStateActions"
        :show-dismiss="collectionTailState.showEndStateDismiss"
        @mark-all-read="flushPool"
        @dismiss="dismissArticleEndState"
      />
      <ArticleRefreshState
        v-if="collectionTailState.showRefreshState"
        :unread-count="unreadsSinceLastUpdate"
        @refresh="$emit('forceReload')"
      />
    </div>
    <div id="no-more" v-else>
      <ArticleLoadingState />
    </div>
  </div>
</template>

<script>
import { mapStores } from 'pinia';
import { useOverviewStore } from '../../store/overview.js';
import { useSelectionStore } from '../../store/selection.js';
import { useUiStore } from '../../store/ui.js';
import { useFeedRefreshStore } from '../../store/feedRefresh.js';
import {
  getArticleCollectionTailState,
  shouldShowDailyBriefingIntro
} from '../../services/articleCollectionState.js';
import {
  ARTICLE_KEYBOARD_COMMAND,
  getArticleKeyboardCommand
} from '../../services/articleKeyboardCommands.js';
import ArticleItem from "./Article.vue";
import ArticleEmptyState from "./ArticleEmptyState.vue";
import ArticleEndState from "./ArticleEndState.vue";
import ArticleLoadingState from "./ArticleLoadingState.vue";
import ArticleRefreshState from "./ArticleRefreshState.vue";
import DailyBriefingIntro from "../briefing/DailyBriefingIntro.vue";
import UnreadSelectionContext from "./UnreadSelectionContext.vue";

export default {
  components: {
    ArticleItem,
    ArticleEmptyState,
    ArticleEndState,
    ArticleLoadingState,
    ArticleRefreshState,
    DailyBriefingIntro,
    UnreadSelectionContext
  },
  emits: [
    'update-favorite',
    'update-clicked',
    'minimal-article-opened',
    'minimal-article-closed',
    'toggle-read-status',
    'toggle-minimal-read-status',
    'event-articles-loaded',
    'event-articles-collapsed',
    'duplicate-articles-loaded',
    'duplicate-articles-collapsed',
    'article-not-interested',
    'shortcut-toggle-read',
    'shortcut-toggle-favorite',
    'flush-pool',
    'clear-filters',
    'clear-tag',
    'refresh-feeds',
    'open-smart-folders',
    'view-tag-status',
    'forceReload'
  ],
  props: {
    scrollRoot: {
      type: Object,
      default: null
    },
    articles: {
      type: Array,
      required: true
    },
    container: {
      type: Array,
      required: true
    },
    collectionSummary: {
      type: Object,
      required: true
    },
    collectionProgress: {
      type: Object,
      required: true
    },
    viewMode: {
      type: String,
      required: true
    },
    activeMinimalArticleId: {
      type: [Number, String],
      default: null
    }
  },
  data() {
    return {
      minimalArticleRefs: {},
      selectedArticleId: null,
      isArticleEndStateDismissed: false,
      expandedArticleScrollTimeout: null
    };
  },
  mounted() {
    window.addEventListener('keydown', this.handleMinimalKeydown);
    window.addEventListener('resize', this.updateExpandedScrollbarMetrics);
    this.$nextTick(this.updateExpandedScrollbarMetrics);
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.handleMinimalKeydown);
    window.removeEventListener('resize', this.updateExpandedScrollbarMetrics);

    if (this.expandedArticleScrollTimeout) {
      clearTimeout(this.expandedArticleScrollTimeout);
    }
  },
  computed: {
    ...mapStores(useOverviewStore, useSelectionStore, useUiStore, useFeedRefreshStore),
    // Exposes the active status from the explicit collection presentation contract.
    currentSelection() {
      return this.collectionSummary.status;
    },
    // Exposes the active tag from the explicit collection presentation contract.
    selectedTag() {
      return this.collectionSummary.selectedTag;
    },
    // Exposes the current unread count from the collection presentation contract.
    currentViewUnreadCount() {
      return this.collectionSummary.unreadCount;
    },
    // Exposes the current source count from the collection presentation contract.
    currentViewSourceCount() {
      return this.collectionSummary.sourceCount;
    },
    // Exposes whether the initial collection request has completed.
    hasLoadedContent() {
      return this.collectionProgress.hasLoadedContent;
    },
    // Exposes whether the current unread collection was explicitly flushed.
    isFlushed() {
      return this.collectionProgress.isFlushed;
    },
    // Exposes whether feed refresh feedback belongs in the empty state.
    showFeedRefreshProgress() {
      return this.collectionProgress.showFeedRefreshProgress;
    },
    // Shows the briefing introduction only for the unfiltered all-sources briefing.
    showDailyBriefingIntro() {
      const selection = this.selectionStore.currentSelection;
      return shouldShowDailyBriefingIntro({
        status: this.currentSelection,
        categoryId: selection.categoryId,
        feedId: selection.feedId,
        tag: selection.tag
      });
    },
    // Returns whether the mobile search dialog is currently open.
    mobileSearchOpen() {
      return this.uiStore.mobileSearchOpen;
    },
    // Returns the number of unread articles received since the last update.
    unreadsSinceLastUpdate() {
      return this.overviewStore.unreadsSinceLastUpdate;
    },
    // Returns whether loading or unread-review progress has reached the collection boundary.
    hasReachedArticleListEnd() {
      return this.collectionProgress.hasReachedEnd;
    },
    // Returns whether this stream supports the end state, including mobile Reader fallback.
    supportsArticleEndState() {
      return ['full', 'reader', 'summarized'].includes(this.viewMode);
    },
    // Returns the shared end, action, dismissal, and refresh presentation state.
    collectionTailState() {
      return getArticleCollectionTailState({
        supportsEndState: this.supportsArticleEndState,
        hasReachedEnd: this.hasReachedArticleListEnd,
        isDismissed: this.isArticleEndStateDismissed,
        status: this.currentSelection,
        isFlushed: this.isFlushed,
        unreadCount: this.currentViewUnreadCount,
        articles: this.articles,
        markAsReadOnScroll: this.selectionStore.effectiveMarkAsReadOnScroll,
        unreadsSinceLastUpdate: this.unreadsSinceLastUpdate,
        articleCount: this.container.length
      });
    }
  },
  watch: {
    container() {
      this.isArticleEndStateDismissed = false;
    },
    // Refreshes article focus and overlay-scrollbar geometry after content changes.
    articles() {
      this.$nextTick(() => {
        this.focusSelectedMinimalArticle({ preventScroll: true });
        this.updateExpandedScrollbarMetrics();
      });
    },
    activeMinimalArticleId() {
      this.$nextTick(() => this.focusSelectedMinimalArticle({ preventScroll: true }));
    },
    // Refreshes overlay-scrollbar geometry when the active article presentation changes.
    viewMode() {
      this.$nextTick(this.updateExpandedScrollbarMetrics);
    }
  },
  methods: {
    // Returns the rendered article root owned through this layout's component refs.
    getArticleElement(articleId) {
      return this.minimalArticleRefs[articleId]?.$el || null;
    },
    // Returns the component-owned pagination sentinel.
    getLoadMoreSentinel() {
      return this.$refs.loadMoreSentinel || null;
    },
    // Returns the active inset viewport edge when Expanded mode owns scrolling.
    getReadingViewportTop() {
      const scrollContainer = this.viewMode === 'full'
        ? this.$refs.expandedArticleScrollRef
        : null;
      const overflowY = scrollContainer
        ? window.getComputedStyle(scrollContainer).overflowY
        : null;
      if (!['auto', 'scroll', 'overlay'].includes(overflowY)) return 0;

      const top = scrollContainer?.getBoundingClientRect?.().top;
      return Number.isFinite(top) ? top : 0;
    },
    // Restores the component-owned expanded article surface to the beginning.
    scrollToTop() {
      const articleStream = this.$refs.expandedArticleScrollRef;
      if (articleStream) articleStream.scrollTop = 0;
    },
    // Shows the Expanded-mode scrollbar while the article stream is actively scrolling.
    handleExpandedArticleScroll() {
      if (this.viewMode !== 'full') return;

      const articleStream = this.$refs.expandedArticleScrollRef;
      if (!articleStream) return;

      this.updateExpandedScrollbarMetrics();
      articleStream.classList.add('is-scrolling');

      if (this.expandedArticleScrollTimeout) {
        clearTimeout(this.expandedArticleScrollTimeout);
      }

      this.expandedArticleScrollTimeout = setTimeout(() => {
        articleStream.classList.remove('is-scrolling');
        this.expandedArticleScrollTimeout = null;
      }, 1000);
    },
    // Positions the overlay scrollbar thumb without reducing the Expanded article width.
    updateExpandedScrollbarMetrics() {
      const articleStream = this.$refs?.expandedArticleScrollRef;
      if (!articleStream || this.viewMode !== 'full') return;

      const viewportHeight = articleStream.clientHeight;
      const scrollRange = articleStream.scrollHeight - viewportHeight;
      if (viewportHeight <= 0 || scrollRange <= 0) {
        articleStream.style.setProperty('--expanded-scrollbar-height', '0px');
        articleStream.style.setProperty('--expanded-scrollbar-offset', '0px');
        return;
      }

      const thumbHeight = Math.min(
        viewportHeight,
        Math.max(32, Math.round((viewportHeight * viewportHeight) / articleStream.scrollHeight))
      );
      const thumbOffset = Math.round(
        (articleStream.scrollTop / scrollRange) * (viewportHeight - thumbHeight)
      );

      articleStream.style.setProperty('--expanded-scrollbar-height', `${thumbHeight}px`);
      articleStream.style.setProperty('--expanded-scrollbar-offset', `${thumbOffset}px`);
    },
    // Stores compact article component refs by article id.
    setMinimalArticleRef(element, articleId) {
      if (element) {
        this.minimalArticleRefs[articleId] = element;
      } else {
        delete this.minimalArticleRefs[articleId];
      }
    },
    // Returns whether an article is the active compact selection.
    isMinimalArticleSelected(articleId) {
      return this.viewMode === 'minimal' && String(articleId) === String(this.activeMinimalArticleId);
    },
    // Returns the compact article focus order without touching other modes.
    minimalArticleTabindex(articleId) {
      if (this.viewMode !== 'minimal') return null;
      return this.isMinimalArticleSelected(articleId) ? 0 : -1;
    },
    // Hides the article end state until the current article session changes.
    dismissArticleEndState() {
      this.isArticleEndStateDismissed = true;
    },
    // Requests that the parent marks the remaining unread articles as read.
    flushPool() {
      this.$emit('flush-pool');
    },
    // Handles compact headline keyboard navigation.
    handleMinimalKeydown(event) {
      const command = getArticleKeyboardCommand(event);
      if (!command) return;
      if (!this.articles.length) return;

      if (command === ARTICLE_KEYBOARD_COMMAND.OPEN) {
        event.preventDefault();
        this.openSelectedArticle();
        return;
      }

      if (command === ARTICLE_KEYBOARD_COMMAND.TOGGLE_READ) {
        event.preventDefault();
        this.toggleSelectedReadStatus();
        return;
      }

      if (command === ARTICLE_KEYBOARD_COMMAND.TOGGLE_FAVORITE) {
        event.preventDefault();
        this.toggleSelectedFavorite();
        return;
      }

      const currentIndex = this.selectedArticleIndex();
      const isNextCommand = command === ARTICLE_KEYBOARD_COMMAND.NEXT;
      const fallbackIndex = isNextCommand ? 0 : this.articles.length - 1;
      const nextIndex = currentIndex === -1
        ? fallbackIndex
        : isNextCommand
          ? Math.min(currentIndex + 1, this.articles.length - 1)
          : Math.max(currentIndex - 1, 0);

      event.preventDefault();
      this.selectArticleByIndex(nextIndex);
    },
    // Returns the selected article index for the active list mode.
    selectedArticleIndex() {
      const selectedId = this.viewMode === 'minimal'
        ? this.activeMinimalArticleId
        : this.selectedArticleId ?? this.closestArticleIdToViewport();

      return this.articles.findIndex(article => String(article.id) === String(selectedId));
    },
    // Returns the article nearest to the top of the reading viewport.
    closestArticleIdToViewport() {
      const scrollRoot = this.viewMode === 'full'
        ? this.$refs.expandedArticleScrollRef
        : this.scrollRoot;
      const viewportTop = scrollRoot?.getBoundingClientRect?.().top || 0;
      let closestArticleId = null;
      let closestDistance = Infinity;

      for (const article of this.articles) {
        const element = this.minimalArticleRefs[article.id]?.$el;
        if (!element) continue;

        const distance = Math.abs(element.getBoundingClientRect().top - viewportTop);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestArticleId = article.id;
        }
      }

      return closestArticleId;
    },
    // Selects an article and keeps it visible for keyboard users.
    selectArticleByIndex(index) {
      const article = this.articles[index];
      if (!article) return;

      if (this.viewMode === 'minimal') {
        this.$emit('minimal-article-opened', { id: article.id, status: article.status });
        this.$nextTick(() => this.focusSelectedMinimalArticle());
        return;
      }

      this.selectedArticleId = article.id;
      this.$nextTick(() => this.scrollSelectedArticleIntoView());
    },
    // Focuses and scrolls the selected compact article into view.
    focusSelectedMinimalArticle({ preventScroll = false } = {}) {
      if (this.viewMode !== 'minimal' || this.activeMinimalArticleId === null) return;

      const selectedComponent = this.minimalArticleRefs[this.activeMinimalArticleId];
      const selectedElement = selectedComponent?.$el;
      if (!selectedElement) return;

      selectedElement.focus({ preventScroll });
      selectedElement.scrollIntoView({ block: 'nearest' });
    },
    // Scrolls the selected expanded article into view.
    scrollSelectedArticleIntoView() {
      const selectedComponent = this.minimalArticleRefs[this.selectedArticleId];
      const selectedElement = selectedComponent?.$el;
      selectedElement?.scrollIntoView({ block: 'nearest' });
    },
    // Returns the currently selected article for shortcut actions.
    selectedArticle() {
      const selectedId = this.viewMode === 'minimal'
        ? this.activeMinimalArticleId
        : this.selectedArticleId ?? this.closestArticleIdToViewport();

      return this.articles.find(article => String(article.id) === String(selectedId)) || null;
    },
    // Opens the selected article through the existing article link behavior.
    openSelectedArticle() {
      const selectedArticle = this.selectedArticle();
      if (!selectedArticle) return;

      const selectedComponent = this.minimalArticleRefs[selectedArticle.id];
      selectedComponent?.openOriginalArticle?.();
    },
    // Requests a read status toggle for the selected article.
    toggleSelectedReadStatus() {
      const article = this.selectedArticle();
      if (!article) return;

      this.$emit('shortcut-toggle-read', { id: article.id, status: article.status });
    },
    // Requests a favorite toggle for the selected article.
    toggleSelectedFavorite() {
      const article = this.selectedArticle();
      if (!article) return;

      this.$emit('shortcut-toggle-favorite', { id: article.id });
    }
  }
}
</script>

<style scoped>
/* Landscape phones and portrait tablets */
@media (min-width: 880px) {
  #main-container.expandedArticleLayout {
    --expanded-scrollbar-thumb: var(--scrollbar-thumb-strong);
    --expanded-scrollbar-height: 0px;
    --expanded-scrollbar-offset: 0px;
    height: calc(100vh - 58px);
    margin-top: 58px;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    scrollbar-color: var(--color-transparent) var(--color-transparent);
    scrollbar-width: none;
  }

  #main-container.expandedArticleLayout::-webkit-scrollbar {
    height: 0;
    width: 0;
  }

  #main-container.expandedArticleLayout::after {
    background-color: var(--color-transparent);
    border-radius: 999px;
    content: '';
    height: var(--expanded-scrollbar-height);
    pointer-events: none;
    position: fixed;
    right: 0;
    top: calc(58px + var(--expanded-scrollbar-offset));
    transition: background-color 0.2s ease;
    width: 6px;
    z-index: 999;
  }

  #main-container.expandedArticleLayout.is-scrolling::after {
    background-color: var(--expanded-scrollbar-thumb);
  }

  :global(:root[data-theme='dark']) #main-container.expandedArticleLayout {
    --expanded-scrollbar-thumb: var(--scrollbar-thumb-strong-dark);
  }

  #main-container.expandedArticleLayout #articles {
    padding-top: 0;
    width: 100%;
  }
}

#articles {
  padding-top: 58px;
  overflow-x: hidden;
  overflow-y: hidden;
  right: 0;
  left: 0;
}

/* Removes the desktop toolbar offset from the wider mobile layout. */
@media (min-width: 690px) and (max-width: 767px) {
  #articles {
    padding-top: 0;
  }
}

/* Lets the hybrid document scroll surface receive trackpad scrolling without an inner overflow trap. */
@media (min-width: 768px) and (max-width: 879px) {
  #articles {
    padding-top: 0;
    overflow: visible;
  }
}

/* Removes the article offset when the mobile toolbar overlays portrait layouts. */
@media (max-width: 879px) and (orientation: portrait) {
  #main-container #articles {
    padding-top: 0;
  }
}

/* Lets an empty article list fill the space below the mobile toolbar. */
@media (max-width: 879px) {
  #main-container {
    display: flex;
    flex: 1;
    flex-direction: column;
  }
}

#articles.mobile-search-open {
  padding-top: 98px;
}

/* Lets the measured hybrid toolbar spacer account for the open search panel once. */
@media (min-width: 768px) and (max-width: 879px) {
  #articles.mobile-search-open {
    padding-top: 0;
  }
}

@media (min-width: 880px) {
  #articles.mobile-search-open {
    padding-top: 38px;
  }
}

:global(:root[data-theme='dark'] #articles) {
  color: var(--text-inverted);
  background: var(--dark-page-surface);
  border-color: var(--dark-page-surface);
  border-bottom-color: var(--text-inverted);
}
</style>

<style scoped>
#no-more {
  padding-top: 10px;
  text-align: center;
}

#no-more.article-empty-state-container {
  padding-top: 0;
}

@media (orientation: portrait) {
  #no-more {
    padding-top: 0;
    padding-bottom: 0;
  }
}

@media (max-width: 879px) {
  #no-more {
    display: flex;
    flex: 1;
    flex-direction: column;
  }
}

:global(:root[data-theme='dark'] #no-more) {
  color: var(--text-inverted);
}

#no-more p {
  margin: 0 0 10px;
  vertical-align: middle;
}

.article-load-sentinel {
  height: 1px;
  width: 100%;
}

:global(:root[data-theme='dark'] #no-more p) {
  color: var(--text-inverted);
}
</style>
