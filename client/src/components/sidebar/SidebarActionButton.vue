<template>
  <div :class="buttonClasses" @click="emit('select')">
    <div>
      <span class="glyphicon">
        <BootstrapIcon :icon="icon" color="currentColor" />
      </span>
      <div class="text">{{ label }}</div>
      <span v-if="loading" class="spinner">
        <BootstrapIcon icon="arrow-repeat" color="currentColor" animation="spin" />
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  icon: {
    type: String,
    required: true
  },
  label: {
    type: String,
    required: true
  },
  variant: {
    type: [String, Array, Object],
    default: 'sidebar-option'
  },
  loading: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['select']);

const buttonClasses = computed(() => [props.variant]);
</script>

<style scoped>
.option,
.sidebar-option {
  margin-left: 12px;
  padding: 6px;
  color: var(--text-primary);
  background-color: var(--bg-secondary);
  border-radius: 8px;
  text-indent: 4px;
  margin-bottom: 20px;
  cursor: pointer;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.option {
  box-sizing: border-box;
  width: calc(100% - 24px);
  height: 36px;
  margin-bottom: 8px;
  padding: 0 12px;
  border: 1px solid transparent;
  display: flex;
  align-items: center;
  font-weight: 500;
}

.option > div {
  display: flex;
  align-items: center;
}

.option .text {
  margin-left: 5px;
}

.spinner {
  margin-left: 6px;
  margin-top: -2px;
}

.refresh,
.addnew { width: calc(100% - 24px); }

.refresh {
  color: #FFFFFF;
  background-color: #2563EB;
}

.refresh:hover {
  background-color: #1D4ED8;
}

.addnew {
  color: #0E6522;
  background-color: #FFFFFF;
  border-color: #E7EAF0;
}

.mark-as-read {
  color: #374151;
  background-color: #FFFFFF;
  border-color: #E7EAF0;
}

.sidebar-option {
  margin-left: 0;
  height: 44px;
  color: #4B5563;
  font-weight: 500;
  box-sizing: border-box;
  width: 72px;
  float: left;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
}

.sidebar-option > div {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1;
  transform: translateY(2px);
}

.option .glyphicon,
.sidebar-option .glyphicon {
  float: left;
  min-width: 13px;
}

.option .glyphicon {
  margin-top: -2px;
}

.sidebar-option .text {
  font-size: 13px;
}

.sidebar-option.delete,
.sidebar-option.rename {
  color: #4B5563;
}

@media (prefers-color-scheme: dark) {
  .sidebar-option {
    color: var(--text-inverted);
    background-color: var(--bg-secondary);
  }

  .sidebar-option :deep(svg) {
    fill: var(--text-inverted);
  }
}
</style>
