<template>
  <div class="unread-selection-context">
    <BriefingContextText
      :article-count="articleCount"
      :source-count="sourceCount"
      action-label="Tune your unread selection"
      modal-name="UnreadConfiguration"
    />
  </div>
</template>

<script>
import BriefingContextText from '../briefing/BriefingContextText.vue';

export default {
  name: 'UnreadSelectionContext',
  components: {
    BriefingContextText
  },
  props: {
    articleCount: {
      type: Number,
      required: true
    },
    sourceCount: {
      type: Number,
      required: true
    }
  }
};
</script>

<style scoped>
.unread-selection-context {
  width: 100%;
  padding: 0.875rem 0;
  background-color: var(--reader-list-item-background);
  border-bottom: 1px solid var(--reader-list-item-border);
}

@media (max-width: 767px) {
  .unread-selection-context {
    display: none;
  }
}

:global(:root[data-theme='dark'] .unread-selection-context) {
  background-color: var(--dark-page-surface, #0b0f14);
  border-bottom-color: var(--border-subtle);
}
</style>
