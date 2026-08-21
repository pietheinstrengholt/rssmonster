<template>
  <div class="article-end-state">
    <div class="article-end-state-summary">
      <div class="article-end-state-icon" aria-hidden="true">
        <BootstrapIcon icon="check-lg" />
      </div>

      <div class="article-end-state-copy">
        <h3 class="article-end-state-title">
          You've reached the end.
        </h3>

        <p class="article-end-state-text">
          {{ endStateText }}
        </p>
      </div>
    </div>

    <div v-if="showActions" class="article-end-state-actions">
      <button class="article-end-state-primary" type="button" @click="$emit('mark-all-read')">
        <BootstrapIcon icon="check-lg" aria-hidden="true" />
        Mark {{ unreadCount }} as read
      </button>

      <button v-if="showDismiss" class="article-end-state-secondary" type="button" @click="$emit('dismiss')">
        Not now
      </button>
    </div>
  </div>
</template>

<script>
export default {
  emits: ['mark-all-read', 'dismiss'],
  props: {
    unreadCount: {
      type: Number,
      required: true
    },
    showActions: {
      type: Boolean,
      required: true
    },
    showDismiss: {
      type: Boolean,
      default: true
    }
  },
  computed: {
    // Returns the supporting text for the current article end state.
    endStateText() {
      if (!this.showActions) return 'Everything is already read.';

      const articleLabel = this.unreadCount === 1 ? 'article was' : 'articles were';
      return `${this.unreadCount} unread ${articleLabel} reviewed.`;
    }
  }
}
</script>

<style scoped>
.article-end-state {
  animation: articleEndStateIn 0.18s ease-out;
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: 14px;
  box-shadow: 0 10px 24px var(--shadow-card-subtle-color);
  box-sizing: border-box;
  margin: 28px auto 36px;
  max-width: 420px;
  padding: 28px;
  text-align: center;
  width: 90%;
}

.article-end-state-icon {
  align-items: center;
  background: var(--color-primary);
  border-radius: 50%;
  color: var(--text-inverted);
  display: inline-flex;
  font-size: 24px;
  height: 48px;
  justify-content: center;
  line-height: 1;
  margin-bottom: 16px;
  width: 48px;
}

.article-end-state-title {
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 700;
  line-height: 1.35;
  margin: 0 0 8px;
}

.article-end-state-text {
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.45;
  margin: 0;
}

.article-end-state-actions {
  display: grid;
  gap: 10px;
  margin-top: 20px;
}

.article-end-state-primary,
.article-end-state-secondary {
  align-items: center;
  border-radius: 8px;
  display: inline-flex;
  font: inherit;
  gap: 8px;
  height: 40px;
  justify-content: center;
  padding: 0 14px;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  width: 100%;
}

.article-end-state-primary {
  background: var(--color-primary);
  border: 1px solid var(--color-primary);
  color: var(--text-inverted);
  font-weight: 700;
}

.article-end-state-primary:hover {
  background: var(--color-primary-hover);
  border-color: var(--color-primary-hover);
}

.article-end-state-secondary {
  background: var(--surface-card);
  border: 1px solid var(--border-control);
  color: var(--text-secondary);
  font-weight: 600;
}

.article-end-state-secondary:hover {
  background: var(--surface-selected);
  color: var(--text-primary);
}

.article-end-state-primary:focus-visible,
.article-end-state-secondary:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 3px;
}

@keyframes articleEndStateIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .article-end-state {
    animation: none;
  }

  .article-end-state-primary,
  .article-end-state-secondary {
    transition: none;
  }
}

@media (max-width: 879px) and (orientation: portrait) {
  .article-end-state {
    margin: 20px auto 28px;
    max-width: 100%;
    padding: 16px;
  }

  .article-end-state-summary {
    align-items: center;
    display: flex;
    gap: 12px;
    text-align: left;
  }

  .article-end-state-icon {
    flex: 0 0 40px;
    height: 40px;
    margin-bottom: 0;
    width: 40px;
  }

  .article-end-state-copy {
    min-width: 0;
  }

  .article-end-state-title {
    margin-bottom: 4px;
  }

  .article-end-state-actions {
    margin-top: 16px;
  }
}

/* Keeps phone typography stable when viewport orientation changes. */
@media (max-width: 767px) {
  .article-end-state-icon {
    font-size: 20px;
  }

  .article-end-state-title {
    font-size: 17px;
  }
}

@media (min-width: 768px) and (max-width: 879px) and (orientation: portrait) {
  .article-end-state-icon {
    font-size: 20px;
  }

  .article-end-state-title {
    font-size: 17px;
  }
}

:global(:root[data-theme='dark']) .article-end-state {
  background: var(--surface-card);
  border-color: var(--border-default);
  box-shadow: 0 14px 28px var(--shadow-settings-dialog-color);
}

:global(:root[data-theme='dark']) .article-end-state-title {
  color: var(--dark-text-primary, var(--text-primary));
}

:global(:root[data-theme='dark']) .article-end-state-text {
  color: var(--dark-text-meta, var(--text-secondary));
}

:global(:root[data-theme='dark']) .article-end-state-secondary {
  background: var(--surface-card);
  border-color: var(--border-default);
  color: var(--dark-text-meta, var(--text-secondary));
}

:global(:root[data-theme='dark']) .article-end-state-secondary:hover {
  background: var(--surface-chrome);
  border-color: var(--border-strong);
  color: var(--dark-text-primary, var(--text-primary));
}
</style>
