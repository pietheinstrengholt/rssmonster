<template>
  <div v-if="count > 0 && !dismissed" class="new-articles-banner" :class="{ 'new-articles-banner--reader': readerMode, 'new-articles-banner--headlines': headlineMode }" role="status" aria-live="polite">
    <div class="new-articles-banner__content">
      <div class="new-articles-banner__copy">
        <BootstrapIcon :icon="headlineMode ? 'info-circle-fill' : 'lightbulb-fill'" context="control" class="new-articles-banner__icon" aria-hidden="true" />
        <span v-if="readerMode" :title="`${count} new ${count === 1 ? 'article' : 'articles'} since your last visit`" :aria-label="`${count} new ${count === 1 ? 'article' : 'articles'} since your last visit`"><strong>{{ count }} {{ count === 1 ? 'new article' : 'new articles' }}</strong></span>
        <span v-else><strong>{{ count }} {{ count === 1 ? 'new article' : 'new articles' }}</strong><span class="new-articles-banner__context"> since your last visit</span></span>
      </div>
      <div class="new-articles-banner__actions">
        <button type="button" class="new-articles-banner__primary" :disabled="loading" :aria-label="readerMode ? 'Show new only' : undefined" @click="$emit('show-new')">{{ readerMode ? 'New only' : 'Show new only' }}</button>
        <button type="button" :disabled="loading" :aria-label="readerMode ? 'Show full list' : undefined" @click="$emit('show-full')">{{ readerMode ? 'Full list' : 'Show full list' }}</button>
      </div>
    </div>
    <button type="button" class="new-articles-banner__close" aria-label="Dismiss new articles banner" title="Dismiss" @click="dismissed = true">
      <BootstrapIcon :icon="headlineMode ? 'x-lg' : 'x'" context="control" size="16" aria-hidden="true" />
    </button>
  </div>
</template>

<script>
export default {
  name: 'NewArticlesBanner',
  props: {
    count: { type: Number, required: true },
    loading: { type: Boolean, default: false },
    headlineMode: { type: Boolean, default: false },
    readerMode: { type: Boolean, default: false }
  },
  emits: ['show-new', 'show-full'],
  data() {
    return { dismissed: false };
  },
  watch: {
    count() {
      this.dismissed = false;
    }
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
  min-height: var(--control-height-compact);
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.new-articles-banner__icon { flex: 0 0 auto; color: var(--color-link); }
.new-articles-banner strong { font-weight: 600; }
.new-articles-banner__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem; }
.new-articles-banner button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: var(--control-height-compact);
  padding: 0.375rem 0.5rem;
  border: 0;
  border-radius: var(--radius-compact);
  background: var(--color-transparent);
  color: inherit;
  font: inherit;
  font-weight: 500;
  line-height: inherit;
  white-space: nowrap;
  cursor: pointer;
}
.new-articles-banner button:hover { color: var(--color-link-hover); background: var(--briefing-context-action-hover-surface); }
.new-articles-banner button:focus-visible { outline: 2px solid var(--border-focus); outline-offset: 2px; }
.new-articles-banner button:disabled { opacity: 0.6; cursor: wait; }
.new-articles-banner .new-articles-banner__primary { color: var(--color-link); font-weight: 600; }
.new-articles-banner .new-articles-banner__primary:hover { color: var(--color-link-hover); }
.new-articles-banner--reader { margin-inline: 0; padding-inline: 0.5rem; gap: 0.375rem; }
.new-articles-banner--reader .new-articles-banner__content,
.new-articles-banner--reader .new-articles-banner__actions { flex-wrap: nowrap; }
.new-articles-banner--reader .new-articles-banner__copy { flex-basis: auto; gap: 0.375rem; white-space: nowrap; }
@media (max-width: 767px), (max-height: 560px) and (min-width: 480px) {
  .new-articles-banner:not(.new-articles-banner--reader) { margin-inline: 0.5rem; }
}
:global(:root[data-theme='dark'] .new-articles-banner strong) { color: var(--text-primary); }
.new-articles-banner.new-articles-banner--headlines {
  margin: 0;
  padding: 7px 16px;
  min-height: 50px;
  box-sizing: border-box;
  border-color: var(--border-info);
  background: var(--surface-info-subtle);
  color: var(--text-secondary);
  gap: 16px;
}
.new-articles-banner--headlines strong { color: var(--text-primary); }
.new-articles-banner--headlines .new-articles-banner__icon { width: 22px; height: 22px; }
.new-articles-banner--headlines .new-articles-banner__copy { gap: 10px; }
.new-articles-banner--headlines .new-articles-banner__actions { gap: 8px; }
.new-articles-banner--headlines button { min-height: 34px; }
.new-articles-banner--headlines .new-articles-banner__close { width: 34px; height: 34px; }
.new-articles-banner--headlines button:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
@container headline-topbars (width < 882px) {
  .new-articles-banner--headlines .new-articles-banner__context { display: none; }
  .new-articles-banner--headlines .new-articles-banner__copy { flex-basis: auto; }
}
@container headline-topbars (width < 460px) {
  .new-articles-banner.new-articles-banner--headlines { padding-inline: 4px; gap: 2px; }
  .new-articles-banner--headlines .new-articles-banner__content { gap: 2px; }
  .new-articles-banner--headlines .new-articles-banner__copy { flex-basis: 0; min-width: min-content; gap: 2px; line-height: 1.2; }
  .new-articles-banner--headlines .new-articles-banner__icon { width: 16px; height: 16px; }
  .new-articles-banner--headlines .new-articles-banner__actions { gap: 2px; }
  .new-articles-banner--headlines .new-articles-banner__actions button { padding-inline: 2px; }
}
</style>
