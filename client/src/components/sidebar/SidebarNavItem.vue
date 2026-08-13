<template>
  <button
    type="button"
    :class="rowClasses"
    :aria-current="selected ? 'page' : undefined"
    @click="$emit('select')"
  >
    <span class="sidebar-icon">
      <BootstrapIcon :icon="icon" :class="iconClass" context="control" decorative color="currentColor" />
    </span>
    <span class="sidebar-item-title">{{ title }}</span>
    <span v-if="count !== null && count !== undefined" class="sidebar-count-wrapper">
      <span class="sidebar-count" :class="badgeClass">{{ formattedCount }}</span>
    </span>
  </button>
</template>

<script>
import { formatCount } from './formatCount.js';

export default {
  props: {
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
  },
  emits: ['select'],
  computed: {
    // This combines the base, caller-provided, and selection classes for the row.
    rowClasses() {
      return [
        'sidebar-item',
        this.rowClass,
        { selected: this.selected }
      ];
    },
    // This formats large navigation counts for compact sidebar display.
    formattedCount() {
      return formatCount(this.count);
    }
  }
};
</script>

<style scoped>
.sidebar-item {
  appearance: none;
  width: calc(100% - (2 * var(--space-3)));
  margin-left: var(--space-3);
  margin-right: var(--space-3);
  margin-top: var(--space-1);
  border-radius: var(--radius-compact);
  cursor: pointer;
  box-sizing: border-box;
  min-height: var(--control-height-compact);
  padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
  display: flex;
  align-items: center;
  color: var(--sidebar-row-text);
  background-color: var(--sidebar-row-background);
  border: 0;
  font: inherit;
  text-align: left;
  transition: background-color var(--motion-duration-normal) var(--motion-easing-standard), color var(--motion-duration-normal) var(--motion-easing-standard);
}

.sidebar-item.selected {
  color: var(--sidebar-row-selected-text);
  background-color: var(--sidebar-row-selected-background);
}

.sidebar-item.selected:hover {
  background-color: var(--sidebar-row-selected-hover-background);
}

.sidebar-item:not(.selected):hover {
  background-color: var(--sidebar-row-hover-background);
}

.sidebar-item:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.sidebar-item.sidebar-refresh-alert {
  color: var(--sidebar-row-alert-text);
  background-color: var(--sidebar-row-alert-background);
}

.sidebar-item.sidebar-refresh-alert:hover {
  background-color: var(--sidebar-row-alert-hover-background);
}

.sidebar-refresh-alert .sidebar-count {
  color: inherit;
}

.sidebar-icon {
  align-items: center;
  display: inline-flex;
  justify-content: center;
  line-height: 1;
  margin-right: var(--space-1);
  min-width: 13px;
  flex: 0 0 auto;
}

.sidebar-count-wrapper {
  margin-left: auto;
  padding-left: var(--space-2);
  padding-right: var(--space-1);
  flex: 0 0 auto;
}

.sidebar-count {
  color: inherit;
  font-weight: 500;
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
.icon-clicked { color: currentColor; }
.selected .icon-star,
.selected .icon-hot {
  color: var(--sidebar-row-selected-text);
}
</style>
