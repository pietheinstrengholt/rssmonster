<template>
  <div id="main-container">
    <div id="articles" :class="{ 'mobile-search-open': mobileSearchOpen }">
      <DailyBriefingIntro v-if="currentSelection === 'briefing'" />
      <UnreadSelectionContext
        v-if="currentSelection === 'unread' && hasLoadedContent && currentViewSourceCount !== null"
        :article-count="currentViewUnreadCount"
        :source-count="currentViewSourceCount"
      />
      <Article
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
    <div id="article-load-sentinel" class="article-load-sentinel" aria-hidden="true"></div>
    <div id="no-more" v-if="hasLoadedContent">
      <ArticleEmptyState
        v-if="container.length === 0"
        @clear-filters="$emit('clear-filters')"
        @refresh-feeds="$emit('refresh-feeds')"
        @open-smart-folders="$emit('open-smart-folders')"
      />
      <ArticleEndState
        v-if="showArticleEndState"
        :unread-count="currentViewUnreadCount"
        :show-actions="showArticleEndStateActions"
        @mark-all-read="flushPool"
        @dismiss="dismissArticleEndState"
      />
      <p v-if="currentSelection == 'unread' && isFlushed === true && container.length > 0 && unreadsSinceLastUpdate > 0" class="clickable" v-on:click="this.$emit('forceReload')">{{ unreadsSinceLastUpdate }} new unread {{ unreadsSinceLastUpdate === 1 ? 'article' : 'articles' }} available! <br>Click here to refresh!</p>
    </div>
    <div id="no-more" v-else>
      <ArticleLoadingState />
    </div>
  </div>
</template>

<script>
import Article from "./Article.vue";
import ArticleEmptyState from "./ArticleEmptyState.vue";
import ArticleEndState from "./ArticleEndState.vue";
import ArticleLoadingState from "./ArticleLoadingState.vue";
import DailyBriefingIntro from "./DailyBriefingIntro.vue";
import UnreadSelectionContext from "./UnreadSelectionContext.vue";

