<template>
  <div
    class="mobile-pull-to-refresh"
    :class="{
      'mobile-pull-to-refresh--visible': indicatorHeight > 0,
      'mobile-pull-to-refresh--tracking': tracking,
      'mobile-pull-to-refresh--refreshing': isRefreshActive
    }"
    :style="indicatorStyle"
    role="status"
    aria-live="polite"
    :aria-label="statusLabel"
    :aria-hidden="indicatorHeight === 0 ? 'true' : null"
  >
    <div class="mobile-pull-to-refresh__content">
      <span
        v-if="isRefreshActive"
        class="mobile-pull-to-refresh__spinner"
        aria-hidden="true"
      ></span>
      <BootstrapIcon
        v-else
        icon="arrow-down"
        class="mobile-pull-to-refresh__icon"
        :class="{ 'mobile-pull-to-refresh__icon--ready': isReady }"
        aria-hidden="true"
      />
      <span>{{ statusLabel }}</span>
    </div>
  </div>
</template>

<script>
const PULL_ACTIVATION_DISTANCE = 8;
const PULL_RESISTANCE = 0.45;
const PULL_THRESHOLD = 72;
const PULL_MAX_DISTANCE = 112;
const REFRESH_INDICATOR_HEIGHT = 46;
const REFRESH_COLLAPSE_DURATION = 160;
const NESTED_SCROLL_ROOT_SELECTOR = '.article-reader__list, .article-reader__content, .article-list-view--expanded';

// This function returns the greatest active vertical scroll offset across mobile scroll roots.
const getScrollTop = element => Math.max(
  Number(element?.scrollTop) || 0,
  Number(window.scrollY) || 0,
  Number(document.documentElement?.scrollTop) || 0,
  Number(document.body?.scrollTop) || 0
);

