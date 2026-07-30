<template>
  <aside class="action-error-notice" role="alert" aria-atomic="true">
    <BootstrapIcon class="action-error-notice__icon" icon="exclamation-circle-fill" aria-hidden="true" />
    <p>{{ message }}</p>
    <button
      class="action-error-notice__dismiss"
      type="button"
      aria-label="Dismiss error"
      @click="$emit('dismiss')"
    >
      <BootstrapIcon icon="x-lg" aria-hidden="true" />
    </button>
  </aside>
</template>

<script>
export default {
  name: 'ActionErrorNotice',
  emits: ['dismiss'],
  props: {
    message: {
      type: String,
      required: true
    }
  }
};
</script>

<style scoped>
.action-error-notice {
  align-items: flex-start;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--text-danger);
  border-radius: 8px;
  bottom: 20px;
  box-shadow: var(--shadow-modal);
  color: var(--text-primary);
  display: flex;
  gap: 10px;
  max-width: min(360px, calc(100vw - 32px));
  padding: 12px 12px 12px 14px;
  position: fixed;
  right: 20px;
  z-index: 11000;
}

.action-error-notice__icon {
  color: var(--text-danger);
  flex: 0 0 auto;
  margin-top: 2px;
}

.action-error-notice p {
  flex: 1;
  font-size: 14px;
  line-height: 1.4;
  margin: 0;
}

.action-error-notice__dismiss {
  align-items: center;
  background: transparent;
  border: 0;
  color: var(--text-secondary);
  display: inline-flex;
  flex: 0 0 auto;
  height: 28px;
  justify-content: center;
  margin: -5px -5px -5px 0;
  padding: 0;
  width: 28px;
}

.action-error-notice__dismiss:hover {
  color: var(--text-primary);
}

@media (max-width: 766px) {
  .action-error-notice {
    bottom: 16px;
    left: 16px;
    right: 16px;
  }
}

@media (prefers-color-scheme: dark) {
  .action-error-notice {
    background: var(--bg-secondary);
    border-color: var(--border-subtle);
    border-left-color: var(--text-danger);
  }
}
</style>
