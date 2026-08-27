<template>
  <span ref="root" :class="['article-explanation-popover', rootClass]">
    <button
      ref="trigger"
      type="button"
      :class="['article-explanation-trigger', triggerClass]"
      :aria-controls="panelId"
      :aria-expanded="isOpen ? 'true' : 'false'"
      :aria-label="ariaLabel"
      @click.stop="toggle"
    >
      {{ triggerLabel }}
    </button>

    <Teleport to="body">
      <div v-if="isOpen" class="article-explanation-layer">
        <section
          :id="panelId"
          ref="panel"
          :class="['article-explanation-panel', panelClass]"
          role="dialog"
          :aria-labelledby="titleId"
          :aria-describedby="summaryId"
          :style="panelPosition"
          tabindex="-1"
          @click.stop
          @keydown="handlePanelKeydown"
        >
          <header class="article-explanation-header">
            <h3 :id="titleId">{{ dialogTitle }}</h3>
            <button
              ref="closeButton"
              type="button"
              class="app-icon-button app-icon-button--compact article-explanation-close"
              :aria-label="`Close ${dialogTitle.toLowerCase()}`"
              @click="close(true)"
            >
              <BootstrapIcon icon="x-lg" aria-hidden="true" />
            </button>
          </header>

          <p :id="summaryId" class="article-explanation-summary">{{ summary }}</p>

          <ul :class="['article-explanation-list', listClass]">
            <li v-for="item in items" :key="item.code">
              <span class="article-explanation-icon" aria-hidden="true">
                <BootstrapIcon :icon="item.icon" />
              </span>
              <span>
                <span class="article-explanation-item-heading">
                  <strong>{{ item.title }}</strong>
                  <strong v-if="item.value !== undefined" class="article-explanation-item-value">{{ item.value }}</strong>
                </span>
                <span>{{ item.text }}</span>
              </span>
            </li>
          </ul>

          <p v-if="footerLabel" class="article-explanation-footer">{{ footerLabel }}</p>
        </section>
      </div>
    </Teleport>
  </span>
</template>

<script>
const VIEWPORT_EDGE_GAP = 8;
const PANEL_OFFSET = 6;

export default {
  props: {
    triggerLabel: { type: String, required: true },
    triggerClass: { type: [String, Array, Object], default: '' },
    ariaLabel: { type: String, required: true },
    dialogTitle: { type: String, required: true },
    summary: { type: String, required: true },
    items: { type: Array, required: true },
    footerLabel: { type: String, default: '' },
    rootClass: { type: String, default: '' },
    panelClass: { type: String, default: '' },
    listClass: { type: String, default: '' }
  },
  data() {
    return {
      isOpen: false,
      panelLeft: 0,
      panelTop: 0
    };
  },
  computed: {
    panelId() {
      return `article-explanation-panel-${this.$.uid}`;
    },
    titleId() {
      return `${this.panelId}-title`;
    },
    summaryId() {
      return `${this.panelId}-summary`;
    },
    panelPosition() {
      return {
        '--article-explanation-left': `${this.panelLeft}px`,
        '--article-explanation-top': `${this.panelTop}px`
      };
    }
  },
  watch: {
    items() {
      this.close();
    }
  },
  beforeUnmount() {
    this.removeDocumentListeners();
  },
  methods: {
    toggle() {
      if (this.isOpen) {
        this.close(true);
        return;
      }

      this.isOpen = true;
      document.addEventListener('pointerdown', this.handleDocumentPointerDown);
      document.addEventListener('keydown', this.handleDocumentKeydown);
      window.addEventListener('resize', this.positionPanel);
      window.addEventListener('scroll', this.positionPanel, true);
      this.$nextTick(() => {
        this.positionPanel();
        this.$refs.closeButton?.focus();
      });
    },
    close(restoreFocus = false) {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.removeDocumentListeners();
      if (restoreFocus) this.$nextTick(() => this.$refs.trigger?.focus());
    },
    removeDocumentListeners() {
      document.removeEventListener('pointerdown', this.handleDocumentPointerDown);
      document.removeEventListener('keydown', this.handleDocumentKeydown);
      window.removeEventListener('resize', this.positionPanel);
      window.removeEventListener('scroll', this.positionPanel, true);
    },
    positionPanel() {
      if (!this.isOpen) return;
      const trigger = this.$refs.trigger;
      const panel = this.$refs.panel;
      if (!trigger || !panel) return;

      const triggerRect = trigger.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const viewportWidth = document.documentElement.clientWidth;
      const viewportHeight = document.documentElement.clientHeight;
      this.panelLeft = Math.max(
        VIEWPORT_EDGE_GAP,
        Math.min(triggerRect.left, viewportWidth - panelRect.width - VIEWPORT_EDGE_GAP)
      );
      this.panelTop = triggerRect.bottom + PANEL_OFFSET;
      if (this.panelTop + panelRect.height > viewportHeight - VIEWPORT_EDGE_GAP) {
        this.panelTop = Math.max(
          VIEWPORT_EDGE_GAP,
          triggerRect.top - panelRect.height - PANEL_OFFSET
        );
      }
    },
    handleDocumentPointerDown(event) {
      if (
        this.$refs.root?.contains(event.target)
        || this.$refs.panel?.contains(event.target)
      ) return;
      this.close();
    },
    handleDocumentKeydown(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      this.close(true);
    },
    handlePanelKeydown(event) {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      this.$refs.closeButton?.focus();
    }
  }
};
</script>

