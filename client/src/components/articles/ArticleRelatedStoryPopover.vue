<template>
  <ArticleExplanationPopover
    ref="popover"
    :root-class="rootClass"
    :panel-class="panelClass"
    :trigger-class="triggerClass"
    :aria-label="ariaLabel"
    :dialog-title="dialogTitle"
    :summary="summary"
    @open="loadArticles"
  >
    <template #trigger><slot name="trigger"></slot></template>

    <template #content>
      <div v-if="loading" class="related-story-state" role="status">Loading related articles…</div>
      <div v-else-if="error" class="related-story-state related-story-state--error" role="alert">
        <span>{{ errorMessage }}</span>
        <button type="button" class="app-button app-button--outline-secondary app-button--compact" @click="loadArticles">Retry</button>
      </div>
      <p v-else-if="!articles.length" class="related-story-state">{{ emptyMessage }}</p>
      <ul v-else class="related-story-list">
        <li v-for="article in articles" :key="article.id">
          <span class="related-story-source-icon" aria-hidden="true">
            <img v-if="article.feed?.favicon" :src="article.feed.favicon" alt="" />
            <BootstrapIcon v-else icon="rss-fill" />
          </span>
          <span class="related-story-details">
            <span class="related-story-feed">{{ article.feed?.name || 'Unknown feed' }}</span>
            <a
              v-if="safeUrl(article.url)"
              :href="safeUrl(article.url)"
              target="_blank"
              rel="noopener noreferrer"
              class="related-story-title"
            >{{ article.title || 'Untitled article' }}</a>
            <span v-else class="related-story-title">{{ article.title || 'Untitled article' }}</span>
          </span>
        </li>
      </ul>
      <p v-if="hasMore" class="related-story-footer">Showing the 50 most recent related articles.</p>
    </template>
  </ArticleExplanationPopover>
</template>

<script>
import ArticleExplanationPopover from './ArticleExplanationPopover.vue';
import { usableHttpUrl } from '../../utils/content.js';

export default {
  components: { ArticleExplanationPopover },
  props: {
    articleId: { type: [Number, String], default: null },
    request: { type: Function, required: true },
    rootClass: { type: String, default: '' },
    panelClass: { type: String, default: '' },
    triggerClass: { type: [String, Array, Object], default: '' },
    ariaLabel: { type: String, required: true },
    dialogTitle: { type: String, required: true },
    summary: { type: String, required: true },
    errorMessage: { type: String, required: true },
    emptyMessage: { type: String, required: true }
  },
  data() {
    return {
      articles: [],
      error: false,
      hasLoaded: false,
      hasMore: false,
      loading: false
    };
  },
  watch: {
    articleId() {
      this.articles = [];
      this.error = false;
      this.hasLoaded = false;
      this.hasMore = false;
    }
  },
  methods: {
    async loadArticles() {
      if (this.loading || (this.hasLoaded && !this.error)) return;
      if (this.articleId === null || this.articleId === undefined || this.articleId === '') {
        this.error = true;
        return;
      }
      this.loading = true;
      this.error = false;

      try {
        const response = await this.request(this.articleId);
        this.articles = Array.isArray(response.data?.articles) ? response.data.articles : [];
        this.hasMore = Boolean(response.data?.hasMore);
        this.hasLoaded = true;
      } catch {
        this.error = true;
      } finally {
        this.loading = false;
        this.$nextTick(() => this.$refs.popover?.positionPanel());
      }
    },
    safeUrl: usableHttpUrl
  }
};
</script>

<style scoped>
.related-story-state {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.related-story-state--error {
  color: var(--text-danger-placeholder);
}

.related-story-list {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.related-story-list li {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 9px;
  align-items: start;
}

.related-story-source-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  box-sizing: border-box;
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  padding: 5px;
  overflow: hidden;
  color: var(--article-feed-icon-text);
  background: var(--article-feed-icon-background);
  border-radius: var(--radius-control);
  line-height: 1;
}

.related-story-source-icon img {
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  object-fit: cover;
}

:deep(.related-story-source-icon .app-icon) {
  display: block;
  width: 14px;
  height: 14px;
  margin: 0;
}

.related-story-details,
.related-story-feed,
.related-story-title {
  display: block;
}

.related-story-feed {
  margin-bottom: 2px;
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
}

.related-story-title {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  text-decoration: none;
}

a.related-story-title:hover {
  color: var(--color-link);
  text-decoration: underline;
}

a.related-story-title:focus-visible {
  border-radius: 2px;
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.related-story-footer {
  padding-top: 12px;
  margin: 16px 0 0;
  color: var(--text-muted);
  font-size: 11px;
  border-top: 1px solid var(--border-default);
}
</style>
