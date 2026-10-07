<template>
  <div class="bulk-action-menu-wrap" @click.stop @keydown.esc.stop.prevent="handleKeydown">
    <button
      ref="trigger"
      :aria-expanded="String(isOpen)"
      aria-haspopup="menu"
      type="button"
      class="bulk-more-button"
      title="More actions"
      aria-label="More actions"
      @click="toggleMenu"
    >
      <BootstrapIcon icon="three-dots" context="control" aria-hidden="true" />
    </button>
    <div v-if="isOpen" class="bulk-action-menu" :style="menuStyle" role="menu" aria-label="More actions">
      <div class="bulk-action-menu-section">
        <button type="button" class="bulk-action-menu-item" role="menuitem" @click="runBulkAction('mark-visible-read')">
          <BootstrapIcon icon="check2-circle" aria-hidden="true" />
          <span>Mark all visible as read</span>
        </button>
        <button type="button" class="bulk-action-menu-item" role="menuitem" :disabled="selectedArticleId == null" @click="runBulkAction('mark-older-read')">
          <BootstrapIcon icon="clock-history" aria-hidden="true" />
          <span>Mark older than current article as read</span>
        </button>
        <button type="button" class="bulk-action-menu-item" role="menuitem" :disabled="selectedArticleIndex <= 0" @click="runBulkAction('mark-above-read')">
          <BootstrapIcon icon="arrow-up-short" aria-hidden="true" />
          <span>Mark articles above as read</span>
        </button>
        <button type="button" class="bulk-action-menu-item" role="menuitem" :disabled="selectedArticleIndex === -1 || selectedArticleIndex >= articleCount - 1" @click="runBulkAction('mark-below-read')">
          <BootstrapIcon icon="arrow-down-short" aria-hidden="true" />
          <span>Mark articles below as read</span>
        </button>
      </div>
      <div class="bulk-action-menu-section">
        <button type="button" class="bulk-action-menu-item" role="menuitem" @click="runBulkAction('favorite-visible')">
          <BootstrapIcon icon="bookmark" aria-hidden="true" />
          <span>Save all visible articles</span>
        </button>
        <button type="button" class="bulk-action-menu-item" role="menuitem" @click="runBulkAction('mark-visible-clicked')">
          <BootstrapIcon icon="box-arrow-up-right" aria-hidden="true" />
          <span>Mark all visible originals as opened</span>
        </button>
      </div>
      <SaveCurrentViewSmartFolder menu-item class="bulk-action-menu-section">
        <template #trigger="{ triggerProps, isSaving }">
          <button v-bind="triggerProps" type="button" class="bulk-action-menu-item" role="menuitem" aria-haspopup="dialog" :disabled="isSaving">
            <BootstrapIcon icon="folder-plus" aria-hidden="true" />
            <span>Save as smart folder</span>
          </button>
        </template>
      </SaveCurrentViewSmartFolder>
    </div>
  </div>
</template>

<script>
import SaveCurrentViewSmartFolder from './SaveCurrentViewSmartFolder.vue';

export default {
  components: { SaveCurrentViewSmartFolder },
  emits: ['bulk-action', 'open'],
  props: {
    selectedArticleId: { type: [Number, String], default: null },
    selectedArticleIndex: { type: Number, default: -1 },
    articleCount: { type: Number, required: true },
    closeKey: { type: [String, Number], default: '' }
  },
  data() {
    return { isOpen: false, menuStyle: {} };
  },
  watch: {
    closeKey() { this.closeMenu(); }
  },
  mounted() {
    document.addEventListener('click', this.closeMenu);
    document.addEventListener('keydown', this.handleKeydown);
    window.addEventListener('resize', this.positionMenu);
    window.addEventListener('scroll', this.positionMenu, true);
  },
  beforeUnmount() {
    document.removeEventListener('click', this.closeMenu);
    document.removeEventListener('keydown', this.handleKeydown);
    window.removeEventListener('resize', this.positionMenu);
    window.removeEventListener('scroll', this.positionMenu, true);
  },
  methods: {
    toggleMenu() {
      this.isOpen = !this.isOpen;
      if (this.isOpen) {
        this.$emit('open');
        this.$nextTick(this.positionMenu);
      }
    },
    closeMenu() { this.isOpen = false; },
    handleKeydown(event) {
      if (event.key === 'Escape' && this.isOpen) {
        this.closeMenu();
        this.$refs.trigger.focus();
      }
    },
    positionMenu() {
      if (!this.isOpen) return;
      const rect = this.$refs.trigger.getBoundingClientRect();
      const menu = this.$el.querySelector('[role="menu"]').getBoundingClientRect();
      this.menuStyle = {
        left: `${Math.max(12, Math.min(rect.right - menu.width, window.innerWidth - menu.width - 12))}px`,
        top: `${Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - menu.height - 12))}px`
      };
    },
    runBulkAction(action) {
      this.closeMenu();
      this.$emit('bulk-action', { action, selectedArticleId: this.selectedArticleId });
    }
  }
};
</script>

<style scoped>
.bulk-action-menu-wrap {
  align-self: center;
  flex: 0 0 auto;
  margin-left: auto;
  position: relative;
}

.bulk-more-button {
  align-items: center;
  background: var(--color-transparent);
  border: 0;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  height: var(--control-height-compact);
  justify-content: center;
  width: 26px;
}

.bulk-more-button:hover,
.bulk-more-button:focus-visible {
  background: var(--reader-list-item-hover-background);
  color: var(--text-primary);
  outline: none;
}

.bulk-action-menu {
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: 0 16px 36px var(--shadow-reader-bulk-menu-color);
  max-width: calc(100vw - 24px);
  min-width: min(280px, calc(100vw - 24px));
  padding: 8px;
  position: fixed;
  z-index: var(--layer-dropdown);
}

.bulk-action-menu-section {
  border-bottom: 1px solid var(--border-subtle);
  padding: 6px 0;
}

.bulk-action-menu-section:first-child {
  padding-top: 0;
}

.bulk-action-menu-section:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.bulk-action-menu-item {
  align-items: center;
  background: var(--color-transparent);
  border: none;
  border-radius: 6px;
  color: var(--toolbar-text);
  display: flex;
  font-size: 14px;
  font-weight: 500;
  gap: 10px;
  min-height: 36px;
  padding: 8px 10px;
  white-space: normal;
  text-align: left;
  width: 100%;
}

.bulk-action-menu-item:hover:not(:disabled),
.bulk-action-menu-item:focus-visible:not(:disabled) {
  background: var(--reader-list-item-hover-background);
  outline: none;
}

.bulk-action-menu-item:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
  opacity: 0.55;
}

.bulk-action-menu-item .bi {
  color: var(--text-secondary);
  flex: 0 0 18px;
  width: 18px;
}

:global(:root[data-theme='dark']) .bulk-action-menu {
  background: var(--bg-modal);
  border-color: var(--border-default);
  box-shadow: 0 18px 40px var(--shadow-reader-bulk-menu-color);
}

:global(:root[data-theme='dark']) .bulk-action-menu-section {
  border-color: var(--border-subtle);
}

</style>
