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
        <BootstrapIcon :icon="icon" context="control" decorative color="currentColor" />
      </span>
      <div class="sidebar-item-title">{{ label }}</div>
      <span v-if="loading" class="spinner">
        <BootstrapIcon icon="arrow-clockwise" context="control" decorative color="currentColor" animation="spin" />
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
  margin-left: var(--space-3);
  padding: var(--space-1-5);
  color: var(--text-primary);
  background-color: var(--surface-chrome);
  border: 0;
  border-radius: var(--radius-control);
  text-indent: var(--space-1);
  margin-bottom: var(--space-5);
  cursor: pointer;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  font-family: inherit;
  font-size: inherit;
}

.sidebar-button {
  box-sizing: border-box;
  width: calc(100% - (2 * var(--space-3)));
  height: calc(var(--control-height-default) - var(--space-1));
  margin-bottom: var(--space-2);
  padding: 0 var(--space-3);
  border: 1px solid var(--color-transparent);
  display: flex;
  align-items: center;
  font-weight: 500;
  text-align: left;
}

.sidebar-button > div {
  align-items: center;
  display: flex;
  line-height: 1.25;
}

.sidebar-button .sidebar-item-title {
  margin-left: var(--space-1);
}

.spinner {
  align-items: center;
  display: inline-flex;
  justify-content: center;
  line-height: 1;
  margin-left: var(--space-1-5);
}

.sidebar-button-refresh,
.sidebar-button-add-feed,
.sidebar-button-mark-read {
  width: calc(100% - (2 * var(--space-3)));
  color: var(--action-color);
  background-color: var(--action-background);
  border-color: var(--action-border);
  font-weight: 600;
  transition: background-color var(--motion-duration-fast) var(--motion-easing-standard), border-color var(--motion-duration-fast) var(--motion-easing-standard), color var(--motion-duration-fast) var(--motion-easing-standard);
}

.sidebar-button-refresh {
  --action-background: var(--sidebar-action-refresh-background);
  --action-color: var(--sidebar-action-refresh-text);
  --action-border: var(--sidebar-action-refresh-border);
  --action-hover-background: var(--sidebar-action-refresh-hover-background);
  --action-hover-border: var(--sidebar-action-refresh-hover-border);
  --action-active-background: var(--sidebar-action-refresh-active-background);
  --action-focus: var(--sidebar-action-refresh-focus);
}

.sidebar-button-add-feed {
  --action-background: var(--sidebar-action-add-background);
  --action-color: var(--sidebar-action-add-text);
  --action-border: var(--sidebar-action-add-border);
  --action-hover-background: var(--sidebar-action-add-hover-background);
  --action-hover-border: var(--sidebar-action-add-hover-border);
  --action-active-background: var(--sidebar-action-add-active-background);
  --action-focus: var(--sidebar-action-add-focus);
}

.sidebar-button-mark-read {
  --action-background: var(--sidebar-action-read-background);
  --action-color: var(--sidebar-action-read-text);
  --action-border: var(--sidebar-action-read-border);
  --action-hover-background: var(--sidebar-action-read-hover-background);
  --action-hover-border: var(--sidebar-action-read-hover-border);
  --action-active-background: var(--sidebar-action-read-active-background);
  --action-focus: var(--sidebar-action-read-focus);
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
  outline: var(--focus-ring-width) solid var(--action-focus);
  outline-offset: var(--focus-ring-offset);
}

.sidebar-button-refresh:disabled,
.sidebar-button-add-feed:disabled,
.sidebar-button-mark-read:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.sidebar-bottom-action-button {
  color: var(--sidebar-secondary-action-text);
  background-color: var(--sidebar-secondary-action-background);
  border-color: var(--sidebar-secondary-action-border);
  transition: background-color var(--motion-duration-fast) var(--motion-easing-standard), border-color var(--motion-duration-fast) var(--motion-easing-standard), color var(--motion-duration-fast) var(--motion-easing-standard);
}

.sidebar-bottom-action-button:hover:not(:disabled) {
  color: var(--sidebar-secondary-action-text);
  background-color: var(--sidebar-secondary-action-hover-background);
  border-color: var(--sidebar-secondary-action-hover-border);
}

.sidebar-bottom-action-button:active:not(:disabled) {
  background-color: var(--sidebar-secondary-action-active-background);
  border-color: var(--sidebar-secondary-action-hover-border);
}

.sidebar-bottom-action-button:focus-visible {
  outline: var(--focus-ring-width) solid var(--sidebar-secondary-action-focus);
  outline-offset: var(--focus-ring-offset);
}

.sidebar-management-button {
  width: 100%;
  height: var(--control-height-default);
  margin: 0;
  padding: var(--space-1);
  color: var(--sidebar-management-action-text);
  background-color: var(--sidebar-management-action-background);
  font-weight: 500;
  box-sizing: border-box;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-management-button > div {
  align-items: center;
  display: flex;
  flex-direction: column;
  justify-content: center;
  line-height: 1.2;
}

.sidebar-button .sidebar-icon,
.sidebar-management-button .sidebar-icon {
  align-items: center;
  display: inline-flex;
  justify-content: center;
  line-height: 1;
  min-width: 13px;
}

.sidebar-management-button .sidebar-item-title {
  font-size: 13px;
}

.sidebar-management-button.delete,
.sidebar-management-button.rename {
  color: var(--sidebar-management-action-text);
}
</style>
