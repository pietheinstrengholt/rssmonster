<template>
  <div class="article-end-state">
    <div class="article-end-state-summary">
      <div class="article-end-state-icon" aria-hidden="true">
        <i class="bi bi-check-lg"></i>
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
        <i class="bi bi-check-lg" aria-hidden="true"></i>
        Mark {{ unreadCount }} as read
      </button>

      <button class="article-end-state-secondary" type="button" @click="$emit('dismiss')">
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
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
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
  background: var(--bg-card);
  border: 1px solid #DBEAFE;
  color: var(--text-secondary);
  font-weight: 600;
}

.article-end-state-secondary:hover {
  background: var(--bg-selected-soft, var(--bg-selected));
  color: var(--text-primary);
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

@media (max-width: 766px) and (orientation: portrait) {
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
    font-size: 20px;
    height: 40px;
    margin-bottom: 0;
    width: 40px;
  }

  .article-end-state-copy {
    min-width: 0;
  }

  .article-end-state-title {
    font-size: 17px;
    margin-bottom: 4px;
  }

  .article-end-state-actions {
    margin-top: 16px;
  }
}

:global(:root[data-theme='dark']) .article-end-state {
  background: var(--dark-bg-card, var(--bg-card));
  border-color: var(--dark-border, var(--border-color));
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.32);
}

:global(:root[data-theme='dark']) .article-end-state-title {
  color: var(--dark-text-primary, var(--text-primary));
}

:global(:root[data-theme='dark']) .article-end-state-text {
  color: var(--dark-text-meta, var(--text-secondary));
}

:global(:root[data-theme='dark']) .article-end-state-secondary {
  background: var(--dark-bg-card, var(--bg-card));
  border-color: var(--dark-border, var(--border-color));
  color: var(--dark-text-meta, var(--text-secondary));
}

:global(:root[data-theme='dark']) .article-end-state-secondary:hover {
  background: var(--dark-bg-toolbar, var(--bg-muted));
  border-color: var(--color-link-hover);
  color: var(--dark-text-primary, var(--text-primary));
}
</style>
