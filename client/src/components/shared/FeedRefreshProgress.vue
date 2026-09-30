<template>
  <div class="feed-refresh-progress-panel" role="status" aria-live="polite">
    <div class="feed-refresh-progress-header">
      <strong>{{ heading }}</strong>
      <button v-if="terminal" type="button" class="app-button app-button--outline-secondary app-button--compact" aria-label="Dismiss refresh result" @click="$emit('dismiss')">Dismiss</button>
    </div>
    <template v-if="!terminal">
      <p class="feed-refresh-summary">{{ progress.currentFeedLabel }}</p>
      <div v-if="progress.totalFeeds > 0" class="feed-refresh-progress-bar">
        <div class="feed-refresh-progress-fill" :style="{ width: `${progress.progressPercent}%` }"></div>
      </div>
      <div v-if="progress.totalFeeds > 0" class="feed-refresh-progress-stats">
        <span>Processed: {{ progress.processedFeeds }}/{{ progress.totalFeeds }}</span>
        <span>New: {{ progress.newArticles }}</span>
        <span>Errors: {{ progress.errors }}</span>
      </div>
    </template>
    <template v-else>
      <p class="feed-refresh-summary">{{ summary }}</p>
      <button v-if="status === 'error' || status === 'disconnected' || (status === 'success' && progress.errors > 0)" type="button" class="app-button app-button--outline-secondary app-button--compact" @click="$emit('retry')">{{ status === 'disconnected' ? 'Reconnect' : 'Retry refresh' }}</button>
    </template>
    <details v-if="progress.logs.length" class="feed-refresh-details">
      <summary>Details</summary>
      <ul class="feed-refresh-progress-logs">
        <li v-for="(line, index) in progress.logs" :key="`${line}-${index}`">{{ line }}</li>
      </ul>
    </details>
  </div>
</template>

<script>
export default {
  emits: ['dismiss', 'retry'],
  props: {
    status: { type: String, default: 'running' },
    progress: {
      type: Object,
      required: true
    }
  },
  computed: {
    terminal() { return !['idle', 'running'].includes(this.status); },
    heading() {
      if (this.status === 'success') return this.progress.errors > 0 ? 'Refresh finished with errors' : 'Refresh complete';
      if (this.status === 'error') return 'Refresh failed';
      if (this.status === 'disconnected') return 'Live updates disconnected';
      if (this.status === 'fallback-started') return 'Refresh started';
      return 'Refreshing feeds';
    },
    summary() {
      if (this.status === 'error') return 'Could not finish the refresh. Try again. Details are available below.';
      if (this.status === 'disconnected') return 'The refresh may still be running. Reconnect to check its progress.';
      if (this.status === 'fallback-started') return 'Refreshing in the background. Live results are unavailable; completion is not yet confirmed.';
      const articles = `${this.progress.newArticles} new ${this.progress.newArticles === 1 ? 'article' : 'articles'}`;
      if (!this.progress.totalFeeds) return `No feeds were refreshed. ${articles}.`;
      const feeds = `${this.progress.processedFeeds} of ${this.progress.totalFeeds} feeds processed`;
      return `${feeds}. ${articles}. ${this.progress.errors} ${this.progress.errors === 1 ? 'error' : 'errors'}.`;
    }
  }
};
</script>

<style scoped>
.feed-refresh-progress-panel {
  background: var(--surface-chrome);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-control);
  color: var(--text-primary);
  padding: 10px;
  text-align: left;
}

.feed-refresh-progress-header {
  display: flex;
  font-size: 12px;
  gap: 8px;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.feed-refresh-summary { margin: 0 0 8px; font-size: 12px; line-height: 1.5; }
.feed-refresh-details { margin-top: 8px; font-size: 12px; }
.feed-refresh-details summary { cursor: pointer; }

.feed-refresh-progress-bar {
  background: var(--scrollbar-track);
  border-radius: var(--radius-pill);
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

:global(:root[data-theme='dark']) .feed-refresh-progress-panel {
  background: var(--surface-chrome);
  border-color: var(--border-default);
  color: var(--text-primary);
}
</style>