export default {
  props: {
    refreshing: {
      type: Boolean,
      default: false
    },
    scrollRoot: {
      type: Object,
      default: null
    }
  },
  emits: ['refresh', 'show-mobile-toolbar'],
  data() {
    return {
      axis: null,
      pullDistance: 0,
      gestureScrollRoot: null,
      refreshFeedbackTimer: null,
      refreshFeedbackVisible: false,
      refreshRequested: false,
      startX: 0,
      startY: 0,
      tracking: false
    };
  },
  computed: {
    // This computed state keeps the indicator active until the parent acknowledges the request.
    isRefreshActive() {
      return this.refreshing || this.refreshRequested;
    },
    // This computed state indicates that releasing the gesture should refresh articles.
    isReady() {
      return !this.isRefreshActive && this.pullDistance >= PULL_THRESHOLD;
    },
    // This computed value exposes the compact refresh indicator height.
    indicatorHeight() {
      return this.isRefreshActive ? REFRESH_INDICATOR_HEIGHT : this.pullDistance;
    },
    // This computed style reveals the fixed overlay without changing article-flow geometry.
    indicatorStyle() {
      const revealDistance = Math.min(this.indicatorHeight, REFRESH_INDICATOR_HEIGHT);
      return {
        '--pull-indicator-height': `${REFRESH_INDICATOR_HEIGHT}px`,
        '--pull-indicator-reveal': `${revealDistance}px`,
        '--pull-indicator-opacity': revealDistance > 0 ? 1 : 0
      };
    },
    // This computed label communicates the current gesture or refresh state.
    statusLabel() {
      if (this.isRefreshActive || this.refreshFeedbackVisible) return 'Refreshing articles…';
      if (this.isReady) return 'Release to refresh';
      return 'Pull to refresh';
    }
  },
  watch: {
    // This watcher reconnects gesture listeners when the shell replaces its scroll surface.
    scrollRoot(value, previousValue) {
      this.clearArticleDisplacement(previousValue);
      this.detachScrollRoot(previousValue);
      this.attachScrollRoot(value);
      this.updateArticleDisplacement();
    },
    // This watcher moves article content visually without changing the scroll surface geometry.
    indicatorHeight() {
      this.updateArticleDisplacement();
    },
    // This watcher removes easing while the article content follows an active finger gesture.
    tracking() {
      this.updateArticleDisplacement();
    },
    // This watcher transfers pending ownership to the parent once refreshing starts.
    refreshing(value, previousValue) {
      if (value) {
        clearTimeout(this.refreshFeedbackTimer);
        this.refreshFeedbackVisible = true;
        this.refreshRequested = false;
        this.pullDistance = REFRESH_INDICATOR_HEIGHT;
        return;
      }

      if (previousValue) {
        this.resetGesture();
        this.finishRefreshFeedback();
      }
    }
  },
  // This hook attaches gesture handling to the shared mobile scroll surface.
  mounted() {
    this.attachScrollRoot(this.scrollRoot);
    this.updateArticleDisplacement();
  },
  // This hook removes every gesture listener owned by the indicator.
  beforeUnmount() {
    clearTimeout(this.refreshFeedbackTimer);
    this.clearArticleDisplacement(this.scrollRoot);
    this.detachScrollRoot(this.scrollRoot);
  },
  methods: {
    // This method publishes visual-only pull state to article layouts inside the shared root.
    updateArticleDisplacement() {
      if (!this.scrollRoot) return;
      const offset = Math.min(this.indicatorHeight, REFRESH_INDICATOR_HEIGHT);
      this.scrollRoot.style.setProperty('--mobile-pull-article-offset', `${offset}px`);
      this.scrollRoot.style.setProperty(
        '--mobile-pull-article-duration',
        this.tracking ? '0ms' : `${REFRESH_COLLAPSE_DURATION}ms`
      );
    },
    // This method removes visual pull state from a replaced or released shell scroll root.
    clearArticleDisplacement(scrollRoot) {
      scrollRoot?.style.removeProperty('--mobile-pull-article-offset');
      scrollRoot?.style.removeProperty('--mobile-pull-article-duration');
    },
    // This method attaches touch handling to the shell-owned article scroll surface.
    attachScrollRoot(scrollRoot) {
      scrollRoot?.addEventListener('touchstart', this.handleTouchStart, { passive: true });
      scrollRoot?.addEventListener('touchmove', this.handleTouchMove, { passive: false });
      scrollRoot?.addEventListener('touchend', this.handleTouchEnd, { passive: true });
      scrollRoot?.addEventListener('touchcancel', this.handleTouchCancel, { passive: true });
    },
    // This method removes touch handling from a replaced or unmounted scroll surface.
    detachScrollRoot(scrollRoot) {
      scrollRoot?.removeEventListener('touchstart', this.handleTouchStart);
      scrollRoot?.removeEventListener('touchmove', this.handleTouchMove);
      scrollRoot?.removeEventListener('touchend', this.handleTouchEnd);
      scrollRoot?.removeEventListener('touchcancel', this.handleTouchCancel);
    },
    // This method preserves refresh copy while the completed indicator collapses out of view.
    finishRefreshFeedback() {
      clearTimeout(this.refreshFeedbackTimer);
      this.refreshFeedbackTimer = setTimeout(() => {
        this.refreshFeedbackVisible = false;
        this.refreshFeedbackTimer = null;
      }, REFRESH_COLLAPSE_DURATION);
    },
    // This method starts a single-touch pull only from article content at the top of the page.
    handleTouchStart(event) {
      const ignoredTarget = event.target?.closest?.(
        '.mobile-toolbar-container, .mobile-options-overlay, [role="dialog"], input, textarea, select'
      );
      const gestureScrollRoot = event.target?.closest?.(NESTED_SCROLL_ROOT_SELECTOR)
        || this.scrollRoot;
      if (
        this.isRefreshActive
        || event.touches.length !== 1
        || getScrollTop(gestureScrollRoot) > 0
        || ignoredTarget
      ) {
        this.resetGesture();
        return;
      }

      const touch = event.touches[0];
      this.startX = touch.clientX;
      this.startY = touch.clientY;
      this.axis = null;
      this.gestureScrollRoot = gestureScrollRoot;
      this.tracking = true;
      this.pullDistance = 0;
      this.$emit('show-mobile-toolbar');
    },
    // This method converts a confirmed vertical drag into a resisted indicator distance.
    handleTouchMove(event) {
      if (!this.tracking || this.isRefreshActive) return;
      if (event.touches.length !== 1 || getScrollTop(this.gestureScrollRoot) > 0) {
        this.resetGesture();
        return;
      }

      const touch = event.touches[0];
      const deltaX = touch.clientX - this.startX;
      const deltaY = touch.clientY - this.startY;

      if (!this.axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= PULL_ACTIVATION_DISTANCE) {
        this.axis = Math.abs(deltaY) > Math.abs(deltaX) ? 'vertical' : 'horizontal';
      }
      if (this.axis === 'horizontal') {
        this.resetGesture();
        return;
      }
      if (this.axis !== 'vertical' || deltaY <= 0) {
        this.pullDistance = 0;
        return;
      }

      this.pullDistance = Math.min(deltaY * PULL_RESISTANCE, PULL_MAX_DISTANCE);
      if (event.cancelable) event.preventDefault();
    },
    // This method emits one database refresh after an armed gesture is released.
    handleTouchEnd() {
      if (!this.tracking) return;

      const shouldRefresh = this.isReady;
      this.tracking = false;
      this.axis = null;
      this.gestureScrollRoot = null;

      if (shouldRefresh) {
        this.refreshRequested = true;
        this.pullDistance = REFRESH_INDICATOR_HEIGHT;
        this.$emit('refresh');
        return;
      }

      this.pullDistance = 0;
    },
    // This method cancels an interrupted gesture without requesting a refresh.
    handleTouchCancel() {
      if (!this.refreshing) this.resetGesture();
    },
    // This method returns gesture state to its idle position.
    resetGesture() {
      this.axis = null;
      this.gestureScrollRoot = null;
      this.pullDistance = 0;
      this.refreshRequested = false;
      this.tracking = false;
    }
  }
};
</script>

