<template>
  <span ref="root" class="article-recommendation-explanation">
    <button
      ref="trigger"
      type="button"
      class="recommended-badge"
      :aria-controls="panelId"
      :aria-expanded="isOpen ? 'true' : 'false'"
      :aria-label="`${triggerLabel}. Explain why this article was recommended`"
      @click.stop="toggle"
    >
      {{ triggerLabel }}
    </button>

    <Teleport to="body">
      <div v-if="isOpen" class="recommendation-explanation-layer">
        <button
          type="button"
          class="recommendation-explanation-backdrop"
          aria-label="Close recommendation explanation"
          @click="close(true)"
        ></button>
        <section
          :id="panelId"
          ref="panel"
          class="recommendation-explanation-panel"
          role="dialog"
          :aria-labelledby="titleId"
          :aria-describedby="summaryId"
          :style="panelPosition"
          tabindex="-1"
          @click.stop
          @keydown="handlePanelKeydown"
        >
          <header class="recommendation-explanation-header">
            <h3 :id="titleId">Why this article was promoted</h3>
            <button
              ref="closeButton"
              type="button"
              class="app-icon-button app-icon-button--compact recommendation-explanation-close"
              aria-label="Close recommendation explanation"
              @click="close(true)"
            >
              <BootstrapIcon icon="x-lg" aria-hidden="true" />
            </button>
          </header>

          <p :id="summaryId" class="recommendation-explanation-summary">
            {{ explanation.summary }}
          </p>

          <ul class="recommendation-explanation-list">
            <li v-for="item in explanation.items" :key="item.code">
              <span class="recommendation-explanation-icon" aria-hidden="true">
                <BootstrapIcon :icon="item.icon" />
              </span>
              <span>
                <strong>{{ item.title }}</strong>
                <span>{{ item.text }}</span>
              </span>
            </li>
          </ul>

          <p v-if="explanation.scoreLabel" class="recommendation-explanation-score">
            {{ explanation.scoreLabel }}
          </p>
        </section>
      </div>
    </Teleport>
  </span>
</template>

<script>
import { buildArticleRecommendationExplanation } from '../../services/articleRecommendationPresentation.js';

const VIEWPORT_EDGE_GAP = 8;
const PANEL_OFFSET = 6;

export default {
  props: {
    recommendation: {
      type: Object,
      required: true
    },
    triggerLabel: {
      type: String,
      required: true
    }
  },
  data() {
    return {
      isOpen: false,
      panelLeft: 0,
      panelTop: 0
    };
  },
  computed: {
    explanation() {
      return buildArticleRecommendationExplanation(this.recommendation);
    },
    panelId() {
      return `article-recommendation-panel-${this.$.uid}`;
    },
    titleId() {
      return `${this.panelId}-title`;
    },
    summaryId() {
      return `${this.panelId}-summary`;
    },
    panelPosition() {
      return {
        '--recommendation-panel-left': `${this.panelLeft}px`,
        '--recommendation-panel-top': `${this.panelTop}px`
      };
    }
  },
  watch: {
    recommendation() {
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
.article-recommendation-explanation {
  display: inline-flex;
}

.recommended-badge {
  appearance: none;
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  color: var(--badge-quality-text);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  cursor: pointer;
  background-color: var(--badge-quality-bg);
  border: 1px solid var(--color-transparent);
  border-radius: 6px;
  vertical-align: middle;
}

.recommended-badge:focus-visible {
  outline: 2px solid var(--border-focus);
  outline-offset: 2px;
}

.recommendation-explanation-layer {
  position: fixed;
  inset: 0;
  z-index: var(--layer-dropdown);
  pointer-events: none;
}

.recommendation-explanation-backdrop {
  display: none;
}

.recommendation-explanation-panel {
  position: absolute;
  top: var(--recommendation-panel-top);
  left: var(--recommendation-panel-left);
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

.recommendation-explanation-header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.recommendation-explanation-header h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
  line-height: 1.35;
}

.recommendation-explanation-close {
  flex: 0 0 auto;
}

.recommendation-explanation-summary {
  margin: 10px 0 16px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
}

.recommendation-explanation-list {
  display: grid;
  gap: 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.recommendation-explanation-list li {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 9px;
  align-items: start;
}

.recommendation-explanation-list li > span:last-child,
.recommendation-explanation-list strong,
.recommendation-explanation-list li > span:last-child > span {
  display: block;
}

.recommendation-explanation-list strong {
  margin-bottom: 2px;
  color: var(--text-primary);
  font-size: 12px;
}

.recommendation-explanation-list li > span:last-child > span {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.45;
}

.recommendation-explanation-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  color: var(--badge-quality-text);
  background: var(--badge-quality-bg);
  border-radius: var(--radius-control);
}

.recommendation-explanation-score {
  padding-top: 12px;
  margin: 16px 0 0;
  color: var(--text-muted);
  font-size: 11px;
  border-top: 1px solid var(--border-default);
}

@media (max-width: 879px) and (orientation: portrait) {
  .recommendation-explanation-panel {
    width: min(320px, calc(100vw - 24px));
    max-height: calc(100vh - 16px);
    max-height: calc(100dvh - 16px);
    padding: 14px;
  }

  .recommendation-explanation-summary {
    margin: 8px 0 12px;
  }

  .recommendation-explanation-list {
    gap: 10px;
  }
}
</style>
