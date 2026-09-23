<template>
  <div v-if="count > 0 && !dismissed" class="new-articles-banner" :class="{ 'new-articles-banner--reader': readerMode }" role="status" aria-live="polite">
    <div class="new-articles-banner__content">
      <div class="new-articles-banner__copy">
        <BootstrapIcon icon="lightbulb-fill" context="control" class="new-articles-banner__icon" aria-hidden="true" />
        <span><strong>{{ count }} {{ count === 1 ? 'new article' : 'new articles' }}</strong> since your last visit</span>
      </div>
      <div class="new-articles-banner__actions">
        <button type="button" class="new-articles-banner__primary" :disabled="loading" @click="$emit('show-new')">Show new only</button>
        <button type="button" :disabled="loading" @click="$emit('show-full')">Show full list</button>
      </div>
    </div>
    <button type="button" class="new-articles-banner__close" aria-label="Dismiss new articles banner" title="Dismiss" @click="dismissed = true">
      <BootstrapIcon icon="x" size="16" aria-hidden="true" />
    </button>
  </div>
</template>

<script>
export default {
  name: 'NewArticlesBanner',
  props: {
    count: { type: Number, required: true },
    loading: { type: Boolean, default: false },
    readerMode: { type: Boolean, default: false }
  },
  emits: ['show-new', 'show-full'],
  data() {
    return { dismissed: false };
  }
};
</script>

<style scoped>
.new-articles-banner {
  display: flex;
  align-items: center;
  gap: 0.375rem 0.75rem;
  margin: 0.5rem 0.875rem;
  padding: 0.5rem 0.875rem;
  border: 1px solid var(--briefing-context-border);
  border-radius: var(--radius-control);
  background: var(--briefing-context-surface);
  color: var(--briefing-supporting-text);
  font-size: var(--font-size-ui-default);
  line-height: 1.4;
}
.new-articles-banner--reader { margin-inline: 0; }
.new-articles-banner__content {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: inherit;
  min-width: 0;
}
.new-articles-banner .new-articles-banner__close {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: var(--control-height-compact);
  height: var(--control-height-compact);
  padding: 0;
}
.new-articles-banner__copy {
  display: flex;
  flex: 1 1 16rem;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.new-articles-banner__icon { flex: 0 0 auto; color: var(--color-link); }
.new-articles-banner strong { font-weight: 600; }
.new-articles-banner__actions { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.new-articles-banner button {
  min-height: var(--control-height-compact);
  padding: 0.375rem 0.5rem;
  border: 0;
  border-radius: var(--radius-compact);
  background: var(--color-transparent);
  color: inherit;
  font: inherit;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  cursor: pointer;
}
.new-articles-banner button:hover { color: var(--color-link-hover); background: var(--briefing-context-action-hover-surface); }
.new-articles-banner button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
.new-articles-banner button:disabled { opacity: 0.6; cursor: wait; }
.new-articles-banner .new-articles-banner__primary { color: var(--color-link); font-weight: 600; }
.new-articles-banner .new-articles-banner__primary:hover { color: var(--color-link-hover); }
:global(:root[data-theme='dark'] .new-articles-banner strong) { color: var(--text-primary); }
</style>
