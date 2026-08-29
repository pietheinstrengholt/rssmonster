<template>
  <DailyBriefingIntro
    v-if="showDailyBriefingIntro && hasLoadedContent && isCollectionEmpty"
    reader-mode
  />
  <ArticleEmptyState
    v-if="hasLoadedContent && isCollectionEmpty"
    class="article-reader__empty"
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

  <div v-else class="article-reader">
    <aside
      ref="articleListScrollRef"
      class="article-reader__list"
      aria-label="Article list"
    >
      <DailyBriefingIntro v-if="showDailyBriefingIntro" reader-mode />
      <UnreadSelectionContext
        v-if="currentSelection === 'unread' && loadedCount > 0 && currentViewSourceCount !== null"
        :article-count="currentViewUnreadCount"
        :source-count="currentViewSourceCount"
        reader-mode
      />
      <div class="article-list-bulk-header" @click.stop>
        <div class="article-list-bulk-summary">
          <div class="article-list-bulk-title">
            <BootstrapIcon :icon="selectionIcon" aria-hidden="true" />
            <span>{{ selectionTitle }}</span>
          </div>

          <div class="article-list-bulk-stats" aria-label="Current collection summary">
            <span>{{ formattedUnreadCount }} Unread</span>
            <span>{{ eventCount }} Events</span>
            <span>{{ sourceCount }} Sources</span>
          </div>

          <div v-if="topVisibleTags.length" class="article-list-bulk-tags">
            <span>Top tags:</span>
            <button
              v-for="tag in topVisibleTags"
              :key="tag"
              type="button"
              class="article-list-bulk-tag"
              @click="selectionStore.setCurrentSelection({ tag })"
            >
              {{ formatTagName(tag) }}
            </button>
          </div>
        </div>

        <div class="bulk-action-menu-wrap">
          <button
            ref="bulkMoreButton"
            type="button"
            class="bulk-more-button"
            title="More actions"
            aria-label="More actions"
            :aria-expanded="isBulkMenuOpen ? 'true' : 'false'"
            @click.stop="toggleBulkMenu"
          >
            <BootstrapIcon icon="three-dots" aria-hidden="true" />
          </button>

          <div v-if="isBulkMenuOpen" class="bulk-action-menu" :style="bulkMenuStyle" role="menu">
            <div class="bulk-action-menu-section">
              <button type="button" class="bulk-action-menu-item" role="menuitem" @click="runBulkAction('mark-visible-read')">
                <BootstrapIcon icon="check2-circle" aria-hidden="true" />
                <span>Mark all visible as read</span>
              </button>
              <button type="button" class="bulk-action-menu-item" role="menuitem" :disabled="!selectedArticle" @click="runBulkAction('mark-older-read')">
                <BootstrapIcon icon="clock-history" aria-hidden="true" />
                <span>Mark older than current article as read</span>
              </button>
              <button type="button" class="bulk-action-menu-item" role="menuitem" :disabled="selectedArticleIndex <= 0" @click="runBulkAction('mark-above-read')">
                <BootstrapIcon icon="arrow-up-short" aria-hidden="true" />
                <span>Mark articles above as read</span>
              </button>
              <button type="button" class="bulk-action-menu-item" role="menuitem" :disabled="selectedArticleIndex === -1 || selectedArticleIndex >= readerListArticles.length - 1" @click="runBulkAction('mark-below-read')">
                <BootstrapIcon icon="arrow-down-short" aria-hidden="true" />
                <span>Mark articles below as read</span>
              </button>
            </div>
            <div class="bulk-action-menu-section">
              <button type="button" class="bulk-action-menu-item" role="menuitem" @click="runBulkAction('favorite-visible')">
                <BootstrapIcon icon="bookmark" aria-hidden="true" />
                <span>Favorite all visible</span>
              </button>
              <button type="button" class="bulk-action-menu-item" role="menuitem" @click="runBulkAction('mark-visible-clicked')">
                <BootstrapIcon icon="box-arrow-up-right" aria-hidden="true" />
                <span>Mark all visible as clicked</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <article
        v-for="article in readerListArticles"
        :key="article.id"
        class="article-reader__item"
        :class="{
          'article-reader__item--selected': article.id === selectedArticleId,
          'article-reader__item--read': article.status === 'read'
        }"
      >
        <button
          :ref="element => setArticleItemRef(element, article.id)"
          type="button"
          class="article-reader__selection"
          :aria-label="`Select article: ${article.title || 'Untitled article'}`"
          :aria-current="article.id === selectedArticleId ? 'true' : null"
          aria-keyshortcuts="ArrowDown ArrowUp J K Enter O M R S"
          @click="selectArticle(article.id)"
          @keydown.enter.stop.prevent="selectArticle(article.id)"
          @keydown.space.stop.prevent="selectArticle(article.id)"
        ></button>
        <span class="article-reader__item-content">
          <span class="article-reader__item-title"><HighlightedText :text="article.title" :terms="highlightTerms" /></span>
          <span v-if="articlePreview(article)" class="article-reader__item-preview"><HighlightedText :text="articlePreview(article)" :terms="highlightTerms" /></span>
          <span class="article-reader__item-kicker">
            <span>{{ feedName(article) }}</span>
            <span v-if="publishedLabel(article)">{{ publishedLabel(article) }}</span>
          </span>
          <span v-if="!hasArticlePreview(article)" class="article-preview-empty">
            <span class="article-preview-empty__message">No preview available</span>
            <span v-if="articleUrl(article)" aria-hidden="true" class="article-preview-empty__separator">-</span>
            <a
              v-if="articleUrl(article)"
              :href="articleUrl(article)"
              class="article-preview-empty__link"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open original article in a new tab"
              @click.stop="trackOriginalArticleClick(article)"
            >
              <span>Open original article</span>
              <BootstrapIcon icon="box-arrow-up-right" aria-hidden="true" />
            </a>
          </span>
          <span class="article-reader__item-badges">
            <ArticleDevelopingStoryPopover
              v-if="article.isDevelopingStory"
              :article-id="article.id ?? article.event?.developingArticleId"
              icon-class="article-reader__developing-icon"
            />
            <span v-if="article.favoriteInd === 1" class="article-reader__badge article-reader__badge--favorite">Favorite</span>
            <span v-if="article.hotInd === 1" class="article-reader__badge article-reader__badge--hot">Hot</span>
            <span v-if="similarCount(article)" class="article-reader__badge">{{ similarCount(article) }} similar</span>
          </span>
        </span>
        <img v-if="thumbnailUrl(article)" class="article-reader__thumbnail" :src="thumbnailUrl(article)" alt="" loading="lazy" />
      </article>

      <div id="article-load-sentinel" ref="loadMoreSentinel" class="article-load-sentinel" aria-hidden="true"></div>
      <div v-if="collectionProgress.paginationError" class="app-notice app-notice--danger" role="alert">
        <span>{{ collectionProgress.paginationError }}</span>
        <button type="button" class="app-button app-button--outline-secondary app-button--compact" @click="$emit('retry-pagination')">Retry</button>
      </div>

      <div id="no-more" v-if="hasLoadedContent">
        <ArticleEndState
          v-if="collectionTailState.showEndState"
          :unread-count="currentViewUnreadCount"
          :show-actions="collectionTailState.showEndStateActions"
          :show-dismiss="collectionTailState.showEndStateDismiss"
          @mark-all-read="$emit('flush-pool')"
          @dismiss="dismissReaderEndState"
        />
        <ArticleRefreshState
          v-if="collectionTailState.showRefreshState"
          :unread-count="unreadsSinceLastUpdate"
          @refresh="$emit('forceReload')"
        />
      </div>
      <div v-else class="reader-loading-state" role="status" aria-label="Loading articles">
        <div class="reader-loading-state__items" aria-hidden="true">
          <div v-for="index in 4" :key="index" class="reader-loading-skeleton">
            <span class="reader-loading-skeleton__title"></span>
            <span class="reader-loading-skeleton__title reader-loading-skeleton__title--short"></span>
            <span class="reader-loading-skeleton__preview"></span>
            <span class="reader-loading-skeleton__meta"></span>
          </div>
        </div>
        <span class="app-visually-hidden">Loading articles</span>
      </div>
    </aside>

    <section
      ref="readerArticlePanelRef"
      class="article-reader__content"
      aria-label="Reader"
    >
      <ArticleItem
        v-if="selectedArticle"
        ref="selectedArticleComponent"
        v-bind="selectedArticle"
        :key="selectedArticle.id"
        @update-favorite="$emit('update-favorite', $event)"
        @update-clicked="$emit('update-clicked', $event)"
        @toggle-read-status="$emit('toggle-read-status', $event)"
        @event-articles-loaded="$emit('event-articles-loaded', $event)"
        @event-articles-collapsed="$emit('event-articles-collapsed', $event)"
        @duplicate-articles-loaded="$emit('duplicate-articles-loaded', $event)"
        @duplicate-articles-collapsed="$emit('duplicate-articles-collapsed', $event)"
        @article-not-interested="$emit('article-not-interested', $event)"
      />
      <ArticleItem
        v-for="article in selectedRelatedArticles"
        :key="article.id"
        :ref="element => setRelatedArticleRef(element, article.id)"
        v-bind="article"
        @update-favorite="$emit('update-favorite', $event)"
        @update-clicked="$emit('update-clicked', $event)"
        @toggle-read-status="$emit('toggle-read-status', $event)"
        @event-articles-loaded="$emit('event-articles-loaded', $event)"
        @event-articles-collapsed="$emit('event-articles-collapsed', $event)"
        @duplicate-articles-loaded="$emit('duplicate-articles-loaded', $event)"
        @duplicate-articles-collapsed="$emit('duplicate-articles-collapsed', $event)"
        @article-not-interested="$emit('article-not-interested', $event)"
      />
      <ArticleRecommendations
        v-if="selectedArticle && recommendations.length"
        :articles="recommendations"
        @select="handleRecommendationSelect"
      />
    </section>
  </div>
