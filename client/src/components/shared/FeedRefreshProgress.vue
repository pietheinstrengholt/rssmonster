<template>
  <div class="feed-refresh-progress-panel" role="status" aria-live="polite">
    <div class="feed-refresh-progress-header">
      <strong>Live refresh</strong>
      <span>{{ progress.currentFeedLabel }}</span>
    </div>
    <div class="feed-refresh-progress-bar">
      <div
        class="feed-refresh-progress-fill"
        :style="{ width: `${progress.progressPercent}%` }"
      ></div>
    </div>
    <div class="feed-refresh-progress-stats">
      <span>Processed: {{ progress.processedFeeds }}/{{ progress.totalFeeds }}</span>
      <span>New: {{ progress.newArticles }}</span>
      <span>Errors: {{ progress.errors }}</span>
    </div>
    <ul class="feed-refresh-progress-logs">
      <li v-for="(line, index) in progress.logs" :key="`${line}-${index}`">{{ line }}</li>
    </ul>
  </div>
</template>

<script>
export default {
  props: {
    progress: {
      type: Object,
      required: true
    }
  }
};
</script>

<style scoped>
.feed-refresh-progress-panel {
  background: var(--bg-secondary);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  color: var(--text-primary);
  padding: 10px;
  text-align: left;
}

.feed-refresh-progress-header {
  display: flex;
  font-size: 12px;
  gap: 8px;
  justify-content: space-between;
  margin-bottom: 8px;
}

.feed-refresh-progress-bar {
  background: var(--scrollbar-track);
  border-radius: 999px;
  height: 6px;
  overflow: hidden;
  width: 100%;
}

.feed-refresh-progress-fill {
  background: var(--color-primary);
  height: 100%;
  transition: width 0.25s ease;
}

.feed-refresh-progress-stats {
  display: flex;
  flex-wrap: wrap;
  font-size: 11px;
  gap: 10px;
  margin-top: 8px;
}

.feed-refresh-progress-logs {
  color: var(--text-muted);
  font-size: 11px;
  list-style: none;
  margin: 8px 0 0;
  max-height: 120px;
  overflow-y: auto;
  padding: 0;
}

.feed-refresh-progress-logs li {
  margin-bottom: 4px;
}

@media (prefers-color-scheme: dark) {
  .feed-refresh-progress-panel {
    background: var(--bg-secondary);
    border-color: var(--border-default);
    color: var(--text-primary);
  }
}
</style>
