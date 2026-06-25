<template>
  <div
    :id="category.id"
    class="sidebar-category"
    :class="{ selected: isSelectedCategory }"
    @click="emit('select-category', category)"
  >
    <div class="sidebar-category-header">
      <span class="sidebar-icon">
        <BootstrapIcon :icon="categoryIconName" color="currentColor" />
      </span>
      <span class="sidebar-item-title">{{ category.name }}</span>
      <span class="sidebar-count-wrapper">
        <span v-if="count !== null" class="sidebar-count sidebar-count-white">{{ formattedCount }}</span>
      </span>
    </div>
    <div v-if="category.feeds && isExpanded">
      <div class="sidebar-feed-list">
        <SidebarFeedItem
          v-for="(feed, index) in category.feeds"
          :key="feed.id"
          :feed="feed"
          :selected="selectedFeedId == feed.id"
          :count="getFeedCount(feed)"
          :last="index === category.feeds.length - 1"
          @select="emit('select-feed', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import SidebarFeedItem from './SidebarFeedItem.vue';
import { formatCount } from './formatCount.js';

const CATEGORY_ICON_NAMES = new Set([
  'folder-fill',
  'newspaper',
  'cpu-fill',
  'robot',
  'file-code-fill',
  'cloud-fill',
  'shield-lock-fill',
  'diagram-3-fill',
  'bar-chart-fill',
  'briefcase-fill',
  'graph-up-arrow',
  'piggy-bank-fill',
  'heart-pulse-fill',
  'mortarboard-fill',
  'controller',
  'trophy-fill',
  'camera-reels-fill',
  'music-note-beamed',
  'book-fill',
  'compass-fill',
  'tools',
  'rss-fill',
  'megaphone-fill',
  'chat-square-text-fill'
]);

const props = defineProps({
  category: {
    type: Object,
    required: true
  },
  selectedCategoryId: {
    type: [String, Number],
    required: true
  },
  selectedFeedId: {
    type: [String, Number],
    required: true
  },
    countResolver: {
      type: Function,
      required: true
    },
  count: {
    type: [String, Number],
    default: null
  }
});

const emit = defineEmits(['select-category', 'select-feed']);

const isSelectedCategory = computed(() => props.selectedCategoryId == props.category.id && props.selectedFeedId === '%');
const isExpanded = computed(() => props.selectedCategoryId == props.category.id);
const formattedCount = computed(() => formatCount(props.count));
const categoryIconName = computed(() => CATEGORY_ICON_NAMES.has(props.category.iconName)
  ? props.category.iconName
  : 'folder-fill'
);

function getFeedCount(feed) {
  const value = props.countResolver(feed);
  return value === undefined ? null : value;
}
</script>

<style scoped>
.sidebar-category {
  margin-left: 12px;
  margin-right: 12px;
  margin-top: 4px;
  border-radius: 6px;
  cursor: pointer;
  color: var(--text-primary);
  background-color: var(--bg-secondary);
  transition: background-color 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
}

.sidebar-category.selected {
  color: var(--color-primary-action);
  background-color: var(--color-primary-soft);
  box-shadow: none;
}

.sidebar-category-header {
  padding: 4px 4px 4px 12px;
  display: flex;
  align-items: center;
}

.sidebar-category-header {
  min-height: 24px;
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

.sidebar-category.selected .sidebar-count {
  color: var(--color-primary-action);
}

.sidebar-count.sidebar-count-white {
  color: inherit;
  background-color: var(--color-transparent);
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

.sidebar-feed-list {
  margin-bottom: 0;
}

.sidebar-category.selected :deep(.sidebar-feed.last) {
  border-radius: 0 0 6px 6px;
}

.sidebar-category.selected .sidebar-feed-list,
.sidebar-category.selected :deep(.sidebar-feed) {
  background-color: var(--color-primary-soft);
}

.sidebar-category.selected .sidebar-feed-list {
  border-radius: 0 0 6px 6px;
  overflow: hidden;
}

:global(:root[data-theme='dark']) {
  .sidebar-category {
    background-color: var(--bg-option);
  }

  .sidebar-category.selected {
    color: var(--text-inverted);
    background-color: var(--bg-selected);
  }

  .sidebar-category.selected .sidebar-count {
    color: var(--text-inverted);
  }

  .sidebar-category.selected .sidebar-feed-list,
  .sidebar-category.selected :deep(.sidebar-feed) {
    background-color: var(--bg-selected);
  }
}

:global(:root[data-theme='dark'] .sidebar-category.selected) {
  color: var(--text-inverted) !important;
  background-color: var(--bg-selected) !important;
}

:global(:root[data-theme='dark'] .sidebar-category.selected .sidebar-count) {
  color: var(--text-inverted) !important;
}

:global(:root[data-theme='dark'] .sidebar-category.selected .sidebar-feed-list),
:global(:root[data-theme='dark'] .sidebar-category.selected .sidebar-feed) {
  background-color: var(--bg-selected) !important;
}
</style>
