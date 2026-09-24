<template>
  <div class="sidebar-feed" :class="feedClasses">
    <button
      type="button"
      class="sidebar-feed-select"
      :id="shortcut ? `pinned-feed-${feed.id}` : feed.id"
      :aria-current="selected ? 'page' : undefined"
      @click.stop="$emit('select', feed)"
    >
      <span v-if="showFeedFavicons" class="sidebar-icon">
        <img v-if="feed.favicon" :src="feed.favicon" width="16" height="16" alt="" />
        <BootstrapIcon v-else icon="rss-fill" context="control" color="currentColor" />
      </span>
      <span class="sidebar-item-title" :class="{ last }"><span class="sidebar-item-title-text">{{ feed.feedName }}</span></span>
      <span v-if="count !== null && count !== undefined" class="sidebar-count-wrapper">
        <span class="sidebar-count sidebar-count-white"><span class="sidebar-count-value">{{ formattedCount }}</span></span>
      </span>
    </button>
  </div>
</template>

<script>
import { formatCount } from './formatCount.js';

export default {
  props: {
    shortcut: { type: Boolean, default: false },
    showFeedFavicons: { type: Boolean, default: true },
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
        'sidebar-feed--shortcut': this.shortcut,
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
  padding: 0;
  display: flex;
  align-items: center;
  cursor: pointer;
  color: var(--sidebar-row-text);
  background-color: var(--color-transparent);
  border: 0;
  font: inherit;
  text-align: left;
  width: 100%;
  transition: background-color var(--motion-duration-normal) var(--motion-easing-standard), color var(--motion-duration-normal) var(--motion-easing-standard);
}

.sidebar-feed-select {
  display: flex;
  align-items: center;
  flex: 1 1 auto;
  min-width: 0;
  min-height: var(--control-height-compact);
  padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
  border: 0;
  background: var(--color-transparent);
  color: inherit;
  font: inherit;
  line-height: 1.25;
  text-align: left;
  cursor: pointer;
}


.sidebar-feed.selected {
  color: var(--sidebar-row-selected-text);
  background-color: var(--sidebar-row-selected-background);
}

.sidebar-feed:not(.selected):hover {
  background-color: var(--sidebar-row-hover-background);
}

.sidebar-feed-select:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.sidebar-feed.error {
  color: var(--sidebar-row-error-text);
}

.sidebar-feed.selected.error {
  color: var(--sidebar-row-selected-text);
  background-color: var(--sidebar-row-selected-background);
}

.sidebar-feed.disabled {
  color: var(--sidebar-row-disabled-text);
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

.sidebar-feed.sidebar-feed--shortcut {
  width: calc(100% - (2 * var(--space-3)));
  margin: var(--space-1) var(--space-3) 0;
  border-radius: var(--radius-compact);
}

.sidebar-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  margin-right: var(--space-1);
  min-width: 13px;
  flex: 0 0 auto;
}

.sidebar-item-title {
  display: flex;
  align-items: center;
  min-height: 1.25em;
  line-height: 1.5;
  flex: 1 1 auto;
  min-width: 0;
}

.sidebar-item-title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-count-wrapper {
  display: flex;
  align-items: center;
  line-height: inherit;
  margin-left: auto;
  padding-left: var(--space-2);
  padding-right: var(--space-1);
  flex: 0 0 auto;
}

.sidebar-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.25em;
  line-height: 1.5;
  white-space: nowrap;
  color: var(--text-secondary);
  font-weight: 500;
}

.sidebar-feed.selected .sidebar-count {
  color: var(--sidebar-row-selected-text);
}

.sidebar-count.sidebar-count-white {
  background-color: var(--color-transparent);
}

</style>