<style scoped>
.mobile-pull-to-refresh {
  color: var(--text-secondary);
  flex: 0 0 auto;
  height: 0;
  overflow: visible;
  pointer-events: none;
  position: relative;
  z-index: var(--layer-refresh-indicator);
}

.mobile-pull-to-refresh__content {
  align-items: center;
  background: var(--surface-card);
  display: flex;
  font-size: 13px;
  font-weight: 500;
  gap: 8px;
  height: var(--pull-indicator-height);
  justify-content: center;
  left: 0;
  opacity: var(--pull-indicator-opacity);
  position: absolute;
  right: 0;
  top: 0;
  transform: translateY(calc(-100% + var(--pull-indicator-reveal)));
  transition: transform 160ms ease, opacity 160ms ease;
}

.mobile-pull-to-refresh--tracking .mobile-pull-to-refresh__content {
  transition: none;
}

.mobile-pull-to-refresh__icon {
  color: var(--color-warning);
  transition: transform 160ms ease;
}

.mobile-pull-to-refresh__icon--ready {
  transform: rotate(180deg);
}

.mobile-pull-to-refresh__spinner {
  animation: mobile-pull-to-refresh-spin 700ms linear infinite;
  border: 2px solid var(--border-default);
  border-radius: 50%;
  border-top-color: var(--color-warning);
  height: 16px;
  width: 16px;
}

.mobile-pull-to-refresh--tablet {
  position: sticky;
  top: var(--shell-toolbar-height, 56px);
}

@keyframes mobile-pull-to-refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mobile-pull-to-refresh__content,
  .mobile-pull-to-refresh__icon {
    transition: none;
  }

  .mobile-pull-to-refresh__spinner {
    animation-duration: 1400ms;
  }
}
</style>