</template>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { useOverviewStore } from '../../store/overview.js';
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
import ArticleDevelopingStoryPopover from './ArticleDevelopingStoryPopover.vue';
import ArticleRecommendations from './ArticleRecommendations.vue';
import ArticleEmptyState from "./ArticleEmptyState.vue";
import ArticleEndState from "./ArticleEndState.vue";
import ArticleRefreshState from "./ArticleRefreshState.vue";
import DailyBriefingIntro from "../briefing/DailyBriefingIntro.vue";
import UnreadSelectionContext from "./UnreadSelectionContext.vue";
import { formatRelativeDate } from '../../utils/date';
import { formatTagName } from '../../utils/tags';
import { usableHttpUrl } from '../../utils/content';
import {
  fetchArticleRecommendations,
  markClicked as markArticleClickedAPI
} from '../../api/articles';
import { notifyActionError } from '../../services/actionNotifications.js';
import { summarizeArticleContent } from '../../services/articleContentService.js';
import { getArticleStatusOption } from '../../config/articleSelectionOptions.js';
import HighlightedText from '../shared/HighlightedText.vue';
import { parseSearchHighlightTerms } from '../../services/searchHighlight.js';

const PREVIEW_LENGTH = 150;

export default {
  components: {
    ArticleItem,
    ArticleDevelopingStoryPopover,
    ArticleRecommendations,
    ArticleEmptyState,
    ArticleEndState,
    ArticleRefreshState,
    DailyBriefingIntro,
    HighlightedText,
    UnreadSelectionContext
  },
  emits: [
    'update-favorite',
    'update-clicked',
    'toggle-read-status',
    'event-articles-loaded',
    'event-articles-collapsed',
    'duplicate-articles-loaded',
    'duplicate-articles-collapsed',
    'article-not-interested',
    'mark-previous-article-read',
    'shortcut-toggle-read',
    'shortcut-toggle-favorite',
    'flush-pool',
    'clear-filters',
    'clear-tag',
    'refresh-feeds',
    'open-smart-folders',
    'retry-pagination',
    'view-tag-status',
    'forceReload',
    'bulk-action',
    'select-recommendation'
  ],
  props: {
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
    }
  },
  data() {
    return {
      articleItemRefs: {},
      relatedArticleRefs: {},
      selectedArticleId: null,
      isReaderEndStateDismissed: false,
      isBulkMenuOpen: false,
      bulkMenuStyle: {},
      pendingClickedArticleIds: new Set(),
      recommendations: [],
      recommendationsLoading: false,
      recommendationsError: false,
      recommendationRequestId: 0
    };
  },
  mounted() {
    window.addEventListener('keydown', this.handleReaderKeydown);
    window.addEventListener('resize', this.updateBulkMenuPosition);
    window.addEventListener('scroll', this.updateBulkMenuPosition, true);
    document.addEventListener('click', this.closeBulkMenu);
  },
  beforeUnmount() {
    this.recommendationRequestId += 1;
    window.removeEventListener('keydown', this.handleReaderKeydown);
    window.removeEventListener('resize', this.updateBulkMenuPosition);
    window.removeEventListener('scroll', this.updateBulkMenuPosition, true);
    document.removeEventListener('click', this.closeBulkMenu);

  },
  computed: {
    ...mapStores(useSelectionStore, useOverviewStore, useUiStore, useFeedRefreshStore),
    // Returns the visible text intent represented by the active article search.
    highlightTerms() {
      return parseSearchHighlightTerms(this.selectionStore.currentSelection.search);
    },
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
    totalCount() {
      return this.collectionSummary.totalCount ?? this.container.length;
    },
    loadedCount() {
      return this.collectionProgress.loadedCount ?? this.container.length;
    },
    isCollectionEmpty() {
      return this.collectionProgress.isCollectionEmpty ?? this.loadedCount === 0;
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
    // Keeps temporarily expanded related articles out of the reader's middle-pane list.
    readerListArticles() {
      return this.getReaderListArticles();
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
    // Returns the article currently shown in the reader panel.
    selectedArticle() {
      return this.articles.find(article => article.id === this.selectedArticleId) || null;
    },
    // Returns related articles expanded beneath the selected article in the reader panel.
    selectedRelatedArticles() {
      return this.articles.filter(article => article.clusterParentId === this.selectedArticleId);
    },
    // Returns the index of the article currently shown in the reader panel.
    selectedArticleIndex() {
      return this.getReaderListArticles().findIndex(article => article.id === this.selectedArticleId);
    },
    // Returns the icon name that matches the active reader collection.
    selectionIcon() {
      const selection = this.selectionStore.currentSelection;
      const statusOption = getArticleStatusOption(selection.status);
      if (selection.smartFolderId !== null) return 'folder-fill';
      if (selection.tag) return 'tag-fill';
      if (selection.status === 'briefing') return statusOption?.icon || 'collection-fill';
      if (selection.search) return 'search';
      if (selection.feedId !== '%') return 'rss-fill';
      if (selection.categoryId !== '%') return 'folder-fill';

      return statusOption?.icon || 'collection-fill';
    },
    // Returns the display name for the active reader collection.
    selectionTitle() {
      const selection = this.selectionStore.currentSelection;
      const statusOption = getArticleStatusOption(selection.status);

      if (selection.smartFolderId !== null) {
        const smartFolder = this.overviewStore.smartFolders.find(folder => folder.id === selection.smartFolderId);
        if (smartFolder?.name) return smartFolder.name;
      }

      if (selection.tag) return this.formatTagName(selection.tag);
      if (selection.status === 'briefing') return statusOption?.label || 'All articles';
      if (selection.search) return `Search: ${selection.search}`;

      const categoryId = Number(selection.categoryId);
      const feedId = Number(selection.feedId);
      const category = Number.isFinite(categoryId)
        ? this.overviewStore.categories.find(item => item.id === categoryId)
        : null;

      if (Number.isFinite(feedId) && category) {
        const feed = category.feeds?.find(item => item.id === feedId);
        if (feed?.feedName) return feed.feedName;
      }

      if (category?.name) return category.name;

      return statusOption?.sidebarLabel || statusOption?.label || 'All articles';
    },
    // Returns the formatted unread count for the active reader collection.
    formattedUnreadCount() {
      return new Intl.NumberFormat().format(this.currentViewUnreadCount);
    },
    // Returns the distinct event count in the loaded reader list.
    eventCount() {
      const eventIds = new Set();
      for (const article of this.articles.filter(item => !item.readerRecommendationInd)) {
        const eventId = article.event?.id || article.eventId;
        if (eventId) eventIds.add(eventId);
      }
      return eventIds.size;
    },
    // Returns the distinct source count for the current article collection.
    sourceCount() {
      if (this.currentViewSourceCount !== null) {
        return this.currentViewSourceCount;
      }

      return new Set(this.articles
        .filter(article => !article.readerRecommendationInd)
        .map(article => article.feedId || article.feed?.id)
        .filter(Boolean)).size;
    },
    // Returns the most frequent tags in the loaded reader list.
    topVisibleTags() {
      const counts = new Map();
      for (const article of this.articles.filter(item => !item.readerRecommendationInd)) {
        for (const tag of article.tags || article.Tags || []) {
          if (!tag?.name) continue;
          counts.set(tag.name, (counts.get(tag.name) || 0) + 1);
        }
      }

      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 4)
        .map(([tag]) => tag);
    },
    // Returns the number of unread articles received since the last update.
    unreadsSinceLastUpdate() {
      return this.collectionProgress.newerArticleCount ?? 0;
    },
    // Returns whether the reader list has loaded every article in the current scope.
    hasReachedArticleListEnd() {
      return this.collectionProgress.hasReachedEnd;
    },
    // Returns the shared end, action, dismissal, and refresh presentation state.
    collectionTailState() {
      return getArticleCollectionTailState({
        hasReachedEnd: this.hasReachedArticleListEnd,
        isDismissed: this.isReaderEndStateDismissed,
        status: this.currentSelection,
        isFlushed: this.isFlushed,
        unreadCount: this.currentViewUnreadCount,
        articles: this.articles.filter(article => !article.readerRecommendationInd),
        markAsReadOnScroll: this.selectionStore.effectiveMarkAsReadOnScroll,
        unreadsSinceLastUpdate: this.unreadsSinceLastUpdate,
        articleCount: this.totalCount,
        newerArticlesAvailable: this.collectionProgress.newerArticlesAvailable === true
      });
    }
  },
  watch: {
    articles: {
      immediate: true,
      handler(articles) {
        const selectableArticles = articles.filter(article => (
          !article.clusterParentId && !article.readerRecommendationInd
        ));

        if (!selectableArticles.length) {
          this.selectedArticleId = null;
          return;
        }

        if (!articles.some(article => article.id === this.selectedArticleId)) {
          this.selectedArticleId = selectableArticles[0].id;
        }
      }
    },
    selectedArticleId: {
      immediate: true,
      // Refreshes recommendations independently whenever the Reader selection changes.
      handler(articleId) {
        this.loadRecommendations(articleId);
      }
    },
    container() {
      this.isReaderEndStateDismissed = false;
      this.closeBulkMenu();
    }
  },
  methods: {
    // Returns the rendered Reader article root through component-owned article refs.
    getArticleElement(articleId) {
      if (String(this.selectedArticle?.id) === String(articleId)) {
        return this.$refs.selectedArticleComponent?.$el || null;
      }
      return this.relatedArticleRefs[articleId]?.$el || null;
    },
    // Returns the Reader-owned pagination sentinel.
    getLoadMoreSentinel() {
      return this.$refs.loadMoreSentinel || null;
    },
    // Returns the browser viewport edge used by Reader visibility tracking.
    getReadingViewportTop() {
      return 0;
    },
    // Restores both Reader-owned scroll surfaces to the beginning.
    scrollToTop() {
      const articleList = this.$refs.articleListScrollRef;
      const articlePanel = this.$refs.readerArticlePanelRef;
      if (articleList) articleList.scrollTop = 0;
      if (articlePanel) articlePanel.scrollTop = 0;
    },
    // Returns the primary collection articles that belong in the reader's middle pane.
    getReaderListArticles() {
      return this.articles.filter(article => (
        !article.clusterParentId && !article.readerRecommendationInd
      ));
    },
    // Fetches recommendations without blocking or surfacing failures in the article pane.
    async loadRecommendations(articleId) {
      const requestId = ++this.recommendationRequestId;
      this.recommendations = [];
      this.recommendationsError = false;
      this.recommendationsLoading = Boolean(articleId);

      if (!articleId) return;

      try {
        const response = await fetchArticleRecommendations(articleId);
        if (requestId !== this.recommendationRequestId) return;

        this.recommendations = Array.isArray(response.data?.articles)
          ? response.data.articles.slice(0, 4)
          : [];
      } catch {
        if (requestId !== this.recommendationRequestId) return;
        this.recommendationsError = true;
      } finally {
        if (requestId === this.recommendationRequestId) {
          this.recommendationsLoading = false;
        }
      }
    },
    // Delegates recommendation selection to the feed that owns article detail loading.
    handleRecommendationSelect(article) {
      if (!article?.id) return;
      this.$emit('select-recommendation', article.id);
    },
    // Formats stored tag names for display.
    formatTagName,
    // Opens or closes the reader bulk action menu.
    toggleBulkMenu() {
      this.isBulkMenuOpen = !this.isBulkMenuOpen;
      if (this.isBulkMenuOpen) {
        this.$nextTick(() => this.updateBulkMenuPosition());
      }
    },
    // Closes the reader bulk action menu.
    closeBulkMenu() {
      this.isBulkMenuOpen = false;
    },
    // Positions the bulk menu under the three-dot button across pane boundaries.
    updateBulkMenuPosition() {
      if (!this.isBulkMenuOpen) return;

      const button = this.$refs.bulkMoreButton;
      if (!button) return;

      const rect = button.getBoundingClientRect();
      const menuWidth = 280;
      const left = Math.min(rect.left, window.innerWidth - menuWidth - 12);

      this.bulkMenuStyle = {
        left: `${Math.round(Math.max(12, left))}px`,
        top: `${Math.round(rect.bottom + 8)}px`
      };
    },
    // Emits the selected bulk action to the article feed parent.
    runBulkAction(action) {
      this.closeBulkMenu();
      this.$emit('bulk-action', {
        action,
        selectedArticleId: this.selectedArticleId
      });
    },
    // Hides the reader end state until the current article session changes.
    dismissReaderEndState() {
      this.isReaderEndStateDismissed = true;
    },
    // Stores article list item element refs by article id.
    setArticleItemRef(element, articleId) {
      if (element) {
        this.articleItemRefs[articleId] = element;
      } else {
        delete this.articleItemRefs[articleId];
      }
    },
    // Stores related Reader article component refs by article id.
    setRelatedArticleRef(element, articleId) {
      if (element) {
        this.relatedArticleRefs[articleId] = element;
      } else {
        delete this.relatedArticleRefs[articleId];
      }
    },
    // Selects the article displayed in the reader panel.
    selectArticle(articleId) {
      if (articleId === this.selectedArticleId) return;
      if (this.selectedArticleId !== null) {
        this.$emit('mark-previous-article-read', this.selectedArticleId);
      }
      this.selectedArticleId = articleId;
      this.$nextTick(() => this.resetReaderArticlePanelScroll());
    },
    // Starts each newly selected reader article at the top of its panel.
    resetReaderArticlePanelScroll() {
      const articlePanel = this.$refs.readerArticlePanelRef;
      if (articlePanel) articlePanel.scrollTop = 0;
    },
    // Selects an article by index when keyboard navigation moves through the list.
    selectArticleByIndex(index) {
      const readerListArticles = this.getReaderListArticles();
      if (index < 0 || index >= readerListArticles.length) return;
      const article = readerListArticles[index];
      this.selectArticle(article.id);
      this.$nextTick(() => this.focusSelectedListItem());
    },
    // Focuses and scrolls the selected article list item into view.
    focusSelectedListItem() {
      const selectedItem = this.articleItemRefs[this.selectedArticleId];
      if (!selectedItem) return;
      selectedItem.focus({ preventScroll: true });
      selectedItem.scrollIntoView({ block: 'nearest' });
    },
    // Handles reader-mode keyboard navigation.
    handleReaderKeydown(event) {
      if (event.key === 'Escape' && this.isBulkMenuOpen) {
        this.closeBulkMenu();
        return;
      }

      const command = getArticleKeyboardCommand(event, {
        allowInteractiveTarget: event.target?.classList?.contains('article-reader__selection'),
        checkEditableAncestors: false
      });
      if (!command) return;

      const readerListArticles = this.getReaderListArticles();
      const currentIndex = readerListArticles.findIndex(article => article.id === this.selectedArticleId);
      if (currentIndex === -1) return;

      if (command === ARTICLE_KEYBOARD_COMMAND.NEXT) {
        event.preventDefault();
        this.selectArticleByIndex(Math.min(currentIndex + 1, readerListArticles.length - 1));
      } else if (command === ARTICLE_KEYBOARD_COMMAND.PREVIOUS) {
        event.preventDefault();
        this.selectArticleByIndex(Math.max(currentIndex - 1, 0));
      } else if (command === ARTICLE_KEYBOARD_COMMAND.OPEN) {
        event.preventDefault();
        this.openSelectedArticle();
      } else if (command === ARTICLE_KEYBOARD_COMMAND.TOGGLE_READ) {
        event.preventDefault();
        this.toggleSelectedReadStatus();
      } else {
        event.preventDefault();
        this.toggleSelectedFavorite();
      }
    },
    // Opens the selected article through the existing article link behavior.
    openSelectedArticle() {
      this.$refs.selectedArticleComponent?.openOriginalArticle?.();
    },
    // Requests a read status toggle for the selected reader article.
    toggleSelectedReadStatus() {
      if (!this.selectedArticle) return;
      this.$emit('shortcut-toggle-read', {
        id: this.selectedArticle.id,
        status: this.selectedArticle.status
      });
    },
    // Requests a favorite toggle for the selected reader article.
    toggleSelectedFavorite() {
      if (!this.selectedArticle) return;
      this.$emit('shortcut-toggle-favorite', { id: this.selectedArticle.id });
    },
    // Returns the feed label for a row in the reader article list.
    feedName(article) {
      return article.author || article.feed?.feedName || 'Unknown feed';
    },
    // Returns the publication label for a row in the reader article list.
    publishedLabel(article) {
      return formatRelativeDate(article.firstSeen || article.publishedAt);
    },
    // Returns a short plain-text preview for a row in the reader article list.
    articlePreview(article) {
      const text = summarizeArticleContent(article.contentText);
      return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH).trim()}...` : text;
    },
    // Returns whether the list item has meaningful body text, a summary, or an image.
    hasArticlePreview(article) {
      return Boolean(summarizeArticleContent(article.contentText)) ||
        Boolean(this.thumbnailUrl(article));
    },
    // Returns an absolute HTTP(S) article destination eligible for external navigation.
    articleUrl(article) {
      return usableHttpUrl(article?.url);
    },
    // Returns an image thumbnail URL for a row in the reader article list.
    thumbnailUrl(article) {
      return [article.imageUrl, article.image, article.enclosureUrl]
        .map(usableHttpUrl)
        .find(Boolean) || '';
    },
    // Tracks an original-article link through the same clicked-article behavior as the reader panel.
    async trackOriginalArticleClick(article) {
      const articleKey = String(article.id);
      if (this.pendingClickedArticleIds.has(articleKey)) return;

      this.pendingClickedArticleIds.add(articleKey);
      try {
        const response = await markArticleClickedAPI(article.id);
        const responseClickedAmount = Number(response?.data?.clickedAmount);
        const currentClickedAmount = Number(article.clickedAmount) || 0;
        this.$emit('update-clicked', {
          id: article.id,
          clickedAmount: Number.isFinite(responseClickedAmount)
            ? responseClickedAmount
            : currentClickedAmount + 1
        });
      } catch (error) {
        console.error(`Error recording reader click for article ${article.id}:`, error);
        notifyActionError('Could not record this article click. Please try again.', error);
      } finally {
        this.pendingClickedArticleIds.delete(articleKey);
      }
    },
    // Returns the related article count when available.
    similarCount(article) {
      if (article.isEventArticle) return 0;
      return article.eventArticleCountTotal > 1 ? article.eventArticleCountTotal - 1 : 0;
    }
  }
}
</script>

<style scoped>
.article-reader__empty {
  flex: 1;
  min-height: 0;
}

.article-reader {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(340px, 38%) minmax(0, 1fr);
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.article-reader__list {
  --article-list-scrollbar-thumb: var(--scrollbar-thumb-strong);
  border-right: 1px solid var(--border-subtle);
  min-height: 0;
  overflow-y: auto;
  padding: 0 10px 24px;
  scrollbar-color: var(--article-list-scrollbar-thumb) var(--color-transparent);
  scrollbar-width: thin;
}

.article-reader__list::-webkit-scrollbar {
  height: 6px;
  width: 6px;
}

.article-reader__list::-webkit-scrollbar-track {
  background: var(--color-transparent);
}

.article-reader__list::-webkit-scrollbar-thumb {
  background-color: var(--article-list-scrollbar-thumb);
  border-radius: 999px;
}

.article-list-bulk-header {
  background: var(--surface-card);
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) auto;
  margin: 0 -10px 10px;
  padding: 16px 14px 14px;
  position: relative;
}

.article-list-bulk-summary {
  min-width: 0;
}

.article-list-bulk-title {
  align-items: center;
  color: var(--text-primary);
  display: flex;
  gap: 8px;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.25;
  min-width: 0;
}

.article-list-bulk-title span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.article-list-bulk-title .bi {
  color: var(--text-secondary);
  flex: 0 0 auto;
  font-size: 15px;
}

.article-list-bulk-stats {
  align-items: center;
  color: var(--text-secondary);
  display: flex;
  flex-wrap: wrap;
  font-size: 12px;
  font-weight: 700;
  gap: 0;
  margin-top: 16px;
}

.article-list-bulk-stats span {
  border-right: 1px solid var(--border-subtle);
  line-height: 1;
  padding: 0 12px;
}

.article-list-bulk-stats span:first-child {
  padding-left: 0;
}

.article-list-bulk-stats span:last-child {
  border-right: 0;
  padding-right: 0;
}

.article-list-bulk-tags {
  align-items: center;
  color: var(--text-muted);
  display: flex;
  flex-wrap: wrap;
  font-size: 11px;
  gap: 8px;
  margin-top: 16px;
}

.article-list-bulk-tag {
  align-items: center;
  background-color: var(--article-tag-background);
  border: 0;
  border-radius: 6px;
  color: var(--badge-tag-text);
  cursor: pointer;
  display: inline-flex;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  padding: 3px 8px;
  vertical-align: middle;
  white-space: nowrap;
}

.article-list-bulk-tag:hover {
  opacity: 0.85;
}

.bulk-action-menu-wrap {
  position: relative;
}

.bulk-more-button {
  align-items: center;
  background: var(--color-transparent);
  border: 0;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  height: 30px;
  justify-content: center;
  width: 30px;
}

.bulk-more-button:hover,
.bulk-more-button:focus-visible {
  background: var(--reader-list-item-hover-background);
  color: var(--text-primary);
  outline: none;
}

.bulk-action-menu {
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: 0 16px 36px var(--shadow-reader-bulk-menu-color);
  max-width: calc(100vw - 24px);
  min-width: 280px;
  padding: 8px;
  position: fixed;
  z-index: var(--layer-dropdown);
}

.bulk-action-menu-section {
  border-bottom: 1px solid var(--border-subtle);
  padding: 6px 0;
}

.bulk-action-menu-section:first-child {
  padding-top: 0;
}

.bulk-action-menu-section:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.bulk-action-menu-item {
  align-items: center;
  background: var(--color-transparent);
  border: none;
  border-radius: 6px;
  color: var(--toolbar-text);
  display: flex;
  font-size: 14px;
  font-weight: 500;
  gap: 10px;
  min-height: 36px;
  padding: 8px 10px;
  text-align: left;
  width: 100%;
}

.bulk-action-menu-item:hover:not(:disabled),
.bulk-action-menu-item:focus-visible:not(:disabled) {
  background: var(--reader-list-item-hover-background);
  outline: none;
}

.bulk-action-menu-item:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
  opacity: 0.55;
}

.bulk-action-menu-item .bi {
  color: var(--text-secondary);
  flex: 0 0 18px;
  width: 18px;
}

.article-reader__item {
  background: var(--reader-list-item-background);
  border: 1px solid var(--reader-list-item-border);
  border-radius: 8px;
  box-sizing: border-box;
  color: var(--reader-list-item-title);
  cursor: pointer;
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(0, 1fr) auto;
  margin-bottom: 8px;
  padding: 10px 12px;
  position: relative;
  text-align: left;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  width: 100%;
}

.article-reader__item:hover {
  background: var(--reader-list-item-hover-background);
  border-color: var(--reader-list-item-hover-border);
}

.article-reader__selection {
  background: var(--color-transparent);
  border: 0;
  border-radius: inherit;
  cursor: pointer;
  inset: 0;
  padding: 0;
  position: absolute;
  z-index: 1;
}

.article-reader__selection:focus:not(:focus-visible) {
  outline: none;
}

.article-reader__selection:focus-visible {
  outline: 3px solid var(--border-focus);
  outline-offset: -3px;
}

.article-reader__item--selected {
  background: var(--reader-list-item-selected-background);
  border-color: var(--reader-list-item-selected-border);
  border-left: 3px solid var(--reader-list-item-selected-accent);
  color: var(--reader-list-item-selected-title);
}

.article-reader__item--selected:hover {
  background: var(--reader-list-selected-hover-background);
  border-color: var(--reader-list-item-selected-hover-border);
  border-left: 3px solid var(--reader-list-item-selected-accent);
  color: var(--reader-list-item-selected-title);
}

.article-reader__item-content {
  min-width: 0;
  pointer-events: none;
  position: relative;
  z-index: 2;
}

.article-reader__item-kicker {
  color: var(--reader-list-item-meta);
  display: flex;
  flex-wrap: wrap;
  font-size: 11px;
  font-weight: 600;
  gap: 8px;
  line-height: 1.3;
  margin-bottom: 2px;
  margin-top: 5px;
}

.article-reader__item-title {
  color: var(--reader-list-item-title);
  display: block;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
  transition: color 0.15s ease, font-weight 0.15s ease;
}

.article-reader__item--read:not(.article-reader__item--selected) .article-reader__item-title {
  color: var(--reader-list-item-preview);
  font-weight: 600;
}

.article-reader__item--selected .article-reader__item-title {
  color: var(--reader-list-item-selected-title);
}

.article-reader__item-preview {
  color: var(--reader-list-item-preview);
  display: -webkit-box;
  font-size: 12px;
  line-height: 1.45;
  margin-top: 6px;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.article-preview-empty {
  align-items: center;
  color: var(--reader-empty-preview-text);
  display: flex;
  flex-wrap: wrap;
  font-size: 0.8125rem;
  gap: 0.3rem;
  line-height: 1.35;
  margin-top: 0.45rem;
}

.article-preview-empty__message,
.article-preview-empty__separator {
  color: inherit;
}

.article-preview-empty__link {
  align-items: center;
  color: var(--reader-empty-preview-text);
  display: inline-flex;
  font-weight: 500;
  gap: 0.25rem;
  text-decoration: none;
  pointer-events: auto;
  position: relative;
  z-index: 3;
}

.article-preview-empty__link:hover {
  color: var(--color-link);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.article-preview-empty__link:focus-visible {
  border-radius: 0.2rem;
  color: var(--color-link);
  outline: 2px solid var(--color-link);
  outline-offset: 2px;
}

.article-preview-empty__link .bi {
  flex: 0 0 auto;
  font-size: 0.75rem;
}

.article-reader__item-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

.article-reader__item-badges :deep(.article-developing-story-popover) {
  pointer-events: auto;
  position: relative;
  z-index: 3;
}

.article-reader__badge {
  background: var(--badge-tag-bg);
  border-radius: 999px;
  color: var(--badge-tag-text);
  display: inline-flex;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  padding: 4px 7px;
}

.article-reader__badge--favorite {
  background: var(--badge-quality-bg);
  color: var(--badge-quality-text);
}

.article-reader__developing-icon {
  color: var(--color-info-strong);
  font-size: 0.875rem;
  line-height: 1;
}

:global(:root[data-theme='dark'] .article-reader__developing-icon) {
  color: var(--color-info-strong);
}

.article-reader__badge--hot {
  background: var(--badge-ad-bg);
  color: var(--badge-ad-text);
}

.article-reader__thumbnail {
  align-self: start;
  background: var(--surface-chrome);
  border-radius: 6px;
  display: block;
  height: 72px;
  object-fit: cover;
  pointer-events: none;
  position: relative;
  width: 96px;
  z-index: 2;
}

.article-reader__content {
  --reader-article-panel-scrollbar-thumb: var(--scrollbar-thumb-strong);
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  overscroll-behavior-y: contain;
  scrollbar-color: var(--reader-article-panel-scrollbar-thumb) var(--color-transparent);
  scrollbar-width: thin;
}

.article-reader__content::-webkit-scrollbar {
  height: 6px;
  width: 6px;
}

.article-reader__content::-webkit-scrollbar-track {
  background: var(--color-transparent);
}

.article-reader__content::-webkit-scrollbar-thumb {
  background-color: var(--reader-article-panel-scrollbar-thumb);
  border-radius: 999px;
}

.article-load-sentinel {
  height: 1px;
  width: 100%;
}

.reader-loading-state {
  padding-top: 2px;
}

.reader-loading-state__items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reader-loading-skeleton {
  background: var(--reader-list-item-background);
  border: 1px solid var(--reader-list-item-border);
  border-radius: 8px;
  padding: 12px;
}

.reader-loading-skeleton span {
  animation: reader-loading-pulse 1.4s ease-in-out infinite;
  background: var(--surface-chrome);
  border-radius: 4px;
  display: block;
}

.reader-loading-skeleton__title {
  height: 11px;
  margin-bottom: 7px;
  width: 88%;
}

.reader-loading-skeleton__title--short {
  width: 62%;
}

.reader-loading-skeleton__preview {
  height: 8px;
  margin-top: 12px;
  width: 94%;
}

.reader-loading-skeleton__meta {
  height: 7px;
  margin-top: 10px;
  width: 38%;
}

@keyframes reader-loading-pulse {
  0%,
  100% {
    opacity: 0.55;
  }

  50% {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .article-reader__item,
  .article-reader__item-title {
    transition: none;
  }

  .reader-loading-skeleton span {
    animation: none;
  }
}

:global(:root[data-theme='dark']) .article-reader__list {
  --article-list-scrollbar-thumb: var(--scrollbar-thumb-strong-dark);
  border-color: var(--border-subtle);
}

:global(:root[data-theme='dark']) .article-reader__content {
  --reader-article-panel-scrollbar-thumb: var(--scrollbar-thumb-strong-dark);
}

:global(:root[data-theme='dark']) .article-list-bulk-header {
  background: var(--bg-modal);
  border-color: var(--border-subtle);
}

:global(:root[data-theme='dark']) .bulk-action-menu {
  background: var(--bg-modal);
  border-color: var(--border-default);
  box-shadow: 0 18px 40px var(--shadow-reader-bulk-menu-color);
}

:global(:root[data-theme='dark']) .bulk-action-menu-section {
  border-color: var(--border-subtle);
}

:global(:root[data-theme='dark']) .article-list-bulk-tag {
  background-color: var(--article-tag-background-dark);
  color: var(--article-tag-text-dark);
}

:global(:root[data-theme='dark']) .article-reader__item {
  background: var(--reader-list-item-background);
  border-color: var(--reader-list-item-border);
  color: var(--reader-list-item-title);
}

:global(:root[data-theme='dark']) .article-reader__item:hover {
  background: var(--reader-list-item-hover-background);
  border-color: var(--reader-list-item-hover-border);
  color: var(--reader-list-item-title);
}

:global(:root[data-theme='dark']) .article-reader__item .article-reader__item-title {
  color: var(--reader-list-item-title);
}

:global(:root[data-theme='dark']) .article-reader__item .article-reader__item-kicker {
  color: var(--reader-list-item-meta);
}

:global(:root[data-theme='dark']) .article-reader__item .article-reader__item-preview {
  color: var(--reader-list-item-preview);
}

:global(:root[data-theme='dark']) .article-preview-empty,
:global(:root[data-theme='dark']) .article-preview-empty__link {
  color: var(--reader-empty-preview-text);
}

:global(:root[data-theme='dark']) .article-preview-empty__link:hover,
:global(:root[data-theme='dark']) .article-preview-empty__link:focus-visible {
  color: var(--color-link);
  outline-color: var(--color-link);
}

:global(:root[data-theme='dark']) .article-reader__item--selected {
  background: var(--reader-list-item-selected-background);
  border-color: var(--reader-list-item-selected-border);
  border-left: 3px solid var(--reader-list-item-selected-accent);
  color: var(--reader-list-item-selected-title);
}

:global(:root[data-theme='dark']) .article-reader__item--selected:hover {
  background: var(--reader-list-selected-hover-background);
  border-color: var(--reader-list-item-selected-hover-border);
  border-left: 3px solid var(--reader-list-item-selected-accent);
  color: var(--reader-list-item-selected-title);
}

:global(:root[data-theme='dark']) .article-reader__item--selected .article-reader__item-title,
:global(:root[data-theme='dark']) .article-reader__item--selected:hover .article-reader__item-title {
  color: var(--reader-list-item-selected-title);
}

:global(:root[data-theme='dark']) .article-reader__item--selected .article-reader__item-kicker {
  color: var(--reader-list-item-selected-meta);
}

:global(:root[data-theme='dark']) .article-reader__item--selected .article-reader__item-preview {
  color: var(--reader-list-item-selected-preview);
}

:global(:root[data-theme='dark']) .article-reader__item--selected:hover .article-reader__item-kicker {
  color: var(--reader-list-item-selected-hover-meta);
}

:global(:root[data-theme='dark']) .article-reader__item--selected:hover .article-reader__item-preview {
  color: var(--reader-list-item-selected-hover-preview);
}

:global(:root[data-theme='dark']) .article-reader__thumbnail {
  background: var(--surface-control);
}

</style>
