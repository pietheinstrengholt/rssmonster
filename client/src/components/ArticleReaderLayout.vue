<template>
  <div class="readerLayout">
    <aside class="readerArticleList" aria-label="Article list">
      <button
        v-for="article in articles"
        :key="article.id"
        type="button"
        class="readerArticleListItem"
        :class="{ readerArticleListItemSelected: article.id === selectedArticleId }"
        :aria-current="article.id === selectedArticleId ? 'true' : null"
        :ref="element => setArticleItemRef(element, article.id)"
        @click="selectArticle(article.id)"
      >
        <span class="readerArticleListItemContent">
          <span class="readerArticleListItemKicker">
            <span>{{ feedName(article) }}</span>
            <span v-if="publishedLabel(article)">{{ publishedLabel(article) }}</span>
          </span>
          <span class="readerArticleListItemTitle">{{ article.title }}</span>
          <span v-if="articlePreview(article)" class="readerArticleListItemPreview">{{ articlePreview(article) }}</span>
          <span class="readerArticleListItemBadges">
            <span v-if="article.starInd === 1" class="readerArticleListBadge readerArticleListBadgeFavorite">Favorite</span>
            <span v-if="article.hotInd === 1" class="readerArticleListBadge readerArticleListBadgeHot">Hot</span>
            <span v-if="similarCount(article)" class="readerArticleListBadge">{{ similarCount(article) }} similar</span>
          </span>
        </span>
        <img v-if="thumbnailUrl(article)" class="readerArticleListThumbnail" :src="thumbnailUrl(article)" alt="" loading="lazy" />
      </button>

      <div id="article-load-sentinel" class="article-load-sentinel" aria-hidden="true"></div>

      <div id="no-more" v-if="hasLoadedContent">
        <p v-if="container.length === 0" id="no-results">No posts found!</p>
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
        @update-star="$emit('update-star', $event)"
        @update-clicked="$emit('update-clicked', $event)"
        @toggle-read-status="$emit('toggle-read-status', $event)"
        @cluster-articles-loaded="$emit('cluster-articles-loaded', $event)"
        @cluster-articles-collapsed="$emit('cluster-articles-collapsed', $event)"
        @article-not-interested="$emit('article-not-interested', $event)"
      />
    </section>
  </div>
</template>

<script>
import Article from "./Article.vue";
import ArticleEndState from "./ArticleEndState.vue";
import { formatRelativeDate } from '../utils/date';

const PREVIEW_LENGTH = 150;

export default {
  components: {
    Article,
    ArticleEndState
  },
  emits: [
    'update-star',
    'update-clicked',
    'toggle-read-status',
    'cluster-articles-loaded',
    'cluster-articles-collapsed',
    'article-not-interested',
    'mark-previous-article-read',
    'flush-pool',
    'forceReload'
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
      isReaderEndStateDismissed: false
    };
  },
  mounted() {
    window.addEventListener('keydown', this.handleReaderKeydown);
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.handleReaderKeydown);
  },
  computed: {
    // Returns the article currently shown in the reader panel.
    selectedArticle() {
      return this.articles.find(article => article.id === this.selectedArticleId) || null;
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
    // Returns whether the end state should offer the mark-all-read action.
    showReaderEndStateActions() {
      return this.currentSelection === 'unread' && !this.isFlushed && this.currentViewUnreadCount > 0;
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
    }
  },
  methods: {
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
      if (this.shouldIgnoreKeyboardEvent(event)) return;
      if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;

      const currentIndex = this.articles.findIndex(article => article.id === this.selectedArticleId);
      if (currentIndex === -1) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.selectArticleByIndex(Math.min(currentIndex + 1, this.articles.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.selectArticleByIndex(Math.max(currentIndex - 1, 0));
      } else {
        event.preventDefault();
        this.openSelectedArticle();
      }
    },
    // Opens the selected article through the existing article link behavior.
    openSelectedArticle() {
      const articleLink = this.$refs.selectedArticleComponent?.$el?.querySelector('.article-link');
      articleLink?.click();
    },
    // Returns the feed label for a row in the reader article list.
    feedName(article) {
      return article.author || article.feed?.feedName || 'Unknown feed';
    },
    // Returns the publication label for a row in the reader article list.
    publishedLabel(article) {
      return formatRelativeDate(article.firstSeen || article.publishedAt || article.published);
    },
    // Returns a short plain-text preview for a row in the reader article list.
    articlePreview(article) {
      const source = article.contentSummary || article.summary || article.contentSummaryBullets?.join(' ') || article.contentOriginal || '';
      const text = String(source).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
      return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH).trim()}...` : text;
    },
    // Returns an image thumbnail URL for a row in the reader article list.
    thumbnailUrl(article) {
      return article.imageUrl || article.image || article.enclosureUrl || '';
    },
    // Returns the related article count when available.
    similarCount(article) {
      return article.clusterCountTotal > 1 ? article.clusterCountTotal - 1 : 0;
    }
  }
}
</script>

<style scoped>
.readerLayout {
  display: grid;
  grid-template-columns: minmax(280px, 34%) minmax(0, 1fr);
  min-height: 100vh;
  padding-top: 58px;
}

.readerArticleList {
  border-right: 1px solid var(--border-subtle);
  max-height: calc(100vh - 58px);
  overflow-y: auto;
  padding: 10px 10px 24px;
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
  margin-bottom: 5px;
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
  height: 56px;
  object-fit: cover;
  width: 72px;
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
  border-color: var(--border-color);
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
