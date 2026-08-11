<template>
  <div class="article-preview-empty">
    <span class="article-preview-empty__message">No preview available</span>
    <span v-if="safeArticleUrl" aria-hidden="true" class="article-preview-empty__separator">-</span>
    <a
      v-if="safeArticleUrl"
      :href="safeArticleUrl"
      class="article-preview-empty__link"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open original article in a new tab"
      @click.stop="$emit('open-original')"
    >
      <span>Open original article</span>
      <BootstrapIcon icon="box-arrow-up-right" aria-hidden="true" />
    </a>
  </div>
</template>

<script>
import { usableHttpUrl } from '../../utils/content.js';

export default {
  emits: ['open-original'],
  props: {
    url: { type: String, default: '' }
  },
  computed: {
    // Returns an absolute HTTP(S) destination eligible for external navigation.
    safeArticleUrl() {
      return usableHttpUrl(this.url);
    }
  }
};
</script>

<style scoped>
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

:global(:root[data-theme='dark'] .article-card .article-preview-empty),
:global(:root[data-theme='dark'] .article-card .article-preview-empty__link) {
  color: var(--reader-empty-preview-text);
}

:global(:root[data-theme='dark'] .article-card .article-preview-empty__link:hover),
:global(:root[data-theme='dark'] .article-card .article-preview-empty__link:focus-visible) {
  color: var(--color-link);
  outline-color: var(--color-link);
}
</style>
