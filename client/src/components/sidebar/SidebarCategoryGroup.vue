<template>
  <div
    :id="category.id"
    class="category-main"
    :class="{ selected: isSelectedCategory }"
    @click="emit('select-category', category)"
  >
    <div class="category-sub">
      <span class="glyphicon">
        <BootstrapIcon icon="folder-fill" variant="light" />
      </span>
      <span class="title">{{ category.name }}</span>
      <span class="badge-unread">
        <span v-if="count !== null" class="badge white">{{ count }}</span>
      </span>
    </div>
    <div v-if="category.feeds && isSelectedCategory">
      <div class="category-feeds">
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

function getFeedCount(feed) {
  const value = props.countResolver(feed);
  return value === undefined ? null : value;
}
</script>

<style scoped>
.category-main {
  margin-left: 12px;
  margin-right: 12px;
  margin-top: 4px;
  border-radius: 4px;
  cursor: pointer;
  background-color: var(--color-secondary);
  transition: background-color 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
}

.category-main.selected {
  background-color: var(--color-selected);
  box-shadow: var(--shadow-selected);
}

.category-main.selected .glyphicon {
  color: var(--text-inverted);
}

.category-sub,
.category-feed,
.category-top {
  padding: 4px 4px 4px 12px;
}

.category-sub {
  min-height: 24px;
}

.badge-unread {
  float: right;
  position: absolute;
  right: 28px;
  margin-top: -25px;
}

.badge.white {
  float: right;
  color: var(--text-inverted);
  background-color: transparent;
  margin-top: 3px;
}

.glyphicon {
  float: left;
  margin-right: 5px;
  min-width: 13px;
}

.title {
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  display: block;
  padding-right: 25px;
}

.category-feeds {
  margin-bottom: 0;
}

@media (prefers-color-scheme: dark) {
  .category-main {
    background-color: var(--bg-option-dark);
  }
}
</style>
