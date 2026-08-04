<template>
  <div class="category-icon-picker" role="radiogroup" :aria-label="groupLabel">
    <button
      v-for="(icon, index) in iconOptions"
      :key="icon.name"
      ref="iconButtons"
      type="button"
      class="category-icon-picker__option"
      :class="{ 'category-icon-picker__option--selected': selectedIconName === icon.name }"
      role="radio"
      :aria-checked="selectedIconName === icon.name"
      :aria-label="icon.label"
      :title="icon.label"
      :tabindex="disabled ? -1 : (selectedIconName === icon.name ? 0 : -1)"
      :disabled="disabled"
      @click="selectIcon(icon.name)"
      @keydown="handleKeydown($event, index)"
    >
      <BootstrapIcon :icon="icon.name" color="currentColor" />
    </button>
  </div>
</template>

<script>
import {
  CATEGORY_ICON_OPTIONS,
  DEFAULT_CATEGORY_ICON
} from './categoryIconOptions.js';

export default {
  name: 'CategoryIconPicker',
  props: {
    modelValue: {
      type: String,
      default: DEFAULT_CATEGORY_ICON
    },
    groupLabel: {
      type: String,
      default: 'Category icon'
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:modelValue'],
  // This function exposes the shared icon catalogue to the picker template.
  data() {
    return {
      iconOptions: CATEGORY_ICON_OPTIONS
    };
  },
  computed: {
    // This function displays the established folder fallback for unsupported icon values.
    selectedIconName() {
      return this.iconOptions.some((icon) => icon.name === this.modelValue)
        ? this.modelValue
        : DEFAULT_CATEGORY_ICON;
    }
  },
  methods: {
    // This function publishes an explicit icon selection through the v-model contract.
    selectIcon(iconName) {
      if (this.disabled) return;

      this.$emit('update:modelValue', iconName);
    },
    // This function supports standard radio-group Arrow, Home, and End navigation.
    handleKeydown(event, currentIndex) {
      if (this.disabled) return;

      const lastIndex = this.iconOptions.length - 1;
      let targetIndex;

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        targetIndex = (currentIndex + 1) % this.iconOptions.length;
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        targetIndex = (currentIndex - 1 + this.iconOptions.length) % this.iconOptions.length;
      } else if (event.key === 'Home') {
        targetIndex = 0;
      } else if (event.key === 'End') {
        targetIndex = lastIndex;
      } else {
        return;
      }

      event.preventDefault();
      this.selectIcon(this.iconOptions[targetIndex].name);
      this.$nextTick(() => this.$refs.iconButtons?.[targetIndex]?.focus());
    }
  }
};
</script>

<style scoped>
.category-icon-picker {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
}

.category-icon-picker__option {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  padding: 8px;
  color: var(--text-secondary);
  background: var(--bg-secondary);
  border: 1px solid var(--border-control);
  border-radius: 4px;
}

.category-icon-picker__option:hover:not(:disabled) {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.category-icon-picker__option--selected {
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-color: var(--border-selected);
}

.category-icon-picker__option:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.category-icon-picker__option:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.category-icon-picker__option :deep(svg) {
  width: 18px;
  height: 18px;
}

:global(:root[data-theme='dark']) .category-icon-picker__option {
  color: var(--text-muted);
  background: var(--bg-control);
  border-color: var(--border-control);
}

:global(:root[data-theme='dark']) .category-icon-picker__option:hover:not(:disabled) {
  color: var(--text-inverted);
  background: var(--bg-hover);
}

:global(:root[data-theme='dark']) .category-icon-picker__option--selected {
  color: var(--text-inverted);
  background: var(--bg-selected);
  border-color: var(--border-selected);
}
</style>
