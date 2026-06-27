<template>
  <div class="readerLayout">
    <aside class="readerArticleList" aria-label="Article list">
      <button
        v-for="article in articles"
        :key="article.id"
        type="button"
        class="readerArticleListItem"
        :class="{ readerArticleListItemSelected: article.id === selectedArticleId }"
        @click="selectArticle(article.id)"
      >
        <span class="readerArticleListItemTitle">{{ article.title }}</span>
        <span class="readerArticleListItemMeta">{{ articleMeta(article) }}</span>
      </button>

      <div id="article-load-sentinel" class="article-load-sentinel" aria-hidden="true"></div>

      <div id="no-more" v-if="hasLoadedContent">
        <p v-if="container.length === 0" id="no-results">No posts found!</p>
        <p v-if="currentSelection !== 'unread' && container.length !== 0 && remainingItems < fetchCount">You reached the bottom!</p>
        <button v-if="currentSelection === 'unread' && container.length !== 0 && isFlushed === false && distance >= container.length" id="mark-all-read" type="button" class="mark-all-read" @click="$emit('flush-pool')">Click to mark all articles as read.</button>
        <p v-if="currentSelection == 'unread' && isFlushed === true && container.length > 0 && unreadsSinceLastUpdate === 0">All items are marked as read.</p>
        <p v-if="currentSelection == 'unread' && isFlushed === true && container.length > 0 && unreadsSinceLastUpdate > 0" class="clickable" @click="$emit('forceReload')">{{ unreadsSinceLastUpdate }} new unread {{ unreadsSinceLastUpdate === 1 ? 'article' : 'articles' }} available! <br>Click here to refresh!</p>
      </div>
      <div id="no-more" v-else>
        <p>Loading <BootstrapIcon icon="arrow-repeat" variant="dark" animation="spin"/></p>
      </div>
    </aside>

    <section class="readerArticlePanel" aria-label="Reader">
      <Article
        v-if="selectedArticle"
        v-bind="selectedArticle"
        :key="selectedArticle.id"
        @update-star="$emit('update-star', $event)"
        @update-clicked="$emit('update-clicked', $event)"
        @cluster-articles-loaded="$emit('cluster-articles-loaded', $event)"
        @cluster-articles-collapsed="$emit('cluster-articles-collapsed', $event)"
        @article-not-interested="$emit('article-not-interested', $event)"
      />
    </section>
  </div>
</template>

<script>
import Article from "./Article.vue";

export default {
  components: {
    Article
  },
  emits: [
    'update-star',
    'update-clicked',
    'cluster-articles-loaded',
    'cluster-articles-collapsed',
    'article-not-interested',
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
      selectedArticleId: null
    };
  },
  computed: {
    // Returns the article currently shown in the reader panel.
    selectedArticle() {
      return this.articles.find(article => article.id === this.selectedArticleId) || null;
    },
    // Returns the number of unread articles received since the last update.
    unreadsSinceLastUpdate() {
      return this.$store.data.unreadsSinceLastUpdate;
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
    }
  },
  methods: {
    // Selects the article displayed in the reader panel.
    selectArticle(articleId) {
      this.selectedArticleId = articleId;
    },
    // Returns compact metadata for a row in the reader article list.
    articleMeta(article) {
      return [article.author || article.feed?.feedName, article.feed?.category?.name].filter(Boolean).join(' · ');
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
  background: var(--bg-secondary);
  border: 1px solid var(--color-transparent);
  border-radius: 8px;
  color: var(--text-primary);
  cursor: pointer;
  display: block;
  margin-bottom: 8px;
  padding: 10px 12px;
  text-align: left;
  width: 100%;
}

.readerArticleListItemSelected {
  background: var(--color-primary-soft);
  border-color: var(--color-primary);
  color: var(--color-primary-strong);
}

.readerArticleListItemTitle {
  display: block;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.35;
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

.mark-all-read {
  padding: 0;
  font: inherit;
  color: inherit;
  background: none;
  border: 0;
  text-decoration: underline;
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
  background: var(--bg-option);
  color: var(--text-primary);
}

:global(:root[data-theme='dark']) .readerArticleListItemSelected {
  background: var(--sidebar-selected-background-dark);
  border-color: var(--color-primary-border-dark);
  color: var(--sidebar-selected-text-dark);
}
</style>
