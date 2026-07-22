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
import BriefingContextText from './BriefingContextText.vue';

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
  padding: 0.875rem;
  background-color: #ffffff;
  border-bottom: 1px solid #e5e7eb;
}

@media (max-width: 766px) {
  .unread-selection-context {
    display: none;
  }
}

:global(:root[data-theme='dark'] .unread-selection-context) {
  background-color: var(--dark-page-surface, #0b0f14);
  border-bottom-color: var(--border-color, #2a3342);
}
</style>
