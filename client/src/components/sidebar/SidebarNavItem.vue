<template>
  <div
    :class="rowClasses"
    @click="emit('select')"
  >
    <span class="glyphicon">
      <BootstrapIcon :icon="icon" :class="iconClass" color="currentColor" />
    </span>
    <span class="title">{{ title }}</span>
    <span v-if="count !== null && count !== undefined" class="badge-unread">
      <span class="badge" :class="badgeClass">{{ formattedCount }}</span>
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
  'category-top',
  props.rowClass,
  { selected: props.selected }
]);

const formattedCount = computed(() => formatCount(props.count));
</script>

<style scoped>
.category-top {
  margin-left: 12px;
  margin-right: 12px;
  margin-top: 4px;
  border-radius: 4px;
  cursor: pointer;
  padding: 4px 4px 4px 12px;
  color: var(--text-primary);
  background-color: var(--bg-secondary);
  transition: background-color 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
}

.category-top.selected {
  color: #2A71E7;
  background-color: #EBF2FE;
  box-shadow: none;
}

.glyphicon {
  float: left;
  margin-right: 5px;
  min-width: 13px;
}

/* This adjusts the All feeds status icons without changing tag or smart-folder rows. */
.status-item .glyphicon {
  margin-top: -1px;
}

.status-item .title {
  color: var(--text-primary);
}

.status-item .badge-unread {
  transform: translateY(-1px);
}

.badge-unread {
  float: right;
  position: absolute;
  right: 28px;
  margin-top: -25px;
}

.badge {
  color: var(--text-primary);
  font-weight: 500;
}

.category-top.selected .badge {
  color: #2A71E7;
}

.badge.white {
  float: right;
  color: inherit;
  background-color: transparent;
  margin-top: 3px;
}

.title {
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
  .category-top {
    background-color: var(--bg-option);
  }

  .category-top.selected {
    color: var(--text-inverted);
    background-color: var(--bg-hover);
  }

  .category-top.selected .badge,
  .selected .icon-star,
  .selected .icon-hot {
    color: var(--text-inverted);
  }
}

:global(:root[data-theme='dark']) .category-top {
  background-color: var(--bg-option);
}

:global(:root[data-theme='dark'] .category-top.tag-item.selected) {
  color: var(--text-inverted) !important;
  background-color: var(--bg-hover) !important;
}

:global(:root[data-theme='dark'] .category-top.tag-item.selected .badge) {
  color: var(--text-inverted) !important;
}

:global(:root[data-theme='dark'] .category-top.all-categories.selected) {
  color: var(--text-inverted) !important;
  background-color: var(--bg-hover) !important;
}

:global(:root[data-theme='dark'] .category-top.all-categories.selected .badge) {
  color: var(--text-inverted) !important;
}

:global(:root[data-theme='dark'] .category-top.status-item.selected) {
  color: var(--text-inverted) !important;
  background-color: var(--bg-hover) !important;
}

:global(:root[data-theme='dark'] .category-top.status-item.selected .badge) {
  color: var(--text-inverted) !important;
}

:global(:root[data-theme='dark']) .drag .category-top.status-item.selected {
  color: var(--text-inverted) !important;
  background-color: var(--bg-secondary) !important;
  background-image: none !important;
}

:global(:root[data-theme='dark']) .drag .category-top.tag-item.selected {
  color: var(--text-inverted) !important;
  background-color: var(--bg-secondary) !important;
  background-image: none !important;
}

:global(:root[data-theme='dark']) .drag .category-top.status-item.selected .badge,
:global(:root[data-theme='dark']) .drag .category-top.status-item.selected .badge.white,
:global(:root[data-theme='dark']) .drag .category-top.status-item.selected .badge-unread,
:global(:root[data-theme='dark']) .drag .category-top.status-item.selected .title,
:global(:root[data-theme='dark']) .drag .category-top.status-item.selected .glyphicon,
:global(:root[data-theme='dark']) .drag .category-top.tag-item.selected .badge,
:global(:root[data-theme='dark']) .drag .category-top.tag-item.selected .badge.white,
:global(:root[data-theme='dark']) .drag .category-top.tag-item.selected .badge-unread,
:global(:root[data-theme='dark']) .drag .category-top.tag-item.selected .title,
:global(:root[data-theme='dark']) .drag .category-top.tag-item.selected .glyphicon,
:global(:root[data-theme='dark']) .selected .icon-star,
:global(:root[data-theme='dark']) .selected .icon-hot {
  color: var(--text-inverted) !important;
}

:global(:root[data-theme='dark']) .drag .category-top.status-item.selected .badge.white {
  background-color: transparent !important;
}

:global(:root[data-theme='dark']) .drag .category-top.tag-item.selected .badge.white {
  background-color: transparent !important;
}
</style>
