<template>
  <aside
    class="connectivity-status"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    <div class="connectivity-status__content">
      <span class="connectivity-status__indicator" aria-hidden="true"></span>
      <p>{{ message }}</p>
    </div>
    <button
      class="app-button app-button--compact connectivity-status__retry"
      type="button"
      :disabled="recovering"
      @click="$emit('retry')"
    >
      <BootstrapIcon icon="arrow-clockwise" context="control" decorative />
      {{ recovering ? 'Retrying…' : 'Try again' }}
    </button>
  </aside>
</template>

<script>
import BootstrapIcon from './BootstrapIcon.vue';

export default {
  name: 'ConnectivityStatus',
  components: { BootstrapIcon },
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
  background: var(--surface-warning);
  border: 1px solid var(--border-warning);
  border-radius: 12px;
  box-sizing: border-box;
  box-shadow: var(--shadow-modal);
  color: var(--text-primary);
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  width: 100%;
  max-width: 680px;
  padding: var(--space-3);
}

.connectivity-status__content {
  align-items: center;
  display: flex;
  flex: 1 1 24rem;
  gap: var(--space-2);
  min-width: 0;
}

.connectivity-status__indicator {
  background: var(--color-warning);
  border-radius: var(--radius-pill);
  flex: 0 0 auto;
  height: 8px;
  width: 8px;
}

.connectivity-status p {
  flex: 1;
  font-size: var(--font-size-ui-default);
  font-weight: 400;
  line-height: 1.45;
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.connectivity-status__retry {
  background: var(--surface-control);
  border-color: var(--border-warning);
  border-radius: var(--radius-control);
  color: var(--color-warning);
  flex: 0 0 auto;
  font-weight: 500;
  gap: var(--space-1-5);
  margin-left: auto;
  padding: var(--space-1-5) var(--space-3);
}

.connectivity-status__retry:hover:not(:disabled) {
  background: var(--surface-warning-hover);
  border-color: var(--border-warning-strong);
}

.connectivity-status__retry:focus-visible {
  border-color: var(--focus-ring-color);
  box-shadow: var(--focus-ring-shadow);
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.connectivity-status__retry:disabled {
  color: var(--text-disabled-strong);
  cursor: not-allowed;
  opacity: 0.65;
}

</style>
