<template>
  <div id="mobile-container" v-if="mobile" class="overlay">
    <div
      class="options-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="options-title"
      aria-describedby="options-description"
    >
      <header class="options-header">
        <div class="options-heading">
          <h2 id="options-title">
            <span class="options-title-icon" aria-hidden="true">
              <BootstrapIcon icon="sliders2" />
            </span>
            Options
          </h2>
          <p id="options-description">Choose how RSSMonster displays and refreshes your feeds.</p>
        </div>
        <button
          type="button"
          class="mobile-close-button"
          aria-label="Close mobile menu"
          @click="emitClickEvent('mobile', null)"
        ></button>
      </header>

      <div class="overlay-content" id="mobile">
        <section class="options-section" aria-labelledby="category-options-heading">
          <div class="options-section-header">
            <span class="options-section-number" aria-hidden="true"><BootstrapIcon icon="folder-fill" /></span>
            <h3 id="category-options-heading">Choose a category</h3>
          </div>
          <ul class="options-list categories">
            <li
              class="options-row category"
              @click="selectCategory('%')"
              v-bind:class="{'selected': selectionStore.currentSelection.categoryId == '%'}"
            >
              <span class="options-row-icon" aria-hidden="true">
                <BootstrapIcon icon="folder-fill" />
              </span>
              <span>Show all categories</span>
            </li>
            <li
              v-for="category in overviewStore.categories"
              :key="category.id"
              v-bind:id="category.id"
              class="options-row category"
              @click="selectCategory(category.id)"
              v-bind:class="{'selected': String(selectionStore.currentSelection.categoryId) === String(category.id)}"
            >
              <span class="options-row-icon" aria-hidden="true">
                <BootstrapIcon icon="folder-fill" />
              </span>
              <span>{{ category.name }}</span>
            </li>
          </ul>
        </section>

        <section class="options-section" aria-labelledby="view-options-heading">
          <div class="options-section-header">
            <span class="options-section-number" aria-hidden="true"><BootstrapIcon icon="eye-fill" /></span>
            <h3 id="view-options-heading">Choose content view</h3>
          </div>
          <div class="options-view-grid">
            <button @click="selectViewMode('full')" type="button" class="options-view-card" :class="{ selected: selectionStore.currentSelection.viewMode === 'full' }">
              <span class="options-view-title">Expanded</span>
              <span class="options-view-description">Show the full article content</span>
            </button>
            <button @click="selectViewMode('summarized')" type="button" class="options-view-card" :class="{ selected: selectionStore.currentSelection.viewMode === 'summarized' }">
              <span class="options-view-title">Summarized content</span>
              <span class="options-view-description">Show the AI generated summary</span>
            </button>
            <button v-if="selectionStore.currentSelection.AIEnabled" @click="selectViewMode('summaryBullets')" type="button" class="options-view-card" :class="{ selected: selectionStore.currentSelection.viewMode === 'summaryBullets' }">
              <span class="options-view-title">Summary bullets</span>
              <span class="options-view-description">Show short summaries as bullet points</span>
            </button>
            <button @click="selectViewMode('minimal')" type="button" class="options-view-card" :class="{ selected: selectionStore.currentSelection.viewMode === 'minimal' }">
              <span class="options-view-title">Headlines</span>
              <span class="options-view-description">Show only the article titles</span>
            </button>
          </div>
        </section>

        <section class="options-section" aria-labelledby="refresh-options-heading">
          <div class="options-section-header">
            <span class="options-section-number" aria-hidden="true"><BootstrapIcon icon="arrow-clockwise" /></span>
            <h3 id="refresh-options-heading">Refresh feeds</h3>
          </div>
          <button @click="refreshFeeds()" type="button" class="options-action-button options-action-button--refresh">Refresh feeds</button>
        </section>

        <section class="options-section" aria-labelledby="new-feed-options-heading">
          <div class="options-section-header">
            <span class="options-section-number" aria-hidden="true"><BootstrapIcon icon="plus-lg" /></span>
            <h3 id="new-feed-options-heading">Add new feed</h3>
          </div>
          <button @click="showNewFeed()" type="button" class="options-action-button options-action-button--add">Add new feed</button>
        </section>

        <section class="options-section options-section--secondary" aria-labelledby="notification-options-heading">
          <div class="options-section-header">
            <h3 id="notification-options-heading">Notifications</h3>
          </div>
          <button
            type="button"
            class="options-action-button options-action-button--neutral"
            :disabled="notificationButtonDisabled"
            @click="subscribeNotifications"
          >
            {{ notificationButtonLabel }}
          </button>
          <p v-if="notificationMessage" class="options-status-message" aria-live="polite">
            {{ notificationMessage }}
          </p>
        </section>

        <section v-if="selectionStore.currentSelection.AIEnabled" class="options-section options-section--secondary" aria-labelledby="chat-options-heading">
          <div class="options-section-header">
            <h3 id="chat-options-heading">Chat assistant</h3>
          </div>
          <button @click="chatAssistant()" type="button" class="options-action-button options-action-button--neutral">{{ uiStore.chatAssistantOpen ? 'Close Chat' : 'Open Chat' }}</button>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  align-items: center;
  background: var(--overlay-backdrop);
  box-sizing: border-box;
  display: flex;
  height: 100%;
  height: 100dvh;
  left: 0;
  overflow: hidden;
  overscroll-behavior: contain;
  padding: 12px;
  position: fixed;
  top: 0;
  width: 100%;
  z-index: var(--layer-overlay);
}

