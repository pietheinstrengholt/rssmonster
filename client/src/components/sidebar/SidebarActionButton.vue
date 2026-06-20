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
  color: var(--text-inverted);
  border-radius: 4px;
  text-indent: 4px;
  margin-bottom: 20px;
  cursor: pointer;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.option {
  background-color: var(--color-primary);
  width: 170px;
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
.addnew {
  background-color: var(--color-primary);
  width: 170px;
}

.sidebar-option {
  margin-left: 8%;
  height: 44px;
  color: var(--text-primary);
  width: 42px;
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

.mark-as-read {
  background-color: var(--color-selected);
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
  color: var(--text-primary);
}

@media (prefers-color-scheme: dark) {
  .option {
    background-color: var(--bg-option-dark);
  }

  .refresh,
  .addnew {
    background-color: var(--bg-option-dark);
  }

  .mark-as-read {
    background-color: var(--bg-selected-dark);
  }

  .sidebar-option {
    color: var(--text-inverted);
    background-color: var(--bg-sidebar-option-dark);
  }

  .sidebar-option :deep(svg) {
    fill: var(--text-inverted);
  }
}
</style>
