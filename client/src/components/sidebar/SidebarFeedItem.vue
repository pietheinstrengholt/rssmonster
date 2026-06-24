<template>
  <div
    class="sidebar-feed"
    :class="feedClasses"
    :id="feed.id"
    @click.stop="emit('select', feed)"
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

<script setup>
import { computed } from 'vue';
import { formatCount } from './formatCount.js';

const props = defineProps({
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
});

const emit = defineEmits(['select']);

const feedClasses = computed(() => ({
  selected: props.selected,
  error: props.feed.status === 'error',
  disabled: props.feed.status === 'disabled',
  last: props.last
}));

const formattedCount = computed(() => formatCount(props.count));
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
  color: #2A71E7;
  background-color: #EBF2FE;
  box-shadow: none;
}

.sidebar-feed.error {
  background-color: var(--bg-secondary);
}

.sidebar-feed.selected.error {
  background-color: #EBF2FE;
}

.sidebar-feed.disabled {
  background-color: var(--bg-secondary);
}

.sidebar-feed.selected.disabled {
  color: #2A71E7;
  background-color: #EBF2FE;
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
  color: #2A71E7;
}

.sidebar-count.sidebar-count-white {
  color: inherit;
  background-color: transparent;
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
    color: var(--text-inverted);
    background-color: var(--bg-selected);
  }

  .sidebar-feed.selected .sidebar-count {
    color: var(--text-inverted);
  }
}

:global(:root[data-theme='dark'] .sidebar-feed.selected) {
  color: var(--text-inverted) !important;
  background-color: var(--bg-selected) !important;
}

:global(:root[data-theme='dark'] .sidebar-feed.selected .sidebar-count) {
  color: var(--text-inverted) !important;
}
</style>
