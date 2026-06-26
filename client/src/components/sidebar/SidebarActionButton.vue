<template>
  <div :class="buttonClasses" @click="emit('select')">
    <div>
      <span class="sidebar-icon">
        <BootstrapIcon :icon="icon" color="currentColor" />
      </span>
      <div class="sidebar-item-title">{{ label }}</div>
      <span v-if="loading" class="spinner">
        <BootstrapIcon icon="arrow-clockwise" color="currentColor" animation="spin" />
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
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
});

const emit = defineEmits(['select']);

const buttonClasses = computed(() => [props.variant]);
</script>

<style scoped>
.sidebar-button,
.sidebar-management-button {
  margin-left: 12px;
  padding: 6px;
  color: var(--text-primary);
  background-color: var(--bg-secondary);
  border-radius: 8px;
  text-indent: 4px;
  margin-bottom: 20px;
  cursor: pointer;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
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
.sidebar-button-add-feed { width: calc(100% - 24px); }

.sidebar-button-refresh {
  color: var(--sidebar-action-refresh-text);
  background: var(--sidebar-action-refresh-background);
  border-color: var(--sidebar-action-refresh-border);
}

.sidebar-button-refresh:hover {
  background-color: var(--sidebar-action-refresh-hover-background);
}

.sidebar-button-add-feed {
  color: var(--sidebar-action-add-text);
  background-color: var(--sidebar-action-add-background);
  border-color: var(--sidebar-action-add-border);
}

.sidebar-button-add-feed:hover {
  color: var(--sidebar-action-add-hover-text);
  background-color: var(--sidebar-action-add-hover-background);
}

.sidebar-button-mark-read {
  color: var(--sidebar-action-mark-as-read-text);
  background-color: var(--sidebar-action-mark-as-read-background);
  border-color: var(--sidebar-action-mark-as-read-border);
}

.sidebar-button-mark-read:hover {
  color: var(--sidebar-action-mark-as-read-hover-text);
  background-color: var(--sidebar-action-mark-as-read-hover-background);
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

:global(:root[data-theme='dark'] .sidebar-button.sidebar-button-refresh) {
  color: var(--sidebar-action-refresh-text) !important;
  background: var(--sidebar-action-refresh-background) !important;
  border-color: var(--sidebar-action-refresh-border) !important;
}

:global(:root[data-theme='dark'] .sidebar-button.sidebar-button-refresh:hover) {
  background-color: var(--sidebar-action-refresh-hover-background) !important;
}

:global(:root[data-theme='dark'] .sidebar-button.sidebar-button-add-feed) {
  color: var(--sidebar-action-add-text) !important;
  background-color: var(--sidebar-action-add-background) !important;
  border-color: var(--sidebar-action-add-border) !important;
}

:global(:root[data-theme='dark'] .sidebar-button.sidebar-button-add-feed:hover) {
  color: var(--sidebar-action-add-hover-text) !important;
  background-color: var(--sidebar-action-add-hover-background) !important;
}

:global(:root[data-theme='dark'] .sidebar-button.sidebar-button-mark-read) {
  color: var(--sidebar-action-mark-as-read-text) !important;
  background-color: var(--sidebar-action-mark-as-read-background) !important;
  border-color: var(--sidebar-action-mark-as-read-border) !important;
}

:global(:root[data-theme='dark'] .sidebar-button.sidebar-button-mark-read:hover) {
  color: var(--sidebar-action-mark-as-read-hover-text) !important;
  background-color: var(--sidebar-action-mark-as-read-hover-background) !important;
}
</style>
