<template>
  <div
    class="unread-selection-context"
    :class="{ 'unread-selection-context--reader': readerMode }"
  >
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
    },
    readerMode: {
      type: Boolean,
      default: false
    }
  }
};
</script>

<style scoped>
.unread-selection-context {
  width: 100%;
  padding: 0.875rem;
  background-color: var(--reader-list-item-background);
  border-bottom: 1px solid var(--reader-list-item-border);
}

.unread-selection-context--reader {
  padding-right: 0;
  padding-left: 0;
}

@media (max-width: 767px) {
  .unread-selection-context {
    display: none;
  }
}

:global(:root[data-theme='dark'] .unread-selection-context) {
  background-color: var(--surface-page);
  border-bottom-color: var(--border-subtle);
}
</style>
