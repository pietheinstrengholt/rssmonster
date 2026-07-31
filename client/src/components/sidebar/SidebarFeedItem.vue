<template>
  <div
    class="sidebar-feed"
    :class="feedClasses"
    :id="feed.id"
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
  </div>
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
  padding: 4px 4px 4px 12px;
  display: flex;
  align-items: center;
  cursor: pointer;
  color: var(--text-primary);
  background-color: var(--bg-secondary);
  transition: background-color 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
}

.sidebar-feed.selected {
  color: var(--color-primary);
  background-color: var(--color-primary-soft);
  box-shadow: none;
}

.sidebar-feed:not(.selected):hover {
  background-color: var(--bg-hover);
}

.sidebar-feed.error {
  background-color: var(--bg-secondary);
}

.sidebar-feed.selected.error {
  background-color: var(--color-primary-soft);
}

.sidebar-feed.disabled {
  background-color: var(--bg-secondary);
}

.sidebar-feed.selected.disabled {
  color: var(--color-primary);
  background-color: var(--color-primary-soft);
}

.sidebar-feed.disabled .sidebar-item-title {
  color: inherit;
}

.sidebar-feed.last {
  border-radius: 0px 0px 4px 4px;
}

.sidebar-feed.selected {
  border-radius: 6px;
}

.sidebar-icon {
  margin-right: 5px;
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
  padding-left: 8px;
  padding-right: 4px;
  flex: 0 0 auto;
}

.sidebar-count {
  color: var(--text-primary);
  font-weight: 500;
}

.sidebar-feed.selected .sidebar-count {
  color: var(--color-primary);
}

.sidebar-count.sidebar-count-white {
  color: inherit;
  background-color: var(--color-transparent);
}

.sidebar-feed span.sidebar-icon img {
  margin-bottom: 2px;
}

:global(:root[data-theme='dark']) {
  .sidebar-feed {
    background-color: var(--bg-option);
  }

  .sidebar-feed.disabled {
    background-color: var(--bg-option);
  }

  .sidebar-feed.selected,
  .sidebar-feed.selected.error,
  .sidebar-feed.selected.disabled {
    color: var(--sidebar-selected-text-dark);
    background-color: var(--sidebar-selected-background-dark);
  }

  .sidebar-feed.selected .sidebar-count {
    color: var(--sidebar-selected-text-dark);
  }
}

:global(:root[data-theme='dark'] .sidebar-feed.selected) {
  color: var(--sidebar-selected-text-dark) !important;
  background-color: var(--sidebar-selected-background-dark) !important;
}

:global(:root[data-theme='dark'] .sidebar-feed:not(.selected):hover) {
  background-color: var(--toolbar-search-hover-background-dark);
}

:global(:root[data-theme='dark'] .sidebar-feed.selected .sidebar-count) {
  color: var(--sidebar-selected-text-dark) !important;
}
</style>
