<template>
  <button
    type="button"
    class="sidebar-feed"
    :class="feedClasses"
    :id="feed.id"
    :aria-current="selected ? 'page' : undefined"
    @click.stop="$emit('select', feed)"
  >
    <span class="sidebar-icon">
      <img v-if="feed.favicon" :src="feed.favicon" width="16" height="16" alt="" />
      <BootstrapIcon v-else icon="rss-fill" color="currentColor" />
    </span>
    <span class="sidebar-item-title" :class="{ last }">{{ feed.feedName }}</span>
    <span v-if="count !== null && count !== undefined" class="sidebar-count-wrapper">
      <span class="sidebar-count sidebar-count-white">{{ formattedCount }}</span>
    </span>
  </button>
</template>

<script>
import { formatCount } from './formatCount.js';

export default {
  props: {
    feed: {
      type: Object,
      required: true
    },
    selected: {
      type: Boolean,
      default: false
    },
    count: {
      type: [String, Number],
      default: null
    },
    last: {
      type: Boolean,
      default: false
    }
  },
  emits: ['select'],
  computed: {
    // This returns feed state classes used for selection and health indicators.
    feedClasses() {
      return {
        selected: this.selected,
        error: this.feed.status === 'error',
        disabled: this.feed.status === 'disabled',
        last: this.last
      };
    },
    // This formats large feed counts for compact sidebar display.
    formattedCount() {
      return formatCount(this.count);
    }
  }
};
</script>

<style scoped>
.sidebar-feed {
  appearance: none;
  box-sizing: border-box;
  min-height: var(--control-height-compact);
  padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
  display: flex;
  align-items: center;
  cursor: pointer;
  color: var(--sidebar-row-text);
  background-color: var(--sidebar-row-background);
  border: 0;
  font: inherit;
  text-align: left;
  width: 100%;
  transition: background-color var(--motion-duration-normal) var(--motion-easing-standard), color var(--motion-duration-normal) var(--motion-easing-standard);
}

.sidebar-feed.selected {
  color: var(--sidebar-row-selected-text);
  background-color: var(--sidebar-row-selected-background);
}

.sidebar-feed:not(.selected):hover {
  background-color: var(--sidebar-row-hover-background);
}

.sidebar-feed:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.sidebar-feed.error {
  color: var(--sidebar-row-error-text);
  background-color: var(--sidebar-row-error-background);
}

.sidebar-feed.selected.error {
  color: var(--sidebar-row-selected-text);
  background-color: var(--sidebar-row-selected-background);
}

.sidebar-feed.disabled {
  color: var(--sidebar-row-disabled-text);
  background-color: var(--sidebar-row-disabled-background);
}

.sidebar-feed.selected.disabled {
  color: var(--sidebar-row-selected-text);
  background-color: var(--sidebar-row-selected-background);
}

.sidebar-feed.selected:hover {
  background-color: var(--sidebar-row-selected-hover-background);
}

.sidebar-feed.disabled .sidebar-item-title {
  color: inherit;
}

.sidebar-feed.last {
  border-radius: 0 0 var(--radius-compact) var(--radius-compact);
}

.sidebar-feed.selected {
  border-radius: 0;
}

.sidebar-icon {
  margin-right: var(--space-1);
  min-width: 13px;
  flex: 0 0 auto;
}

.sidebar-item-title {
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  flex: 1 1 auto;
  min-width: 0;
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

.sidebar-feed span.sidebar-icon img {
  margin-bottom: 2px;
}

</style>