.options-sheet {
  background: var(--options-sheet-background, var(--bg-card));
  border: 1px solid var(--border-default);
  border-radius: 8px;
  box-shadow: var(--shadow-modal);
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 24px);
  max-height: calc(100dvh - 24px);
  overflow: hidden;
  width: 100%;
}

.options-header {
  align-items: flex-start;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding: 16px 18px;
}

.options-heading {
  flex: 1;
  min-width: 0;
}

.options-header h2 {
  align-items: center;
  color: var(--options-text, var(--text-primary));
  display: flex;
  font-size: 17px;
  font-weight: 700;
  gap: 12px;
  line-height: 1.3;
  margin: 0;
}

.options-title-icon {
  align-items: center;
  background: var(--options-icon-background, var(--color-primary-soft));
  border-radius: 6px;
  color: var(--options-icon-color, var(--color-primary));
  display: inline-flex;
  flex: 0 0 32px;
  font-size: 18px;
  height: 32px;
  justify-content: center;
}

.options-heading p {
  color: var(--options-muted-text, var(--text-secondary));
  font-size: 13px;
  line-height: 1.4;
  margin: 3px 0 0 44px;
}

.mobile-close-button {
  align-items: center;
  background: var(--options-control-background, var(--bg-card));
  border: 0;
  border-radius: 6px;
  color: var(--options-text, var(--text-primary));
  display: inline-flex;
  flex: 0 0 32px;
  height: 32px;
  justify-content: center;
  padding: 0;
  position: relative;
  width: 32px;
}

.mobile-close-button::before,
.mobile-close-button::after {
  background-color: var(--color-current);
  content: "";
  height: 14px;
  position: absolute;
  width: 2px;
}

.mobile-close-button::before {
  transform: rotate(45deg);
}

.mobile-close-button::after {
  transform: rotate(-45deg);
}

.mobile-close-button:hover,
.mobile-close-button:focus-visible {
  background: var(--bg-muted);
}

.overlay-content {
  -webkit-overflow-scrolling: touch;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0 18px calc(18px + env(safe-area-inset-bottom));
  text-align: left;
}

.options-section {
  padding-bottom: 16px;
}

.options-section + .options-section {
  border-top: 1px solid var(--border-subtle);
}

.options-section-header {
  align-items: center;
  display: flex;
  gap: 8px;
  margin-bottom: 6px;
  padding-top: 16px;
}

.options-section-header h3 {
  color: var(--options-muted-text, var(--text-secondary));
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.055em;
  line-height: 1.2;
  margin: 0;
  text-transform: uppercase;
}

.options-section-number {
  align-items: center;
  background: var(--options-icon-background, var(--color-primary-soft));
  border-radius: 6px;
  color: var(--options-icon-color, var(--color-primary));
  display: inline-flex;
  flex: 0 0 20px;
  font-size: 11px;
  font-weight: 700;
  height: 20px;
  justify-content: center;
}

.options-list {
  list-style: none;
  margin: 0;
  max-height: min(32vh, 260px);
  overflow-y: auto;
  padding: 0;
  -webkit-overflow-scrolling: touch;
}

.options-row {
  align-items: center;
  border-bottom: 1px solid var(--border-subtle);
  box-sizing: border-box;
  color: var(--options-text, var(--text-primary));
  cursor: pointer;
  display: flex;
  font-size: 14px;
  gap: 10px;
  min-height: 44px;
  padding: 0 10px;
  position: relative;
}

.options-row-icon {
  align-items: center;
  background: var(--options-icon-background, var(--color-primary-soft));
  border-radius: 6px;
  box-sizing: border-box;
  color: var(--options-icon-color, var(--color-primary));
  display: inline-flex;
  flex: 0 0 32px;
  height: 32px;
  justify-content: center;
  width: 32px;
}

