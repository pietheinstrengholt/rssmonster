<template>
  <div
    class="category-feed"
    :class="feedClasses"
    :id="feed.id"
    @click.stop="emit('select', feed)"
  >
    <span class="glyphicon">
      <img v-if="feed.favicon" :src="feed.favicon" width="16" height="16" alt="" />
      <BootstrapIcon v-else icon="rss-fill" color="currentColor" />
    </span>
    <span class="title">{{ feed.feedName }}</span>
    <span v-if="count !== null && count !== undefined" class="badge-unread">
      <span class="badge white">{{ formattedCount }}</span>
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
.category-feed {
  padding: 4px 4px 4px 12px;
  cursor: pointer;
  color: #4B5563;
  background-color: var(--bg-secondary);
  transition: background-color 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
}

.category-feed.selected {
  color: #2A71E7;
  background-color: #EBF2FE;
  box-shadow: none;
}

.category-feed.error {
  background-color: var(--bg-secondary);
}

.category-feed.selected.error {
  background-color: #EBF2FE;
}

.category-feed.disabled {
  background-color: var(--bg-secondary);
}

.category-feed.selected.disabled {
  color: #2A71E7;
  background-color: #EBF2FE;
}

.category-feed.disabled .title {
  color: inherit;
}

.category-feed.last {
  border-radius: 0px 0px 4px 4px;
}

.category-feed.selected {
  border-radius: 4px;
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

.badge-unread {
  float: right;
  position: absolute;
  right: 28px;
  margin-top: -25px;
}

.badge {
  color: #4B5563;
  font-weight: 500;
}

.category-feed.selected .badge {
  color: #2A71E7;
}

.badge.white {
  float: right;
  color: inherit;
  background-color: transparent;
  margin-top: 3px;
}

.category-feed span.glyphicon img {
  margin-bottom: 2px;
}

@media (prefers-color-scheme: dark) {
  .category-feed {
    background-color: var(--bg-option);
  }

  .category-feed.disabled {
    background-color: var(--bg-option);
  }
}
</style>
