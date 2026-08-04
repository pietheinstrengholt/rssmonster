<template>
  <button
    type="button"
    :class="buttonClasses"
    :aria-busy="loading"
    :disabled="loading"
    @click="$emit('select')"
  >
    <div>
      <span class="sidebar-icon">
        <BootstrapIcon :icon="icon" color="currentColor" />
      </span>
      <div class="sidebar-item-title">{{ label }}</div>
      <span v-if="loading" class="spinner">
        <BootstrapIcon icon="arrow-clockwise" color="currentColor" animation="spin" />
      </span>
    </div>
  </button>
</template>

<script>
export default {
  props: {
    icon: {
      type: String,
      required: true
    },
    label: {
      type: String,
      required: true
    },
    variant: {
      type: [String, Array, Object],
      default: 'sidebar-management-button'
    },
    loading: {
      type: Boolean,
      default: false
    }
  },
  emits: ['select'],
  computed: {
    // This returns the configured classes for the sidebar action.
    buttonClasses() {
      return [this.variant];
    }
  }
};
</script>

<style scoped>
.sidebar-button,
.sidebar-management-button {
  appearance: none;
  margin-left: 12px;
  padding: 6px;
  color: var(--text-primary);
  background-color: var(--bg-secondary);
  border: 0;
  border-radius: 8px;
  text-indent: 4px;
  margin-bottom: 20px;
  cursor: pointer;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  font-family: inherit;
  font-size: inherit;
}

.sidebar-button {
  box-sizing: border-box;
  width: calc(100% - 24px);
  height: 36px;
  margin-bottom: 8px;
  padding: 0 12px;
  border: 1px solid var(--color-transparent);
  display: flex;
  align-items: center;
  font-weight: 500;
  text-align: left;
}

.sidebar-button > div {
  display: flex;
  align-items: center;
}

.sidebar-button .sidebar-item-title {
  margin-left: 5px;
  margin-top: 2px;
  margin-bottom: 4px;
}

.spinner {
  margin-left: 6px;
  margin-top: -2px;
}

.sidebar-button-refresh,
.sidebar-button-add-feed,
.sidebar-button-mark-read {
  width: calc(100% - 24px);
  color: var(--action-color);
  background-color: var(--sidebar-primary-action-background);
  border-color: var(--action-border);
  font-weight: 600;
  transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease;
}

.sidebar-button-refresh {
  --action-color: var(--sidebar-primary-action-refresh-text);
  --action-border: var(--sidebar-primary-action-refresh-border);
  --action-hover-background: var(--sidebar-primary-action-refresh-hover-background);
  --action-hover-border: var(--sidebar-primary-action-refresh-hover-border);
  --action-active-background: var(--sidebar-primary-action-refresh-active-background);
  --action-focus: var(--sidebar-primary-action-refresh-focus);
}

.sidebar-button-add-feed {
  --action-color: var(--sidebar-primary-action-add-text);
  --action-border: var(--sidebar-primary-action-add-border);
  --action-hover-background: var(--sidebar-primary-action-add-hover-background);
  --action-hover-border: var(--sidebar-primary-action-add-hover-border);
  --action-active-background: var(--sidebar-primary-action-add-active-background);
  --action-focus: var(--sidebar-primary-action-add-focus);
}

.sidebar-button-mark-read {
  --action-color: var(--sidebar-primary-action-read-text);
  --action-border: var(--sidebar-primary-action-read-border);
  --action-hover-background: var(--sidebar-primary-action-read-hover-background);
  --action-hover-border: var(--sidebar-primary-action-read-hover-border);
  --action-active-background: var(--sidebar-primary-action-read-active-background);
  --action-focus: var(--sidebar-primary-action-read-focus);
}

.sidebar-button-refresh:hover:not(:disabled),
.sidebar-button-add-feed:hover:not(:disabled),
.sidebar-button-mark-read:hover:not(:disabled) {
  color: var(--action-color);
  background-color: var(--action-hover-background);
  border-color: var(--action-hover-border);
}

.sidebar-button-refresh:active:not(:disabled),
.sidebar-button-add-feed:active:not(:disabled),
.sidebar-button-mark-read:active:not(:disabled) {
  background-color: var(--action-active-background);
  border-color: var(--action-hover-border);
}

.sidebar-button-refresh:focus-visible,
.sidebar-button-add-feed:focus-visible,
.sidebar-button-mark-read:focus-visible {
  outline: 2px solid var(--action-focus);
  outline-offset: 2px;
}

.sidebar-button-refresh:disabled,
.sidebar-button-add-feed:disabled,
.sidebar-button-mark-read:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.sidebar-bottom-action-button {
  color: var(--text-primary);
  background-color: var(--bg-muted);
  border-color: var(--border-subtle);
}

.sidebar-bottom-action-button:hover {
  color: var(--text-primary);
  background-color: var(--bg-hover);
}

.sidebar-management-button {
  width: 100%;
  height: 40px;
  margin: 0;
  padding: 4px;
  color: var(--text-primary);
  font-weight: 500;
  box-sizing: border-box;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-management-button > div {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
  transform: translateY(2px);
}

.sidebar-button .sidebar-icon,
.sidebar-management-button .sidebar-icon {
  float: left;
  min-width: 13px;
}

.sidebar-button .sidebar-icon {
  margin-top: -2px;
}

.sidebar-management-button .sidebar-item-title {
  font-size: 13px;
}

.sidebar-management-button.delete,
.sidebar-management-button.rename {
  color: var(--text-primary);
}

:global(:root[data-theme='dark']) {
  .sidebar-management-button {
    color: var(--text-inverted);
    background-color: var(--bg-secondary);
  }

  .sidebar-management-button :deep(svg) {
    fill: var(--text-inverted);
  }
}

:global(:root[data-theme='dark'] .sidebar-button.sidebar-bottom-action-button) {
  color: var(--toolbar-search-text-dark) !important;
  background-color: var(--toolbar-search-background-dark) !important;
  border-color: var(--toolbar-search-border-dark) !important;
}

:global(:root[data-theme='dark'] .sidebar-button.sidebar-bottom-action-button:hover) {
  color: var(--toolbar-search-text-dark) !important;
  background-color: var(--toolbar-search-hover-background-dark) !important;
}
</style>
