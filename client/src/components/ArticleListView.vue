<template>
  <div id="main-container">
    <div id="articles" :style="articlesStyle">
      <Article
        v-for="article in articles"
        v-bind="article"
        :key="article.id"
        @update-star="$emit('update-star', $event)"
        @update-clicked="$emit('update-clicked', $event)"
        @cluster-articles-loaded="$emit('cluster-articles-loaded', $event)"
        @cluster-articles-collapsed="$emit('cluster-articles-collapsed', $event)"
        @article-not-interested="$emit('article-not-interested', $event)"
      />
    </div>
    <div id="article-load-sentinel" class="article-load-sentinel" aria-hidden="true"></div>
    <div id="no-more" v-if="hasLoadedContent">
      <p v-if="container.length === 0" id="no-results">No posts found!</p>
      <p v-if="currentSelection !== 'unread' && container.length !== 0 && remainingItems < fetchCount">You reached the bottom!</p>
      <p v-if="currentSelection == 'unread' && container.length != 0 && isFlushed === false && distance > container.length" v-on:click="flushPool()">You reached the bottom! <br>Click here to mark all remaining items as read!</p>
      <p v-if="currentSelection == 'unread' && isFlushed === true && container.length > 0 && unreadsSinceLastUpdate === 0">All items are marked as read.</p>
      <p v-if="currentSelection == 'unread' && isFlushed === true && container.length > 0 && unreadsSinceLastUpdate > 0" class="clickable" v-on:click="this.$emit('forceReload')">{{ unreadsSinceLastUpdate }} new unread {{ unreadsSinceLastUpdate === 1 ? 'article' : 'articles' }} available! <br>Click here to refresh!</p>
    </div>
    <div id="no-more" v-else>
      <p>Loading <BootstrapIcon icon="arrow-repeat" variant="dark" animation="spin"/></p>
    </div>
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
  computed: {
    unreadsSinceLastUpdate() {
      return this.$store.data.unreadsSinceLastUpdate;
    },
    articlesStyle() {
      // Only apply extra padding in portrait mode (max-width: 766px)
      if (this.$store.data.mobileSearchOpen && window.innerWidth < 767) {
        return { paddingTop: '98px' }; // 38px default + 60px for search dialog
      }
      return {};
    }
  },
  methods: {
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
    margin-right: -12px;
  }
}

#articles {
  padding-top: 38px;
  overflow-x: hidden;
  overflow-y: hidden;
  right: 0;
  left: 0;
}

.clickable {
  cursor: pointer;
}

@media (prefers-color-scheme: dark) {
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
  padding-top: 30px;
  padding-bottom: 30px;
  text-align: center;
}

#no-more p {
  margin: 0px;
  vertical-align: middle;
}

.article-load-sentinel {
  height: 1px;
  width: 100%;
}

@media (prefers-color-scheme: dark) {
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
