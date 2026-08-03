<template>
  <aside
    class="connectivity-status"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    <span class="connectivity-status__indicator" aria-hidden="true"></span>
    <p>{{ message }}</p>
    <button
      class="connectivity-status__retry"
      type="button"
      :disabled="recovering"
      @click="$emit('retry')"
    >
      {{ recovering ? 'Retrying…' : 'Retry' }}
    </button>
  </aside>
</template>

<script>
export default {
  name: 'ConnectivityStatus',
  emits: ['retry'],
  props: {
    recovering: {
      type: Boolean,
      default: false
    },
    status: {
      type: String,
      required: true
    }
  },
  computed: {
    // This function distinguishes a device-level outage from an unreachable RSSMonster backend.
    message() {
      return this.status === 'browser-offline'
        ? 'You are offline. Saved content remains available.'
        : 'RSSMonster cannot reach the backend. Saved content remains available.';
    }
  }
};
</script>

<style scoped>
.connectivity-status {
  align-items: center;
  background: var(--bg-primary);
  border: 1px solid var(--border-subtle);
  border-left: 3px solid var(--color-warning);
  border-radius: 8px;
  bottom: 16px;
  box-shadow: var(--shadow-modal);
  color: var(--text-primary);
  display: flex;
  gap: 10px;
  left: calc(280px + 16px);
  margin: 0 auto;
  max-width: min(680px, calc(100vw - 312px));
  padding: 9px 10px 9px 12px;
  position: fixed;
  right: 16px;
  z-index: 1050;
}

.connectivity-status__indicator {
  background: var(--color-warning);
  border-radius: 50%;
  flex: 0 0 auto;
  height: 8px;
  width: 8px;
}

.connectivity-status p {
  flex: 1;
  font-size: 14px;
  line-height: 1.4;
  margin: 0;
}

.connectivity-status__retry {
  background: var(--bg-control);
  border: 1px solid var(--border-input);
  border-radius: 8px;
  color: var(--text-primary);
  flex: 0 0 auto;
  font-size: 14px;
  font-weight: 700;
  min-height: 40px;
  padding: 8px 14px;
}

.connectivity-status__retry:hover:not(:disabled) {
  background: var(--bg-hover);
}

.connectivity-status__retry:focus-visible {
  border-color: var(--border-focus);
  box-shadow: var(--shadow-focus-primary);
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.connectivity-status__retry:disabled {
  color: var(--text-disabled-strong);
  cursor: not-allowed;
  opacity: 0.65;
}

@media (max-width: 879px) {
  .connectivity-status {
    left: 12px;
    max-width: none;
    right: 12px;
  }
}

@media (prefers-color-scheme: dark) {
  .connectivity-status {
    background: var(--bg-secondary);
    border-color: var(--border-subtle);
    border-left-color: var(--color-warning);
  }
}
</style>