<style scoped>
.article-explanation-popover {
  display: inline-flex;
}

.article-explanation-trigger {
  appearance: none;
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  border: 1px solid var(--color-transparent);
  border-radius: 6px;
  vertical-align: middle;
}

.article-explanation-trigger.recommended-badge {
  color: var(--badge-quality-text);
  background-color: var(--badge-quality-bg);
}

.article-explanation-trigger.score {
  color: var(--article-score-text);
  background-color: var(--surface-chrome);
}

.article-explanation-trigger.score-poor {
  color: var(--article-score-poor-text);
  background-color: var(--article-score-poor-background);
}

.article-explanation-trigger.score-medium {
  color: var(--article-score-medium-text);
  background-color: var(--article-score-medium-background);
}

.article-explanation-trigger.score-good {
  color: var(--article-score-good-text);
  background-color: var(--article-score-good-background);
}

.article-explanation-trigger:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.article-explanation-layer {
  position: fixed;
  inset: 0;
  z-index: var(--layer-dropdown);
  pointer-events: none;
}

.article-explanation-panel {
  position: absolute;
  top: var(--article-explanation-top);
  left: var(--article-explanation-left);
  width: min(360px, calc(100vw - 16px));
  max-height: calc(100vh - 16px);
  max-height: calc(100dvh - 16px);
  padding: 18px;
  overflow-y: auto;
  color: var(--text-primary);
  text-align: left;
  pointer-events: auto;
  background: var(--surface-card);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-modal);
}

.article-explanation-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.article-explanation-header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
  line-height: 1.35;
}

.article-explanation-close {
  flex: 0 0 auto;
}

.article-explanation-summary {
  margin: 10px 0 16px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.article-explanation-list {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.article-explanation-list li {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 9px;
  align-items: start;
}

.article-explanation-list li > span:last-child,
.article-explanation-list strong,
.article-explanation-list li > span:last-child > span {
  display: block;
}

.article-explanation-item-heading {
  display: flex !important;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.article-explanation-list strong {
  margin-bottom: 2px;
  color: var(--text-primary);
  font-size: 12px;
}

.article-explanation-item-value {
  flex: 0 0 auto;
  font-size: 13px !important;
}

.article-explanation-list li > span:last-child > span:last-child {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.article-explanation-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  color: var(--badge-quality-text);
  background: var(--badge-quality-bg);
  border-radius: var(--radius-control);
}

.article-explanation-footer {
  padding-top: 12px;
  margin: 16px 0 0;
  color: var(--text-muted);
  font-size: 11px;
  border-top: 1px solid var(--border-default);
}

@media (max-width: 879px) and (orientation: portrait) {
  .article-explanation-panel {
    width: min(320px, calc(100vw - 24px));
    max-height: calc(100vh - 16px);
    max-height: calc(100dvh - 16px);
    padding: 14px;
  }

  .article-explanation-summary {
    margin: 8px 0 12px;
  }

  .article-explanation-list {
    gap: 10px;
  }
}
</style>
