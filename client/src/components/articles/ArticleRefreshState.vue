<template>
  <button
    type="button"
    class="article-refresh-state"
    :aria-label="refreshLabel"
    @click="$emit('refresh')"
  >
    <span class="article-refresh-state-icon" aria-hidden="true">
      <BootstrapIcon icon="arrow-repeat" />
    </span>

    <span class="article-refresh-state-copy">
      <span class="article-refresh-state-title">
        {{ unreadCount }} new unread {{ unreadCount === 1 ? 'article' : 'articles' }}
      </span>
      <span class="article-refresh-state-action">Refresh to show {{ unreadCount === 1 ? 'it' : 'them' }}</span>
    </span>
  </button>
</template>

<script>
export default {
  emits: ['refresh'],
  props: {
    unreadCount: {
      type: Number,
      required: true
    }
  },
  computed: {
    // Describes the refresh action and its unread article count for assistive technology.
    refreshLabel() {
      const articleLabel = this.unreadCount === 1 ? 'article' : 'articles';
      return `${this.unreadCount} new unread ${articleLabel}. Refresh to show ${this.unreadCount === 1 ? 'it' : 'them'}.`;
    }
  }
}
</script>

<style scoped>
.article-refresh-state {
  align-items: center;
  background: var(--color-primary-soft);
  border: 1px solid var(--border-info);
  border-radius: 12px;
  box-sizing: border-box;
  color: var(--text-primary);
  cursor: pointer;
  display: flex;
  font: inherit;
  gap: 14px;
  margin: 0 auto 28px;
  max-width: 420px;
  min-height: 72px;
  padding: 14px 18px;
  text-align: left;
  transition: background-color 0.15s ease, border-color 0.15s ease;
  width: 90%;
}

.article-refresh-state:hover {
  background: var(--bg-selected);
  border-color: var(--border-info-strong);
}

.article-refresh-state:focus-visible {
  outline: 3px solid var(--border-focus);
  outline-offset: 3px;
}

.article-refresh-state-icon {
  align-items: center;
  color: var(--color-primary);
  display: inline-flex;
  flex: 0 0 40px;
  font-size: 30px;
  justify-content: center;
  line-height: 1;
}

.article-refresh-state-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.article-refresh-state-title {
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
}

.article-refresh-state-action {
  color: var(--color-primary);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
}

@media (max-width: 879px) and (orientation: portrait) {
  .article-refresh-state {
    max-width: 100%;
    min-height: 68px;
    padding: 12px 16px;
  }

  .article-refresh-state-icon {
    flex-basis: 36px;
  }
}

/* Keeps phone typography stable when viewport orientation changes. */
@media (max-width: 767px) {
  .article-refresh-state-icon {
    font-size: 28px;
  }
}

@media (min-width: 768px) and (max-width: 879px) and (orientation: portrait) {
  .article-refresh-state-icon {
    font-size: 28px;
  }
}

:global(:root[data-theme='dark']) .article-refresh-state {
  background: var(--color-primary-surface-dark);
  border-color: var(--border-info);
}

:global(:root[data-theme='dark']) .article-refresh-state:hover {
  background: var(--bg-hover);
  border-color: var(--border-info-strong);
}

:global(:root[data-theme='dark']) .article-refresh-state-title {
  color: var(--text-primary);
}

:global(:root[data-theme='dark']) .article-refresh-state-icon,
:global(:root[data-theme='dark']) .article-refresh-state-action {
  color: var(--color-primary-icon-dark);
}
</style>
