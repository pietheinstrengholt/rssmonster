<template>
  <div
    :id="shortcut ? `pinned-category-${category.id}` : category.id"
    class="sidebar-category"
    :class="{ expanded: isExpanded, selected: isSelectedCategory }"
  >
    <div class="sidebar-category-header">
      <button
        type="button"
        class="sidebar-category-select"
        :aria-current="isSelectedCategory ? 'page' : undefined"
        :aria-expanded="collapsible ? isExpanded : undefined"
        @click="collapsible ? $emit('toggle-expansion') : $emit('select-category', category)"
      >
        <span class="sidebar-icon">
          <BootstrapIcon :icon="categoryIconName" context="control" decorative color="currentColor" />
        </span>
        <span class="sidebar-item-title"><span class="sidebar-item-title-text">{{ category.name }}</span></span>
        <span class="sidebar-count-wrapper">
          <span v-if="count !== null" class="sidebar-count sidebar-count-white"><span class="sidebar-count-value">{{ formattedCount }}</span></span>
        </span>
      </button>
    </div>
    <div v-if="category.feeds && isExpanded">
      <div class="sidebar-feed-list">
        <SidebarFeedItem
          v-for="(feed, index) in category.feeds"
          :key="feed.id"
          :feed="feed"
          :show-feed-favicons="showFeedFavicons"
          :selected="selectedFeedId == feed.id"
          :count="getFeedCount(feed)"
          :last="index === category.feeds.length - 1"
          @select="$emit('select-feed', $event)"
        />
      </div>
    </div>
  </div>
</template>

<script>
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

export default {
  components: {
    SidebarFeedItem
  },
  props: {
    shortcut: { type: Boolean, default: false },
    showFeedFavicons: { type: Boolean, default: true },
    collapsible: { type: Boolean, default: false },
    expanded: { type: Boolean, default: false },
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
  },
  emits: ['select-category', 'select-feed', 'toggle-expansion'],
  computed: {
    // This indicates that the category itself, rather than one of its feeds, is selected.
    isSelectedCategory() {
      return !this.collapsible && this.selectedCategoryId == this.category.id && this.selectedFeedId === '%';
    },
    // This expands the feed list for the currently selected category.
    isExpanded() {
      if (this.shortcut) return false;
      return this.collapsible ? this.expanded : this.selectedCategoryId == this.category.id;
    },
    // This formats large category counts for compact sidebar display.
    formattedCount() {
      return formatCount(this.count);
    },
    // This falls back to the standard folder icon for unsupported category icons.
    categoryIconName() {
      if (this.collapsible) return this.isExpanded ? 'chevron-down' : 'chevron-right';
      return CATEGORY_ICON_NAMES.has(this.category.iconName)
        ? this.category.iconName
        : 'folder-fill';
    }
  },
  methods: {
    // This resolves the active-status count for a feed.
    getFeedCount(feed) {
      const value = this.countResolver(feed);
      return value === undefined ? null : value;
    }
  }
};
</script>

<style scoped>
.sidebar-category {
  margin-left: var(--space-3);
  margin-right: var(--space-3);
  margin-top: var(--space-1);
  border-radius: var(--radius-compact);
  cursor: pointer;
  color: var(--sidebar-row-text);
  background-color: var(--color-transparent);
}

.sidebar-category.expanded {
  overflow: hidden;
}

.sidebar-category.selected > .sidebar-category-header {
  border-radius: var(--radius-compact);
  color: var(--sidebar-row-selected-text);
  background-color: var(--sidebar-row-selected-background);
}

.sidebar-category.selected > .sidebar-category-header:hover {
  background-color: var(--sidebar-row-selected-hover-background);
}

.sidebar-category:not(.selected) > .sidebar-category-header:hover {
  background-color: var(--sidebar-row-hover-background);
}

.sidebar-category-select:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.sidebar-category-header {
  appearance: none;
  background: var(--color-transparent);
  border: 0;
  border-radius: var(--radius-compact);
  box-sizing: border-box;
  color: inherit;
  cursor: pointer;
  font: inherit;
  min-height: var(--control-height-compact);
  padding: 0;
  display: flex;
  align-items: center;
  text-align: left;
  width: 100%;
  transition: background-color var(--motion-duration-normal) var(--motion-easing-standard), color var(--motion-duration-normal) var(--motion-easing-standard);
}

.sidebar-category.expanded > .sidebar-category-header {
  border-radius: var(--radius-compact) var(--radius-compact) 0 0;
}

.sidebar-category-select {
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
  line-height: 1;
  white-space: nowrap;
  color: var(--text-secondary);
  font-weight: 500;
}

.sidebar-category.selected > .sidebar-category-header .sidebar-count {
  color: var(--sidebar-row-selected-text);
}

.sidebar-count.sidebar-count-white {
  background-color: var(--color-transparent);
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
  line-height: 1;
  flex: 1 1 auto;
  min-width: 0;
}

.sidebar-item-title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-feed-list {
  margin-bottom: 0;
}

</style>
