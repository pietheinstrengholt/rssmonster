<template>
  <div
    :class="rowClasses"
    @click="emit('select')"
  >
    <span class="glyphicon">
      <BootstrapIcon :icon="icon" :class="iconClass" variant="light" />
    </span>
    <span class="title">{{ title }}</span>
    <span v-if="count !== null && count !== undefined" class="badge-unread">
      <span class="badge" :class="badgeClass">{{ count }}</span>
    </span>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
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
});

const emit = defineEmits(['select']);

const rowClasses = computed(() => [
  'category-top',
  props.rowClass,
  { selected: props.selected }
]);
</script>

<style scoped>
.category-top {
  margin-left: 12px;
  margin-right: 12px;
  margin-top: 4px;
  border-radius: 4px;
  cursor: pointer;
  padding: 4px 4px 4px 12px;
  background-color: var(--color-secondary);
  transition: background-color 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
}

.category-top.selected {
  background-color: var(--color-selected);
  box-shadow: var(--shadow-selected);
}

.category-top.selected .glyphicon {
  color: var(--text-inverted);
}

.tag-item {
  background-color: var(--color-secondary);
}

.refresh-alert {
  background-color: var(--color-danger);
}

.glyphicon {
  float: left;
  margin-right: 5px;
  min-width: 13px;
}

/* This adjusts the All feeds status icons without changing tag or smart-folder rows. */
.status-item .glyphicon {
  margin-top: -1px;
}

.status-item .badge-unread {
  transform: translateY(-1px);
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

.title {
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  display: block;
  padding-right: 25px;
}

.icon-unread { color: var(--icon-unread); }
.icon-star { color: var(--icon-star); }
.icon-hot { color: var(--icon-hot); }
.icon-clicked { color: var(--icon-clicked); }
.icon-read { color: var(--icon-read); }

.selected .icon-unread,
.selected .icon-star,
.selected .icon-hot,
.selected .icon-clicked,
.selected .icon-read {
  color: var(--text-inverted);
}

@media (prefers-color-scheme: dark) {
  .category-top {
    background-color: var(--bg-option-dark);
  }

  .refresh-alert {
    background-color: var(--color-danger);
  }
}
</style>
