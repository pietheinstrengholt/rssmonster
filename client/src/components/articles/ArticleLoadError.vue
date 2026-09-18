<template>
  <div class="article-load-error" role="alert">
    <div class="article-load-error__content">
      <span class="article-load-error__icon" aria-hidden="true">
        <BootstrapIcon icon="exclamation-circle" context="control" decorative />
      </span>
      <div class="article-load-error__message">
        <div class="article-load-error__title">Something went wrong</div>
        <div class="article-load-error__description">
          We couldn't load the articles. Please try again in a moment.
        </div>
      </div>
    </div>
    <button
      type="button"
      class="app-button app-button--outline-danger app-button--compact article-load-error__retry"
      @click="$emit('retry')"
    >
      <BootstrapIcon icon="arrow-clockwise" context="control" decorative />
      Try again
    </button>
  </div>
</template>

<script>
import BootstrapIcon from '../shared/BootstrapIcon.vue';

export default {
  components: { BootstrapIcon },
  emits: ['retry']
};
</script>

<style scoped>
.article-load-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-5);
  box-sizing: border-box;
  margin: var(--space-5) var(--space-5) 1rem;
  padding: var(--space-5);
  border: 1px solid var(--border-danger);
  border-radius: 12px;
  background: color-mix(in srgb, var(--badge-danger-bg) 40%, var(--surface-card));
}

.article-load-error__content {
  display: flex;
  flex: 1 1 22rem;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
}

.article-load-error__icon {
  display: flex;
  flex: 0 0 32px;
  align-items: center;
  justify-content: center;
  height: 32px;
  border-radius: var(--radius-pill);
  background: var(--badge-danger-bg);
  color: var(--badge-danger-text);
}

.article-load-error__message {
  min-width: 0;
  overflow-wrap: anywhere;
}

.article-load-error__title {
  margin-bottom: var(--space-0-5);
  color: var(--badge-danger-text);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
}

.article-load-error__description {
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 400;
  line-height: 1.45;
}

.article-load-error__retry {
  flex: 0 0 auto;
  gap: var(--space-1-5);
  margin-left: auto;
  padding: var(--space-2) var(--space-3);
  border-color: var(--border-danger);
  background: var(--surface-control);
  color: var(--badge-danger-text);
  font-weight: 500;
}

.article-load-error__retry:hover:not(:disabled) {
  border-color: var(--border-danger-strong);
}
</style>
