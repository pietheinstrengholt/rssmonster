<template>
  <div id="main-container">
    <div id="articles" :class="{ 'mobile-search-open': mobileSearchOpen }">
      <Article
        v-for="article in articles"
        v-bind="article"
        :key="article.id"
        :isMinimalContentOpen="String(article.id) === String(activeMinimalArticleId)"
        @update-star="$emit('update-star', $event)"
        @update-clicked="$emit('update-clicked', $event)"
        @minimal-article-opened="$emit('minimal-article-opened', $event)"
        @minimal-article-closed="$emit('minimal-article-closed', $event)"
        @toggle-minimal-read-status="$emit('toggle-minimal-read-status', $event)"
        @cluster-articles-loaded="$emit('cluster-articles-loaded', $event)"
        @cluster-articles-collapsed="$emit('cluster-articles-collapsed', $event)"
        @article-not-interested="$emit('article-not-interested', $event)"
      />
    </div>
    <div id="article-load-sentinel" class="article-load-sentinel" aria-hidden="true"></div>
    <div id="no-more" v-if="hasLoadedContent">
      <p v-if="container.length === 0" id="no-results">No posts found!</p>
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
      <p>Loading <BootstrapIcon icon="arrow-repeat" variant="dark" animation="spin"/></p>
    </div>
  </div>
</template>

<script>
import Article from "./Article.vue";
import ArticleEndState from "./ArticleEndState.vue";

export default {
  components: {
    Article,
    ArticleEndState
  },
  emits: [
    'update-star',
    'update-clicked',
    'minimal-article-opened',
    'minimal-article-closed',
    'toggle-minimal-read-status',
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
      isArticleEndStateDismissed: false
    };
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
    // Returns whether the end state should offer the mark-all-read action.
    showArticleEndStateActions() {
      return this.currentSelection === 'unread' && !this.isFlushed && this.currentViewUnreadCount > 0;
    }
  },
  watch: {
    container() {
      this.isArticleEndStateDismissed = false;
    }
  },
  methods: {
    // Hides the article end state until the current article session changes.
    dismissArticleEndState() {
      this.isArticleEndStateDismissed = true;
    },
    // Requests that the parent marks the remaining unread articles as read.
    flushPool() {
      this.$emit('flush-pool');
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
  padding-bottom: 30px;
  text-align: center;
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
