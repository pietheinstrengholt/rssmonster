<template>
  <ArticleRelatedStoryPopover
    :article-id="articleId"
    :request="fetchArticles"
    root-class="article-story-sources-popover"
    panel-class="story-sources-panel"
    trigger-class="source-badge story-sources-trigger"
    :aria-label="`${sourceCount} unique sources. Show articles from different sources`"
    dialog-title="Same story, different sources"
    summary="Other feeds currently covering the same story."
    error-message="Couldn’t load articles from different sources."
    empty-message="No articles from other sources are currently available."
  >
    <template #trigger>
      <BootstrapIcon icon="people-fill" class="source-diversity-icon" aria-hidden="true" />
      {{ sourceCount }} sources
    </template>
  </ArticleRelatedStoryPopover>
</template>

<script>
import ArticleRelatedStoryPopover from './ArticleRelatedStoryPopover.vue';
import { fetchStorySourceArticles } from '../../api/articles.js';

export default {
  components: { ArticleRelatedStoryPopover },
  props: {
    articleId: { type: [Number, String], default: null },
    sourceCount: { type: Number, required: true }
  },
  methods: {
    fetchArticles: fetchStorySourceArticles
  }
};
</script>

<style scoped>
:deep(.story-sources-trigger) {
  gap: 3px;
  color: var(--article-source-diversity-text);
  background-color: var(--article-source-diversity-background);
}

:deep(.story-sources-trigger .source-diversity-icon) {
  font-size: 10px;
}
</style>
