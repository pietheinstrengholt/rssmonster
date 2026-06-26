<template>
  <div
    :class="rowClasses"
    @click="emit('select')"
  >
    <span class="sidebar-icon">
      <BootstrapIcon :icon="icon" :class="iconClass" color="currentColor" />
    </span>
    <span class="sidebar-item-title">{{ title }}</span>
    <span v-if="count !== null && count !== undefined" class="sidebar-count-wrapper">
      <span class="sidebar-count" :class="badgeClass">{{ formattedCount }}</span>
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { formatCount } from './formatCount.js';

const props = defineProps({
  icon: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true
  },
  count: {
    type: [String, Number],
    default: null
  },
  selected: {
    type: Boolean,
    default: false
  },
  iconClass: {
    type: [String, Array, Object],
    default: ''
  },
  rowClass: {
    type: [String, Array, Object],
    default: ''
  },
  badgeClass: {
    type: [String, Array, Object],
    default: ''
  }
});

const emit = defineEmits(['select']);

const rowClasses = computed(() => [
  'sidebar-item',
  props.rowClass,
  { selected: props.selected }
]);

const formattedCount = computed(() => formatCount(props.count));
</script>

<style scoped>
.sidebar-item {
  margin-left: 12px;
  margin-right: 12px;
  margin-top: 4px;
  border-radius: 6px;
  cursor: pointer;
  padding: 4px 4px 4px 12px;
  display: flex;
  align-items: center;
  color: var(--text-primary);
  background-color: var(--bg-secondary);
  transition: background-color 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
}

.sidebar-item.selected {
  color: var(--color-primary);
  background-color: var(--color-primary-soft);
  box-shadow: none;
}

.sidebar-item.sidebar-refresh-alert {
  color: var(--color-danger-strong);
  background-color: var(--color-danger-soft);
}

.sidebar-item.sidebar-refresh-alert:hover {
  background-color: var(--color-danger-soft);
}

.sidebar-refresh-alert .sidebar-count {
  color: inherit;
}

.sidebar-icon {
  margin-right: 5px;
  min-width: 13px;
  flex: 0 0 auto;
}

/* This adjusts the All feeds status icons without changing tag or smart-folder rows. */
.sidebar-status-item .sidebar-icon {
  margin-top: -1px;
}

.sidebar-status-item .sidebar-item-title {
  color: var(--text-primary);
}

.sidebar-status-item.selected .sidebar-item-title {
  color: var(--color-primary);
}

.sidebar-count-wrapper {
  margin-left: auto;
  padding-left: 8px;
  padding-right: 4px;
  flex: 0 0 auto;
}

.sidebar-count {
  color: var(--text-primary);
  font-weight: 500;
}

.sidebar-item.selected .sidebar-count {
  color: var(--color-primary);
}

.sidebar-count.sidebar-count-white {
  color: inherit;
  background-color: var(--color-transparent);
}

.sidebar-item-title {
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  flex: 1 1 auto;
  min-width: 0;
}

.icon-star { color: var(--icon-star); }
.icon-hot { color: var(--icon-hot); }

.selected .icon-star,
.selected .icon-hot {
  color: var(--color-primary);
}

:global(:root[data-theme='dark']) {
  .sidebar-item {
    background-color: var(--bg-option);
  }

  .sidebar-item.selected {
    color: var(--text-inverted);
    background-color: var(--bg-selected);
  }

  .sidebar-item.selected .sidebar-count,
  .selected .icon-star,
  .selected .icon-hot {
    color: var(--text-inverted);
  }

  .sidebar-item.sidebar-refresh-alert {
    color: var(--color-danger-border);
    background-color: var(--sidebar-danger-surface-dark);
  }

  .sidebar-item.sidebar-refresh-alert:hover {
    background-color: var(--sidebar-warning-surface-dark);
  }
}

:global(:root[data-theme='dark']) .sidebar-item {
  background-color: var(--bg-option);
}

:global(:root[data-theme='dark'] .sidebar-item.sidebar-refresh-alert) {
  color: var(--color-danger-border);
  background-color: var(--sidebar-danger-surface-dark);
}