export default {
  components: {
    Article,
    ArticleEmptyState,
    ArticleEndState,
    ArticleLoadingState,
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
    'refresh-feeds',
    'open-smart-folders',
    'forceReload'
  ],
  props: {
    articles: {
      type: Array,
      required: true
    },
    pool: {
      type: Set,
      required: true
    },
    container: {
      type: Array,
      required: true
    },
    currentSelection: {
      type: String,
      required: true
    },
    currentViewUnreadCount: {
      type: Number,
      required: true
    },
    currentViewSourceCount: {
      type: Number,
      default: null
    },
    viewMode: {
      type: String,
      required: true
    },
    remainingItems: {
      type: Number,
      required: true
    },
    fetchCount: {
      type: Number,
      required: true
    },
    hasLoadedContent: {
      type: Boolean,
      required: true
    },
    isFlushed: {
      type: Boolean,
      required: true
    },
    distance: {
      type: Number,
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
      isArticleEndStateDismissed: false
    };
  },
  mounted() {
    window.addEventListener('keydown', this.handleMinimalKeydown);
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.handleMinimalKeydown);
  },
  computed: {
    // Returns whether the mobile search dialog is currently open.
    mobileSearchOpen() {
      return this.$store.data.mobileSearchOpen;
    },
    // Returns the number of unread articles received since the last update.
    unreadsSinceLastUpdate() {
      return this.$store.data.unreadsSinceLastUpdate;
    },
    // Returns whether the full article list has loaded every article in the current scope.
    hasReachedArticleListEnd() {
      return this.container.length > 0 && this.distance >= this.container.length;
    },
    // Returns whether this list view should use the modern article end state.
    supportsArticleEndState() {
      return ['full', 'summarized'].includes(this.viewMode);
    },
    // Returns whether the end state should appear for the current list mode.
    showArticleEndState() {
      return this.supportsArticleEndState && this.hasReachedArticleListEnd && !this.isArticleEndStateDismissed;
    },
    // Returns whether the fully loaded current article list still contains unread articles.
    hasUnreadArticlesInCurrentView() {
      return this.articles.some(article => article.status !== 'read');
    },
    // Returns whether the end state should offer the mark-all-read action.
    showArticleEndStateActions() {
      return this.currentSelection === 'unread'
        && !this.isFlushed
        && this.currentViewUnreadCount > 0
        && this.hasUnreadArticlesInCurrentView;
    }
  },
  watch: {
    container() {
      this.isArticleEndStateDismissed = false;
    },
    articles() {
      this.$nextTick(() => this.focusSelectedMinimalArticle({ preventScroll: true }));
    },
    activeMinimalArticleId() {
      this.$nextTick(() => this.focusSelectedMinimalArticle({ preventScroll: true }));
    }
  },
  methods: {
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
    // Returns whether keyboard navigation should ignore the current event target.
    shouldIgnoreKeyboardEvent(event) {
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      const isEditableTarget = ['input', 'textarea', 'select'].includes(tagName)
        || target?.isContentEditable
        || Boolean(target?.closest?.('[contenteditable="true"], [contenteditable=""]'));
      const isInteractiveElement = ['a', 'button'].includes(tagName);

      return Boolean(
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        isEditableTarget ||
        isInteractiveElement
      );
    },
    // Handles compact headline keyboard navigation.
    handleMinimalKeydown(event) {
      if (this.shouldIgnoreKeyboardEvent(event)) return;
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'j', 'k', 'o', 'm', 'r', 's'].includes(event.key)) return;
      if (!this.articles.length) return;

      if (['Enter', 'o'].includes(event.key)) {
        event.preventDefault();
        this.openSelectedArticle();
        return;
      }

      if (['m', 'r'].includes(event.key)) {
        event.preventDefault();
        this.toggleSelectedReadStatus();
        return;
      }

      if (event.key === 's') {
        event.preventDefault();
        this.toggleSelectedFavorite();
        return;
      }

      const currentIndex = this.selectedArticleIndex();
      const isNextKey = ['ArrowDown', 'j'].includes(event.key);
      const fallbackIndex = isNextKey ? 0 : this.articles.length - 1;
      const nextIndex = currentIndex === -1
        ? fallbackIndex
        : isNextKey
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
      const scrollRoot = document.getElementById('home');
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
      const articleLink = selectedComponent?.$el?.querySelector('.article-link');
      articleLink?.click();
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
@media (min-width: 767px) {
  #articles {
    margin-left: -15px;
    margin-right: -23px;
  }
}

#articles {
  padding-top: 58px;
  overflow-x: hidden;
  overflow-y: hidden;
  right: 0;
  left: 0;
}

/* Removes the article offset when the mobile toolbar overlays portrait layouts. */
@media (max-width: 766px) and (orientation: portrait) {
  #main-container #articles {
    padding-top: 0;
  }
}

/* Lets an empty article list fill the space below the mobile toolbar. */
@media (max-width: 766px) {
  #main-container {
    display: flex;
    flex: 1;
    flex-direction: column;
  }
}

#articles.mobile-search-open {
  padding-top: 98px;
}

@media (min-width: 767px) {
  #articles.mobile-search-open {
    padding-top: 38px;
  }
}

.clickable {
  cursor: pointer;
}

:global(:root[data-theme='dark']) {
  #articles {
    color: var(--text-inverted);
    background: var(--dark-page-surface);
    border-color: var(--dark-page-surface);
    border-bottom-color: var(--text-inverted);
  }
}
</style>

<style>
div.infinite-loading-container {
  display: block;
  min-height: 50px;
  padding-top: 20px;
}

#no-more {
  padding-top: 10px;
  text-align: center;
}

@media (orientation: portrait) {
  #no-more {
    padding-top: 0;
    padding-bottom: 0;
  }
}

@media (max-width: 766px) {
  #no-more {
    display: flex;
    flex: 1;
    flex-direction: column;
  }
}

:root[data-theme='dark'] #no-more {
  color: var(--text-inverted);
}

#no-more p {
  margin: 0px;
  vertical-align: middle;
}

.article-load-sentinel {
  height: 1px;
  width: 100%;
}

:root[data-theme='dark'] {
  div.infinite-loading-container {
    color: var(--text-inverted);
    background: var(--dark-page-surface);
    border-color: var(--dark-page-surface);
    border-bottom-color: var(--text-inverted);
  }

  #no-more p {
    color: var(--text-inverted);
  }
}
</style>
