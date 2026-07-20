<template>
  <DailyBriefingIntro
    v-if="currentSelection === 'briefing' && hasLoadedContent && container.length === 0"
    reader-mode
  />
  <ArticleEmptyState
    v-if="hasLoadedContent && container.length === 0"
    class="readerEmptyState"
    @clear-filters="$emit('clear-filters')"
    @refresh-feeds="$emit('refresh-feeds')"
    @open-smart-folders="$emit('open-smart-folders')"
  />

  <div v-else class="readerLayout">
    <aside
      ref="articleListScrollRef"
      class="readerArticleList"
      aria-label="Article list"
      @scroll="handleArticleListScroll"
    >
      <DailyBriefingIntro v-if="currentSelection === 'briefing'" reader-mode />
      <div class="article-list-bulk-header" @click.stop>
        <div class="article-list-bulk-summary">
          <div class="article-list-bulk-title">
            <i :class="selectionIcon" aria-hidden="true"></i>
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
              @click="$store.data.setCurrentSelection({ tag })"
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
            <i class="bi bi-three-dots" aria-hidden="true"></i>
          </button>

          <div v-if="isBulkMenuOpen" class="bulk-action-menu" :style="bulkMenuStyle" role="menu">
            <div class="bulk-action-menu-section">
              <button type="button" class="bulk-action-menu-item" role="menuitem" @click="runBulkAction('mark-visible-read')">
                <i class="bi bi-check2-circle" aria-hidden="true"></i>
                <span>Mark all visible as read</span>
              </button>
              <button type="button" class="bulk-action-menu-item" role="menuitem" :disabled="!selectedArticle" @click="runBulkAction('mark-older-read')">
                <i class="bi bi-clock-history" aria-hidden="true"></i>
                <span>Mark older than current article as read</span>
              </button>
              <button type="button" class="bulk-action-menu-item" role="menuitem" :disabled="selectedArticleIndex <= 0" @click="runBulkAction('mark-above-read')">
                <i class="bi bi-arrow-up-short" aria-hidden="true"></i>
                <span>Mark articles above as read</span>
              </button>
              <button type="button" class="bulk-action-menu-item" role="menuitem" :disabled="selectedArticleIndex === -1 || selectedArticleIndex >= articles.length - 1" @click="runBulkAction('mark-below-read')">
                <i class="bi bi-arrow-down-short" aria-hidden="true"></i>
                <span>Mark articles below as read</span>
              </button>
            </div>
            <div class="bulk-action-menu-section">
              <button type="button" class="bulk-action-menu-item" role="menuitem" @click="runBulkAction('favorite-visible')">
                <i class="bi bi-bookmark" aria-hidden="true"></i>
                <span>Favorite all visible</span>
              </button>
              <button type="button" class="bulk-action-menu-item" role="menuitem" @click="runBulkAction('mark-visible-clicked')">
                <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>
                <span>Mark all visible as clicked</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        v-for="article in articles"
        :key="article.id"
        class="readerArticleListItem"
        :class="{ readerArticleListItemSelected: article.id === selectedArticleId }"
        role="button"
        tabindex="0"
        :aria-current="article.id === selectedArticleId ? 'true' : null"
        :ref="element => setArticleItemRef(element, article.id)"
        @click="selectArticle(article.id)"
        @keydown.space.stop.prevent="selectArticle(article.id)"
      >
        <span class="readerArticleListItemContent">
          <span class="readerArticleListItemTitle">{{ article.title }}</span>
          <span v-if="articlePreview(article)" class="readerArticleListItemPreview">{{ articlePreview(article) }}</span>
          <span class="readerArticleListItemKicker">
            <span>{{ feedName(article) }}</span>
            <span v-if="publishedLabel(article)">{{ publishedLabel(article) }}</span>
          </span>
          <span v-if="!hasArticlePreview(article)" class="article-preview-empty">
            <span class="article-preview-empty__message">No preview available</span>
            <span aria-hidden="true" class="article-preview-empty__separator">-</span>
            <a
              :href="article.url"
              class="article-preview-empty__link"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open original article in a new tab"
              @click.stop="trackOriginalArticleClick(article)"
            >
              <span>Open original article</span>
              <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i>
            </a>
          </span>
          <span class="readerArticleListItemBadges">
            <span v-if="article.favoriteInd === 1" class="readerArticleListBadge readerArticleListBadgeFavorite">Favorite</span>
            <span v-if="article.hotInd === 1" class="readerArticleListBadge readerArticleListBadgeHot">Hot</span>
            <span v-if="similarCount(article)" class="readerArticleListBadge">{{ similarCount(article) }} similar</span>
          </span>
        </span>
        <img v-if="thumbnailUrl(article)" class="readerArticleListThumbnail" :src="thumbnailUrl(article)" alt="" loading="lazy" />
      </div>

      <div id="article-load-sentinel" class="article-load-sentinel" aria-hidden="true"></div>

      <div id="no-more" v-if="hasLoadedContent">
        <ArticleEndState
          v-if="showReaderEndState"
          :unread-count="currentViewUnreadCount"
          :show-actions="showReaderEndStateActions"
          @mark-all-read="$emit('flush-pool')"
          @dismiss="dismissReaderEndState"
        />
        <p v-if="currentSelection == 'unread' && isFlushed === true && container.length > 0 && unreadsSinceLastUpdate > 0" class="clickable" @click="$emit('forceReload')">{{ unreadsSinceLastUpdate }} new unread {{ unreadsSinceLastUpdate === 1 ? 'article' : 'articles' }} available! <br>Click here to refresh!</p>
      </div>
      <div id="no-more" v-else>
        <p>Loading <BootstrapIcon icon="arrow-repeat" variant="dark" animation="spin"/></p>
      </div>
    </aside>

    <section class="readerArticlePanel" aria-label="Reader">
      <Article
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
    </section>
  </div>
