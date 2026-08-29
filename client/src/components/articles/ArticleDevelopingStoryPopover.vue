<template>
  <ArticleRelatedStoryPopover
    :article-id="articleId"
    :request="fetchArticles"
    root-class="article-developing-story-popover"
    panel-class="developing-story-panel"
    trigger-class="developing-story-trigger"
    aria-label="Developing story. Show related articles"
    dialog-title="Part of a developing story"
    summary="Other coverage currently grouped with this developing story."
    error-message="Couldn’t load the developing story."
    empty-message="No other articles are currently available."
  >
    <template #trigger>
      <BootstrapIcon
        icon="lightning-charge-fill"
        :class="iconClass"
        title="Developing story"
        aria-hidden="true"
      />
    </template>
  </ArticleRelatedStoryPopover>
</template>

<script>
import ArticleRelatedStoryPopover from './ArticleRelatedStoryPopover.vue';

export default {
  components: { ArticleRelatedStoryPopover },
  props: {
    articleId: { type: [Number, String], default: null },
    iconClass: { type: [String, Array, Object], default: 'developing-story-icon' }
  },
  methods: {
    async fetchArticles(articleId) {
      const { fetchDevelopingStoryArticles } = await import('../../api/articles.js');
      return fetchDevelopingStoryArticles(articleId);
    }
  }
};
</script>

<style scoped>
:deep(.developing-story-trigger) {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-control);
  color: var(--article-developing-icon);
  background: var(--color-transparent);
  font-size: 0.875rem;
  line-height: 1;
}
</style>