:global(:root[data-theme='dark'] .sidebar-item.sidebar-refresh-alert:hover) {
  background-color: var(--sidebar-warning-surface-dark);
}

:global(:root[data-theme='dark'] .sidebar-item.sidebar-tag-item.selected) {
  color: var(--text-inverted) !important;
  background-color: var(--bg-selected) !important;
}

:global(:root[data-theme='dark'] .sidebar-item.sidebar-tag-item.selected .sidebar-count) {
  color: var(--text-inverted) !important;
}

:global(:root[data-theme='dark'] .sidebar-item.sidebar-all-categories-item.selected) {
  color: var(--text-inverted) !important;
  background-color: var(--bg-selected) !important;
}

:global(:root[data-theme='dark'] .sidebar-item.sidebar-all-categories-item.selected .sidebar-count) {
  color: var(--text-inverted) !important;
}

:global(:root[data-theme='dark'] .sidebar-item.sidebar-status-item.selected) {
  color: var(--text-inverted) !important;
  background-color: var(--bg-selected) !important;
}

:global(:root[data-theme='dark'] .sidebar-item.sidebar-status-item.selected .sidebar-count) {
  color: var(--text-inverted) !important;
}

:global(:root[data-theme='dark'] .sidebar-item.sidebar-status-item.selected .sidebar-item-title),
:global(:root[data-theme='dark'] .sidebar-item.sidebar-status-item.selected .sidebar-icon) {
  color: var(--text-inverted) !important;
}

:global(:root[data-theme='dark']) .sidebar-scroll .sidebar-item.sidebar-status-item.selected {
  color: var(--text-inverted) !important;
  background-color: var(--bg-selected) !important;
  background-image: none !important;
}

:global(:root[data-theme='dark']) .sidebar-scroll .sidebar-item.sidebar-tag-item.selected {
  color: var(--text-inverted) !important;
  background-color: var(--bg-selected) !important;
  background-image: none !important;
}

:global(:root[data-theme='dark']) .sidebar-scroll .sidebar-item.sidebar-status-item.selected .sidebar-count,
:global(:root[data-theme='dark']) .sidebar-scroll .sidebar-item.sidebar-status-item.selected .sidebar-count.sidebar-count-white,
:global(:root[data-theme='dark']) .sidebar-scroll .sidebar-item.sidebar-status-item.selected .sidebar-count-wrapper,
:global(:root[data-theme='dark']) .sidebar-scroll .sidebar-item.sidebar-status-item.selected .sidebar-item-title,
:global(:root[data-theme='dark']) .sidebar-scroll .sidebar-item.sidebar-status-item.selected .sidebar-icon,
:global(:root[data-theme='dark']) .sidebar-scroll .sidebar-item.sidebar-tag-item.selected .sidebar-count,
:global(:root[data-theme='dark']) .sidebar-scroll .sidebar-item.sidebar-tag-item.selected .sidebar-count.sidebar-count-white,
:global(:root[data-theme='dark']) .sidebar-scroll .sidebar-item.sidebar-tag-item.selected .sidebar-count-wrapper,
:global(:root[data-theme='dark']) .sidebar-scroll .sidebar-item.sidebar-tag-item.selected .sidebar-item-title,
:global(:root[data-theme='dark']) .sidebar-scroll .sidebar-item.sidebar-tag-item.selected .sidebar-icon,
:global(:root[data-theme='dark']) .selected .icon-star,
:global(:root[data-theme='dark']) .selected .icon-hot {
  color: var(--text-inverted) !important;
}

:global(:root[data-theme='dark']) .sidebar-scroll .sidebar-item.sidebar-status-item.selected .sidebar-count.sidebar-count-white {
  background-color: var(--color-transparent) !important;
}

:global(:root[data-theme='dark']) .sidebar-scroll .sidebar-item.sidebar-tag-item.selected .sidebar-count.sidebar-count-white {
  background-color: var(--color-transparent) !important;
}
</style>
