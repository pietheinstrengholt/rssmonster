<template>
  <div
    class="category-feed"
    :class="feedClasses"
    :id="feed.id"
    @click.stop="emit('select', feed)"
  >
    <span class="glyphicon">
      <img v-if="feed.favicon" :src="feed.favicon" width="16" height="16" alt="" />
      <BootstrapIcon v-else icon="rss-fill" variant="light" />
    </span>
    <span class="title">{{ feed.feedName }}</span>
    <span v-if="count !== null && count !== undefined" class="badge-unread">
      <span class="badge white">{{ count }}</span>
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue';

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
</script>

<style scoped>
.category-feed {
  padding: 4px 4px 4px 12px;
  margin-left: 12px;
  margin-right: 12px;
  margin-top: 4px;
  border-radius: 4px;
  cursor: pointer;
  background-color: var(--color-secondary);
  transition: background-color 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
}

.category-feed.selected {
  background-color: var(--color-selected);
  box-shadow: var(--shadow-selected);
}

.category-feed.error,
.category-feed.selected.error {
  background-color: var(--color-success);
}

.category-feed.disabled {
  background-color: var(--color-disabled);
}

.category-feed.selected.disabled {
  background-color: var(--bg-selected);
}

.category-feed.disabled .title {
  color: var(--text-disabled);
}

.category-feed.selected.disabled .title {
  color: var(--color-disabled);
}

.category-feed.last {
  border-radius: 0px 0px 4px 4px;
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

.badge.white {
  float: right;
  color: var(--text-inverted);
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
    background-color: var(--color-disabled);
  }
}
</style>