</template>

<script>
import Article from "./Article.vue";
import ArticleEmptyState from "./ArticleEmptyState.vue";
import ArticleEndState from "./ArticleEndState.vue";
import DailyBriefingIntro from "./DailyBriefingIntro.vue";
import { formatRelativeDate } from '../utils/date';
import { formatTagName } from '../utils/tags';
import { hasRenderableContent, usableHttpUrl } from '../utils/content';
import { markClicked as markArticleClickedAPI } from '../api/articles';

const PREVIEW_LENGTH = 150;

export default {
  components: {
    Article,
    ArticleEmptyState,
    ArticleEndState,
    DailyBriefingIntro
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
    'refresh-feeds',
    'open-smart-folders',
    'forceReload',
    'bulk-action'
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
    }
  },
  data() {
    return {
      articleItemRefs: {},
      selectedArticleId: null,
      isReaderEndStateDismissed: false,
      isBulkMenuOpen: false,
      bulkMenuStyle: {},
      articleListScrollTimeout: null
    };
  },
  mounted() {
    window.addEventListener('keydown', this.handleReaderKeydown);
    window.addEventListener('resize', this.updateBulkMenuPosition);
    window.addEventListener('scroll', this.updateBulkMenuPosition, true);
    document.addEventListener('click', this.closeBulkMenu);
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.handleReaderKeydown);
    window.removeEventListener('resize', this.updateBulkMenuPosition);
    window.removeEventListener('scroll', this.updateBulkMenuPosition, true);
    document.removeEventListener('click', this.closeBulkMenu);

    if (this.articleListScrollTimeout) {
      clearTimeout(this.articleListScrollTimeout);
    }
  },
  computed: {
    // Returns the article currently shown in the reader panel.
    selectedArticle() {
      return this.articles.find(article => article.id === this.selectedArticleId) || null;
    },
    // Returns the index of the article currently shown in the reader panel.
    selectedArticleIndex() {
      return this.articles.findIndex(article => article.id === this.selectedArticleId);
    },
    // Returns the icon class that matches the active reader collection.
    selectionIcon() {
      const selection = this.$store.data.currentSelection;
      if (selection.smartFolderId !== null) return 'bi bi-folder-fill';
      if (selection.tag) return 'bi bi-tag-fill';
      if (selection.status === 'briefing') return 'bi bi-sunrise-fill';
      if (selection.search) return 'bi bi-search';
      if (selection.feedId !== '%') return 'bi bi-rss-fill';
      if (selection.categoryId !== '%') return 'bi bi-folder-fill';

      const icons = {
        unread: 'record-circle-fill',
        read: 'circle-fill',
        favorite: 'bookmark-fill',
        hot: 'fire',
        clicked: 'arrow-up-right-square-fill'
      };

      return `bi bi-${icons[selection.status] || 'collection-fill'}`;
    },
    // Returns the display name for the active reader collection.
    selectionTitle() {
      const selection = this.$store.data.currentSelection;

      if (selection.smartFolderId !== null) {
        const smartFolder = this.$store.data.smartFolders.find(folder => folder.id === selection.smartFolderId);
        if (smartFolder?.name) return smartFolder.name;
      }

      if (selection.tag) return this.formatTagName(selection.tag);
      if (selection.status === 'briefing') return 'Daily briefing';
      if (selection.search) return `Search: ${selection.search}`;

      const categoryId = Number(selection.categoryId);
      const feedId = Number(selection.feedId);
      const category = Number.isFinite(categoryId)
        ? this.$store.data.categories.find(item => item.id === categoryId)
        : null;

      if (Number.isFinite(feedId) && category) {
        const feed = category.feeds?.find(item => item.id === feedId);
        if (feed?.feedName) return feed.feedName;
      }

      if (category?.name) return category.name;

      const labels = {
        unread: 'Unread',
        read: 'Read',
        favorite: 'Favorites',
        hot: 'Hot',
        clicked: 'Clicked'
      };

      return labels[selection.status] || 'All articles';
    },
    // Returns the formatted unread count for the active reader collection.
    formattedUnreadCount() {
      return new Intl.NumberFormat().format(this.currentViewUnreadCount);
    },
    // Returns the distinct event count in the loaded reader list.
    eventCount() {
      const eventIds = new Set();
      for (const article of this.articles) {
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

      return new Set(this.articles.map(article => article.feedId || article.feed?.id).filter(Boolean)).size;
    },
    // Returns the most frequent tags in the loaded reader list.
    topVisibleTags() {
      const counts = new Map();
      for (const article of this.articles) {
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
      return this.$store.data.unreadsSinceLastUpdate;
    },
    // Returns whether the reader list has loaded every article in the current scope.
    hasReachedArticleListEnd() {
      return this.container.length > 0 && this.distance >= this.container.length;
    },
    // Returns whether the end state should appear below the final reader list item.
    showReaderEndState() {
      return this.hasReachedArticleListEnd && !this.isReaderEndStateDismissed;
    },
    // Returns whether the fully loaded reader list still contains unread articles.
    hasUnreadArticlesInCurrentView() {
      return this.articles.some(article => article.status !== 'read');
    },
    // Returns whether the end state should offer the mark-all-read action.
    showReaderEndStateActions() {
      return this.currentSelection === 'unread'
        && !this.isFlushed
        && this.currentViewUnreadCount > 0
        && this.hasUnreadArticlesInCurrentView;
    }
  },
  watch: {
    articles: {
      immediate: true,
      handler(articles) {
        if (!articles.length) {
          this.selectedArticleId = null;
          return;
        }

        if (!articles.some(article => article.id === this.selectedArticleId)) {
          this.selectedArticleId = articles[0].id;
        }
      }
    },
    container() {
      this.isReaderEndStateDismissed = false;
      this.closeBulkMenu();
    }
  },
  methods: {
    // Shows the article-list scrollbar while the user is actively scrolling.
    handleArticleListScroll() {
      const articleList = this.$refs.articleListScrollRef;

      if (!articleList) return;

      articleList.classList.add('is-scrolling');

      if (this.articleListScrollTimeout) {
        clearTimeout(this.articleListScrollTimeout);
      }

      this.articleListScrollTimeout = setTimeout(() => {
        articleList.classList.remove('is-scrolling');
        this.articleListScrollTimeout = null;
      }, 1000);
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
    // Selects the article displayed in the reader panel.
    selectArticle(articleId) {
      if (articleId === this.selectedArticleId) return;
      if (this.selectedArticleId !== null) {
        this.$emit('mark-previous-article-read', this.selectedArticleId);
      }
      this.selectedArticleId = articleId;
    },
    // Selects an article by index when keyboard navigation moves through the list.
    selectArticleByIndex(index) {
      if (index < 0 || index >= this.articles.length) return;
      const article = this.articles[index];
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
    // Returns whether keyboard navigation should ignore the current event target.
    shouldIgnoreKeyboardEvent(event) {
      const target = event.target;
      const tagName = target?.tagName?.toLowerCase();
      const isReaderListItem = target?.classList?.contains('readerArticleListItem');
      const isInteractiveElement = ['a', 'button', 'input', 'textarea', 'select'].includes(tagName);
      return Boolean(
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        target?.isContentEditable ||
        (isInteractiveElement && !isReaderListItem)
      );
    },
    // Handles reader-mode keyboard navigation.
    handleReaderKeydown(event) {
      if (event.key === 'Escape' && this.isBulkMenuOpen) {
        this.closeBulkMenu();
        return;
      }

      if (this.shouldIgnoreKeyboardEvent(event)) return;
      if (!['ArrowDown', 'ArrowUp', 'Enter', 'j', 'k', 'o', 'm', 'r', 's'].includes(event.key)) return;

      const currentIndex = this.articles.findIndex(article => article.id === this.selectedArticleId);
      if (currentIndex === -1) return;

      if (['ArrowDown', 'j'].includes(event.key)) {
        event.preventDefault();
        this.selectArticleByIndex(Math.min(currentIndex + 1, this.articles.length - 1));
      } else if (['ArrowUp', 'k'].includes(event.key)) {
        event.preventDefault();
        this.selectArticleByIndex(Math.max(currentIndex - 1, 0));
      } else if (['Enter', 'o'].includes(event.key)) {
        event.preventDefault();
        this.openSelectedArticle();
      } else if (['m', 'r'].includes(event.key)) {
        event.preventDefault();
        this.toggleSelectedReadStatus();
      } else {
        event.preventDefault();
        this.toggleSelectedFavorite();
      }
    },
    // Opens the selected article through the existing article link behavior.
    openSelectedArticle() {
      const articleLink = this.$refs.selectedArticleComponent?.$el?.querySelector('.article-link');
      articleLink?.click();
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
      const source = article.contentSummary || article.summary || article.contentSummaryBullets?.join(' ') || article.description || article.contentHtml || '';
      if (!hasRenderableContent(source)) return '';
      const text = String(source).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
      return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH).trim()}...` : text;
    },
    // Returns whether the list item has meaningful body text, a summary, or an image.
    hasArticlePreview(article) {
      const contentCandidates = [
        article.contentHtml,
        article.description,
        article.contentSummary,
        article.summary,
        article.contentSummaryBullets?.join(' ')
      ];

      return contentCandidates.some(hasRenderableContent) || Boolean(this.thumbnailUrl(article));
    },
    // Returns an image thumbnail URL for a row in the reader article list.
    thumbnailUrl(article) {
      return [article.imageUrl, article.image, article.enclosureUrl]
        .map(usableHttpUrl)
        .find(Boolean) || '';
    },
    // Tracks an original-article link through the same clicked-article behavior as the reader panel.
    trackOriginalArticleClick(article) {
      markArticleClickedAPI(article.id)
      .finally(() => this.$emit('update-clicked', { id: article.id, clickedAmount: 1 }));
    },
    // Returns the related article count when available.
    similarCount(article) {
      return article.eventArticleCountTotal > 1 ? article.eventArticleCountTotal - 1 : 0;
    }
  }
}
</script>

<style scoped>
.readerLayout {
  display: grid;
  grid-template-columns: minmax(340px, 38%) minmax(0, 1fr);
  min-height: 100vh;
  padding-top: 58px;
}

.readerArticleList {
  --article-list-scrollbar-thumb: var(--scrollbar-thumb-strong);
  border-right: 1px solid var(--border-subtle);
  max-height: calc(100vh - 58px);
  overflow-y: auto;
  padding: 0 10px 24px;
  scrollbar-color: var(--color-transparent) var(--color-transparent);
  scrollbar-width: thin;
  transition: scrollbar-color 0.2s ease;
}

.readerArticleList::-webkit-scrollbar {
  height: 6px;
  width: 6px;
}

.readerArticleList::-webkit-scrollbar-track {
  background: var(--color-transparent);
}

.readerArticleList::-webkit-scrollbar-thumb {
  background-color: var(--color-transparent);
  transition: background-color 0.2s ease;
}

.readerArticleList.is-scrolling {
  scrollbar-color: var(--article-list-scrollbar-thumb) var(--color-transparent);
}

.readerArticleList.is-scrolling::-webkit-scrollbar-thumb {
  background-color: var(--article-list-scrollbar-thumb);
}

.article-list-bulk-header {
  background: var(--bg-primary);
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

.article-list-bulk-title i {
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
  background: transparent;
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
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.14);
  max-width: calc(100vw - 24px);
  min-width: 280px;
  padding: 8px;
  position: fixed;
  z-index: 1000;
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
  background: transparent;
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

.bulk-action-menu-item i {
  color: var(--text-secondary);
  flex: 0 0 18px;
  width: 18px;
}

.readerArticleListItem {
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
  text-align: left;
  transition: background-color 0.15s ease, border-color 0.15s ease;
  width: 100%;
}

.readerArticleListItem:hover {
  background: var(--reader-list-item-hover-background);
  border-color: var(--reader-list-item-hover-border);
}

.readerArticleListItem:focus,
.readerArticleListItem:focus-visible {
  box-shadow: none;
  outline: none;
}

.readerArticleListItemSelected {
  background: var(--reader-list-item-selected-background);
  border-color: var(--reader-list-item-selected-border);
  border-left: 3px solid var(--reader-list-item-selected-accent);
  color: var(--reader-list-item-selected-title);
}

.readerArticleListItemSelected:hover {
  background: var(--reader-list-selected-hover-background);
  border-color: var(--reader-list-item-selected-hover-border);
  border-left: 3px solid var(--reader-list-item-selected-accent);
  color: var(--reader-list-item-selected-title);
}

.readerArticleListItemContent {
  min-width: 0;
}

.readerArticleListItemKicker {
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

.readerArticleListItemTitle {
  color: var(--reader-list-item-title);
  display: block;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
}

.readerArticleListItemSelected .readerArticleListItemTitle {
  color: var(--reader-list-item-selected-title);
}

.readerArticleListItemPreview {
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
  color: #6B7280;
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
  color: #6B7280;
  display: inline-flex;
  font-weight: 500;
  gap: 0.25rem;
  text-decoration: none;
}

.article-preview-empty__link:hover {
  color: #2563EB;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.article-preview-empty__link:focus-visible {
  border-radius: 0.2rem;
  color: #2563EB;
  outline: 2px solid #2563EB;
  outline-offset: 2px;
}

.article-preview-empty__link .bi {
  flex: 0 0 auto;
  font-size: 0.75rem;
}

.readerArticleListItemBadges {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

.readerArticleListBadge {
  background: var(--badge-tag-bg);
  border-radius: 999px;
  color: var(--badge-tag-text);
  display: inline-flex;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  padding: 4px 7px;
}

.readerArticleListBadgeFavorite {
  background: var(--badge-quality-bg);
  color: var(--badge-quality-text);
}

.readerArticleListBadgeHot {
  background: var(--badge-ad-bg);
  color: var(--badge-ad-text);
}

.readerArticleListThumbnail {
  align-self: start;
  background: var(--bg-muted);
  border-radius: 6px;
  display: block;
  height: 72px;
  object-fit: cover;
  width: 96px;
}

.readerArticleListItemMeta {
  color: var(--text-muted);
  display: block;
  font-size: 12px;
  line-height: 1.35;
  margin-top: 4px;
}

.readerArticlePanel {
  min-width: 0;
  overflow: visible;
}

.clickable {
  cursor: pointer;
}

.article-load-sentinel {
  height: 1px;
  width: 100%;
}

:global(:root[data-theme='dark']) .readerArticleList {
  --article-list-scrollbar-thumb: var(--scrollbar-thumb-strong-dark);
  border-color: var(--border-color);
}

:global(:root[data-theme='dark']) .article-list-bulk-header {
  background: var(--bg-modal);
  border-color: var(--border-color);
}

:global(:root[data-theme='dark']) .bulk-action-menu {
  background: var(--bg-modal);
  border-color: var(--border-color);
  box-shadow: 0 18px 40px rgba(0, 0, 0, 0.36);
}

:global(:root[data-theme='dark']) .bulk-action-menu-section {
  border-color: var(--border-color);
}

:global(:root[data-theme='dark']) .article-list-bulk-tag {
  background-color: var(--article-tag-background-dark);
  color: var(--article-tag-text-dark);
}

:global(:root[data-theme='dark']) .readerArticleListItem {
  background: var(--reader-list-item-background);
  border-color: var(--reader-list-item-border);
  color: var(--reader-list-item-title);
}

:global(:root[data-theme='dark']) .readerArticleListItem:hover {
  background: var(--reader-list-item-hover-background);
  border-color: var(--reader-list-item-hover-border);
  color: var(--reader-list-item-title);
}

:global(:root[data-theme='dark']) .readerArticleListItem .readerArticleListItemTitle {
  color: var(--reader-list-item-title);
}

:global(:root[data-theme='dark']) .readerArticleListItem .readerArticleListItemKicker {
  color: var(--reader-list-item-meta);
}

:global(:root[data-theme='dark']) .readerArticleListItem .readerArticleListItemPreview {
  color: var(--reader-list-item-preview);
}

:global(:root[data-theme='dark']) .article-preview-empty,
:global(:root[data-theme='dark']) .article-preview-empty__link {
  color: #9CA3AF;
}

:global(:root[data-theme='dark']) .article-preview-empty__link:hover,
:global(:root[data-theme='dark']) .article-preview-empty__link:focus-visible {
  color: #60A5FA;
  outline-color: #60A5FA;
}

:global(:root[data-theme='dark']) .readerArticleListItemSelected {
  background: var(--reader-list-item-selected-background);
  border-color: var(--reader-list-item-selected-border);
  border-left: 3px solid var(--reader-list-item-selected-accent);
  color: var(--reader-list-item-selected-title);
}

:global(:root[data-theme='dark']) .readerArticleListItemSelected:hover {
  background: var(--reader-list-selected-hover-background);
  border-color: var(--reader-list-item-selected-hover-border);
  border-left: 3px solid var(--reader-list-item-selected-accent);
  color: var(--reader-list-item-selected-title);
}

:global(:root[data-theme='dark']) .readerArticleListItemSelected .readerArticleListItemTitle,
:global(:root[data-theme='dark']) .readerArticleListItemSelected:hover .readerArticleListItemTitle {
  color: var(--reader-list-item-selected-title);
}

:global(:root[data-theme='dark']) .readerArticleListItemSelected .readerArticleListItemKicker {
  color: var(--reader-list-item-selected-meta);
}

:global(:root[data-theme='dark']) .readerArticleListItemSelected .readerArticleListItemPreview {
  color: var(--reader-list-item-selected-preview);
}

:global(:root[data-theme='dark']) .readerArticleListItemSelected:hover .readerArticleListItemKicker {
  color: var(--reader-list-item-selected-hover-meta);
}

:global(:root[data-theme='dark']) .readerArticleListItemSelected:hover .readerArticleListItemPreview {
  color: var(--reader-list-item-selected-hover-preview);
}

:global(:root[data-theme='dark']) .readerArticleListThumbnail {
  background: var(--bg-control);
}

</style>
