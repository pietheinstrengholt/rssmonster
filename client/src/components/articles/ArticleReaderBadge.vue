<template>
  <Teleport v-if="metabar" :to="metabar.overflowTargets.get(badgeId) || 'body'" :disabled="!overflow">
    <span ref="badge" class="reader-metadata-badge"><slot /></span>
  </Teleport>
  <slot v-else />
</template>

<script>
import { inject, useId } from 'vue';

export default {
  setup() { return { metabar: inject('readerMetabar', null), badgeId: useId() }; },
  computed: {
    overflow() { return this.metabar?.overflowTargets.get(this.badgeId) && this.metabar.hiddenIds.has(this.badgeId); }
  },
  mounted() {
    if (this.metabar) {
      this.metabar.registerBadge(this.badgeId, this.$refs.badge, this.$el);
    }
  },
  beforeUnmount() { this.metabar?.unregisterBadge(this.badgeId); }
};
</script>

<style scoped>
.reader-metadata-badge {
  display: block;
  width: max-content;
  max-width: 100%;
  flex: 0 0 auto;
  white-space: nowrap;
}

.reader-metadata-badge :deep(.article-source),
.reader-metadata-badge :deep(.article-explanation-popover),
.reader-metadata-badge :deep(button),
.reader-metadata-badge :deep(button[class]),
.reader-metadata-badge :deep(.recommended-badge),
.reader-metadata-badge :deep(.analysis-state) {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.reader-metadata-badge :deep(.app-icon) {
  display: inline-block;
  vertical-align: middle;
}

/* Keep explanation triggers and metadata pills on the same centered text line. */
.reader-metadata-badge :deep(button),
.reader-metadata-badge :deep(.recommended-badge),
.reader-metadata-badge :deep(.source-badge) {
  min-height: 24px;
  padding-block: 0;
  line-height: 22px;
}
</style>
