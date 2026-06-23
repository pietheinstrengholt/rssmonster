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
  color: var(--text-primary);
  background-color: var(--bg-secondary);
  transition: background-color 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
}

.sidebar-item.selected {
  color: #2A71E7;
  background-color: #EBF2FE;
  box-shadow: none;
}

.sidebar-item.sidebar-refresh-alert {
  color: #991B1B;
  background-color: #FEF2F2;
}

.sidebar-item.sidebar-refresh-alert:hover {
  background-color: #FEE2E2;
}

.sidebar-refresh-alert .sidebar-count {
  color: inherit;
}

.sidebar-icon {
  float: left;
  margin-right: 5px;
  min-width: 13px;
}

/* This adjusts the All feeds status icons without changing tag or smart-folder rows. */
.sidebar-status-item .sidebar-icon {
  margin-top: -1px;
}

.sidebar-status-item .sidebar-item-title {
  color: var(--text-primary);
}

.sidebar-status-item .sidebar-count-wrapper {
  transform: translateY(-1px);
}

.sidebar-count-wrapper {
  float: right;
  position: absolute;
  right: 28px;
  margin-top: -24px;
}

.sidebar-item.sidebar-all-categories-item.selected .sidebar-count-wrapper {
  margin-top: -20px;
}

.sidebar-count {
  color: var(--text-primary);
  font-weight: 500;
}

.sidebar-item.selected .sidebar-count {
  color: #2A71E7;
}

.sidebar-count.sidebar-count-white {
  float: right;
  color: inherit;
  background-color: transparent;
  margin-top: 3px;
}

.sidebar-item-title {
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  display: block;
  padding-right: 25px;
}

.icon-star { color: var(--icon-star); }
.icon-hot { color: var(--icon-hot); }

.selected .icon-star,
.selected .icon-hot {
  color: #2A71E7;
}

@media (prefers-color-scheme: dark) {
  .sidebar-item {
    background-color: var(--bg-option);
  }

  .sidebar-item.selected {
    color: var(--text-inverted);
    background-color: var(--bg-hover);
  }

  .sidebar-item.selected .sidebar-count,
  .selected .icon-star,
  .selected .icon-hot {
    color: var(--text-inverted);
  }

  .sidebar-item.sidebar-refresh-alert {
    color: #FECACA;
    background-color: #2B1B1E;
  }

  .sidebar-item.sidebar-refresh-alert:hover {
    background-color: #3A2328;
  }
}

:global(:root[data-theme='dark']) .sidebar-item {
  background-color: var(--bg-option);
}

:global(:root[data-theme='dark'] .sidebar-item.sidebar-refresh-alert) {
  color: #FECACA;
  background-color: #2B1B1E;
}

:global(:root[data-theme='dark'] .sidebar-item.sidebar-refresh-alert:hover) {
  background-color: #3A2328;
}

:global(:root[data-theme='dark'] .sidebar-item.sidebar-tag-item.selected) {
  color: var(--text-inverted) !important;
  background-color: var(--bg-hover) !important;
}

:global(:root[data-theme='dark'] .sidebar-item.sidebar-tag-item.selected .sidebar-count) {
  color: var(--text-inverted) !important;
}

:global(:root[data-theme='dark'] .sidebar-item.sidebar-all-categories-item.selected) {
  color: var(--text-inverted) !important;
  background-color: var(--bg-hover) !important;
}

:global(:root[data-theme='dark'] .sidebar-item.sidebar-all-categories-item.selected .sidebar-count) {
  color: var(--text-inverted) !important;
}

:global(:root[data-theme='dark'] .sidebar-item.sidebar-status-item.selected) {
  color: var(--text-inverted) !important;
  background-color: var(--bg-hover) !important;
}

:global(:root[data-theme='dark'] .sidebar-item.sidebar-status-item.selected .sidebar-count) {
  color: var(--text-inverted) !important;
}

:global(:root[data-theme='dark']) .sidebar-scroll .sidebar-item.sidebar-status-item.selected {
  color: var(--text-inverted) !important;
  background-color: var(--bg-secondary) !important;
  background-image: none !important;
}

:global(:root[data-theme='dark']) .sidebar-scroll .sidebar-item.sidebar-tag-item.selected {
  color: var(--text-inverted) !important;
  background-color: var(--bg-secondary) !important;
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
  background-color: transparent !important;
}

:global(:root[data-theme='dark']) .sidebar-scroll .sidebar-item.sidebar-tag-item.selected .sidebar-count.sidebar-count-white {
  background-color: transparent !important;
}
</style>