.options-row::after {
  border: 2px solid var(--border-control);
  border-radius: 50%;
  content: "";
  height: 18px;
  margin-left: auto;
  width: 18px;
}

.options-row.selected {
  background: var(--options-selected-background, var(--color-primary-soft));
  border: 1px solid var(--border-selected);
  border-radius: 6px;
  color: var(--options-selected-text, var(--color-primary-strong));
  font-weight: 600;
  margin: 2px 0;
}

.options-row.selected::after {
  background: var(--options-selected-indicator, var(--color-primary));
  border-color: var(--border-selected);
  box-shadow: inset 0 0 0 4px var(--options-selected-background, var(--color-primary-soft));
}

.options-row.selected .options-row-icon {
  background: var(--options-control-background, var(--bg-card));
  border: 1px solid var(--border-selected);
  color: var(--options-selected-indicator, var(--color-primary));
}

.options-view-grid {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.options-view-card {
  background: var(--options-control-background, var(--bg-card));
  border: 1px solid var(--border-control);
  border-radius: 6px;
  color: var(--options-text, var(--text-primary));
  display: flex;
  flex-direction: column;
  min-height: 72px;
  padding: 12px;
  text-align: left;
}

.options-view-card.selected {
  background: var(--options-selected-background, var(--color-primary-soft));
  border-color: var(--border-selected);
  box-shadow: inset 0 0 0 1px var(--border-selected);
}

.options-view-title {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}

.options-view-description {
  color: var(--options-muted-text, var(--text-muted));
  font-size: 11px;
  line-height: 1.4;
  margin-top: 5px;
}

.options-action-button {
  background: var(--options-control-background, var(--bg-card));
  border: 1px solid;
  border-radius: 6px;
  box-sizing: border-box;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  height: 40px;
  overflow: hidden;
  padding: 0 12px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.options-action-button--refresh {
  background: var(--options-refresh-background, var(--sidebar-action-refresh-background));
  border-color: var(--options-refresh-border, var(--sidebar-action-refresh-border));
  color: var(--options-refresh-text, var(--sidebar-action-refresh-text));
}

.options-action-button--refresh:hover,
.options-action-button--refresh:focus-visible {
  background: var(--options-refresh-hover-background, var(--sidebar-action-refresh-hover-background));
  color: var(--options-refresh-text, var(--sidebar-action-refresh-text));
}

.options-action-button--add {
  background: var(--options-add-background, var(--sidebar-action-mark-as-read-background));
  border-color: var(--options-add-border, var(--sidebar-action-mark-as-read-border));
  color: var(--options-add-text, var(--sidebar-action-mark-as-read-text));
}

.options-action-button--add:hover,
.options-action-button--add:focus-visible {
  background: var(--options-add-hover-background, var(--sidebar-action-mark-as-read-hover-background));
  color: var(--options-add-hover-text, var(--sidebar-action-mark-as-read-hover-text));
}

.options-action-button--neutral {
  border-color: var(--border-control);
  color: var(--options-text, var(--text-secondary));
}

.options-action-button:hover,
.options-action-button:focus-visible {
  filter: none;
}

.options-action-button:disabled {
  cursor: default;
  opacity: 0.7;
}

.options-status-message {
  color: var(--options-muted-text, var(--text-muted));
  font-size: 12px;
  line-height: 1.4;
  margin: 8px 4px 0;
}

.options-view-card:hover,
.options-view-card:focus-visible {
  filter: brightness(0.98);
}

@media (max-width: 359px) {
  .options-header,
  .overlay-content {
    padding-left: 14px;
    padding-right: 14px;
  }

  .options-view-grid {
    grid-template-columns: 1fr;
  }
}

:global(:root[data-theme='dark']) {
  .overlay {
    --options-sheet-background: var(--bg-modal);
    --options-control-background: var(--bg-control);
    --options-text: var(--text-primary);
    --options-muted-text: var(--text-muted);
    --options-icon-background: var(--color-primary-surface-dark);
    --options-icon-color: var(--color-primary-icon-dark);
    --options-selected-background: var(--color-primary-surface-dark);
    --options-selected-text: var(--color-primary-soft);
    --options-refresh-background: var(--sidebar-action-refresh-background);
    --options-refresh-hover-background: var(--sidebar-action-refresh-hover-background);
    --options-refresh-border: var(--sidebar-action-refresh-border);
    --options-refresh-text: var(--sidebar-action-refresh-text);
    --options-add-background: var(--sidebar-action-mark-as-read-background);
    --options-add-hover-background: var(--sidebar-action-mark-as-read-hover-background);
    --options-add-border: var(--sidebar-action-mark-as-read-border);
    --options-add-text: var(--sidebar-action-mark-as-read-text);
    --options-add-hover-text: var(--sidebar-action-mark-as-read-hover-text);
  }
}

:global(:root[data-theme='dark'] #mobile-container) {
  --options-sheet-background: var(--bg-modal);
  --options-control-background: var(--bg-control);
  --options-text: var(--text-primary);
  --options-muted-text: var(--text-muted);
  --options-icon-background: var(--color-primary-surface-dark);
  --options-icon-color: var(--color-primary-icon-dark);
  --options-selected-background: var(--color-primary-surface-dark);
  --options-selected-text: var(--color-primary-soft);
  --options-refresh-background: var(--sidebar-action-refresh-background);
  --options-refresh-hover-background: var(--sidebar-action-refresh-hover-background);
  --options-refresh-border: var(--sidebar-action-refresh-border);
  --options-refresh-text: var(--sidebar-action-refresh-text);
  --options-add-background: var(--sidebar-action-mark-as-read-background);
  --options-add-hover-background: var(--sidebar-action-mark-as-read-hover-background);
  --options-add-border: var(--sidebar-action-mark-as-read-border);
  --options-add-text: var(--sidebar-action-mark-as-read-text);
  --options-add-hover-text: var(--sidebar-action-mark-as-read-hover-text);
}

:global(body.mobile-options-open) {
  overflow: hidden;
}
</style>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { useOverviewStore } from '../../store/overview.js';
import { useUiStore } from '../../store/ui.js';
export default {
  props: ["mobile"],
  data() {
    return {
      notificationMessage: '',
      notificationPermission: 'unsupported',
      notificationRequestPending: false
    };
  },
  computed: {
    ...mapStores(useSelectionStore, useOverviewStore, useUiStore),
    notificationButtonDisabled() {
      return this.notificationRequestPending ||
        this.notificationPermission === 'granted' ||
        this.notificationPermission === 'denied' ||
        this.notificationPermission === 'unsupported';
    },
    notificationButtonLabel() {
      if (this.notificationRequestPending) return 'Requesting permission…';
      if (this.notificationPermission === 'granted') return 'Notifications enabled';
      if (this.notificationPermission === 'denied') return 'Notifications blocked in browser';
      if (this.notificationPermission === 'unsupported') return 'Notifications unavailable';
      return 'Enable notifications';
    }
  },
  watch: {
    mobile: {
      immediate: true,
      handler(isOpen) {
        document.body.classList.toggle('mobile-options-open', isOpen);
        if (isOpen) {
          this.syncNotificationPermission();
        }
      }
    }
  },
  unmounted() {
    document.body.classList.remove('mobile-options-open');
  },
  methods: {
    emitClickEvent(eventType, value) {
      this.$emit(eventType, value);
    },
    showNewFeed() {
      this.emitClickEvent("mobile", null);
      this.uiStore.setShowModal('NewFeed');
    },
    refreshFeeds() {
      this.$emit('refresh');
    },
    // This function syncs local UI state with the browser's notification permission.
    syncNotificationPermission() {
      this.notificationPermission = 'Notification' in window
        ? Notification.permission
        : 'unsupported';
      this.notificationMessage = '';
    },
    // This function requests notification permission after the user presses the button.
    async subscribeNotifications() {
      if (!('Notification' in window) || Notification.permission !== 'default') {
        this.syncNotificationPermission();
        return;
      }

      this.notificationRequestPending = true;
      this.notificationMessage = '';

      try {
        await Notification.requestPermission();
        this.syncNotificationPermission();

        if (this.notificationPermission === 'denied') {
          this.notificationMessage = 'Enable notifications in your browser settings to receive alerts.';
        }
      } catch (error) {
        console.error('Error requesting browser notification permission:', error);
        this.syncNotificationPermission();
        this.notificationMessage = 'Could not request notification permission. Please try again.';
      } finally {
        this.notificationRequestPending = false;
      }
    },
    chatAssistant() {
      this.uiStore.setChatAssistantOpen(!this.uiStore.chatAssistantOpen);
      this.emitClickEvent('mobile', null);
    },
    selectCategory(categoryId) {
      this.selectionStore.selectCategory(categoryId);
      setTimeout(() => {
        this.emitClickEvent('mobile', null);
      }, 150);
    },
    selectViewMode(mode) {
      this.selectionStore.setViewMode(mode);
      setTimeout(() => {
        this.emitClickEvent('mobile', null);
      }, 150);
    }
  }
};
</script>
