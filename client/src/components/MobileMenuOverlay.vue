<template>
  <div id="mobile-container" v-if="mobile" class="overlay">
    <div class="options-sheet" role="dialog" aria-modal="true" aria-labelledby="options-title">
      <div class="options-drag-handle" aria-hidden="true"></div>

      <header class="options-header">
        <h2 id="options-title">Options</h2>
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
              v-bind:class="{'selected': $store.data.currentSelection.categoryId == '%'}"
            >
              <span class="glyphicon" aria-hidden="true">
                <i class="far fa-folder" data-fa-transform="down-5 shrink-2"></i>
              </span>
              <span>Show all categories</span>
            </li>
            <li
              v-for="category in $store.data.categories"
              :key="category.id"
              v-bind:id="category.id"
              class="options-row category"
              @click="selectCategory(category.id)"
              v-bind:class="{'selected': $store.data.currentSelection.categoryId === category.id}"
            >
              <span class="glyphicon" aria-hidden="true">
                <i class="far fa-folder" data-fa-transform="down-5 shrink-2"></i>
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
            <button @click="selectViewMode('full')" type="button" class="options-view-card" :class="{ selected: $store.data.currentSelection.viewMode === 'full' }">
              <span class="options-view-title">Full content</span>
              <span class="options-view-description">Show the full article content</span>
            </button>
            <button @click="selectViewMode('summarized')" type="button" class="options-view-card" :class="{ selected: $store.data.currentSelection.viewMode === 'summarized' }">
              <span class="options-view-title">Summarized content</span>
              <span class="options-view-description">Show the AI generated summary</span>
            </button>
            <button v-if="$store.data.currentSelection.AIEnabled" @click="selectViewMode('summaryBullets')" type="button" class="options-view-card" :class="{ selected: $store.data.currentSelection.viewMode === 'summaryBullets' }">
              <span class="options-view-title">Summary bullets</span>
              <span class="options-view-description">Show short summaries as bullet points</span>
            </button>
            <button @click="selectViewMode('minimal')" type="button" class="options-view-card" :class="{ selected: $store.data.currentSelection.viewMode === 'minimal' }">
              <span class="options-view-title">Minimal content</span>
              <span class="options-view-description">Show only the title and metadata</span>
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
          <button @click="subscribeNotifications()" type="button" class="options-action-button options-action-button--neutral">Subscribe to notifications</button>
        </section>

        <section v-if="$store.data.currentSelection.AIEnabled" class="options-section options-section--secondary" aria-labelledby="chat-options-heading">
          <div class="options-section-header">
            <h3 id="chat-options-heading">Chat assistant</h3>
          </div>
          <button @click="chatAssistant()" type="button" class="options-action-button options-action-button--neutral">{{ $store.data.chatAssistantOpen ? 'Close Chat' : 'Open Chat' }}</button>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  --options-sheet-bottom-gap: calc(12px + env(safe-area-inset-bottom));
  align-items: flex-end;
  background: rgba(17, 24, 39, 0.45);
  box-sizing: border-box;
  display: flex;
  height: 100%;
  height: 100dvh;
  left: 0;
  overflow: hidden;
  overscroll-behavior: contain;
  padding: 0 12px var(--options-sheet-bottom-gap);
  position: fixed;
  top: 0;
  width: 100%;
  z-index: 9999;
}

.options-sheet {
  -webkit-overflow-scrolling: touch;
  background: #FFFFFF;
  border: 1px solid #E5E7EB;
  border-radius: 20px;
  box-shadow: 0 -12px 32px rgba(17, 24, 39, 0.16);
  box-sizing: border-box;
  height: min(calc(100vh - var(--options-sheet-bottom-gap)), calc(96vh + 12px - var(--options-sheet-bottom-gap)));
  height: min(calc(100dvh - var(--options-sheet-bottom-gap)), calc(96dvh + 12px - var(--options-sheet-bottom-gap)));
  max-height: min(calc(100vh - var(--options-sheet-bottom-gap)), calc(96vh + 12px - var(--options-sheet-bottom-gap)));
  max-height: min(calc(100dvh - var(--options-sheet-bottom-gap)), calc(96dvh + 12px - var(--options-sheet-bottom-gap)));
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 20px calc(56px + env(safe-area-inset-bottom));
  width: 100%;
}

.options-drag-handle {
  background: #C7CDD6;
  border-radius: 999px;
  height: 5px;
  margin: 4px auto 14px;
  width: 44px;
}

.options-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: 24px;
}

.options-header h2 {
  color: #111827;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.2;
  margin: 0;
}

.mobile-close-button {
  align-items: center;
  background: #FFFFFF;
  border: 0;
  border-radius: 50%;
  color: #111827;
  display: inline-flex;
  flex: 0 0 40px;
  height: 40px;
  justify-content: center;
  padding: 0;
  position: relative;
  width: 40px;
}

.mobile-close-button::before,
.mobile-close-button::after {
  background-color: currentColor;
  content: "";
  height: 18px;
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
  background: #F3F4F6;
}

.overlay-content {
  text-align: left;
}

.options-section + .options-section {
  margin-top: 28px;
}

.options-section-header {
  align-items: center;
  display: flex;
  gap: 10px;
  margin-bottom: 12px;
}

.options-section-header h3 {
  color: #111827;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
  margin: 0;
}

.options-section-number {
  align-items: center;
  background: #EFF6FF;
  border-radius: 50%;
  color: #2563EB;
  display: inline-flex;
  flex: 0 0 24px;
  font-size: 13px;
  font-weight: 700;
  height: 24px;
  justify-content: center;
}

.options-list {
  list-style: none;
  margin: 0;
  max-height: min(38vh, 330px);
  overflow-y: auto;
  padding: 0;
  -webkit-overflow-scrolling: touch;
}

.options-row {
  align-items: center;
  border-bottom: 1px solid #EEF0F3;
  box-sizing: border-box;
  color: #111827;
  cursor: pointer;
  display: flex;
  font-size: 15px;
  gap: 12px;
  min-height: 48px;
  padding: 0 12px;
  position: relative;
}

.options-row .glyphicon {
  color: #6B7280;
  width: 18px;
}

.options-row::after {
  border: 2px solid #B8C0CC;
  border-radius: 50%;
  content: "";
  height: 18px;
  margin-left: auto;
  width: 18px;
}

.options-row.selected {
  background: #EFF6FF;
  border: 1px solid #3B82F6;
  border-radius: 10px;
  color: #1D4ED8;
  font-weight: 600;
  margin: 2px 0;
}

.options-row.selected::after {
  background: #2563EB;
  border-color: #2563EB;
  box-shadow: inset 0 0 0 4px #EFF6FF;
}

.options-row.selected .glyphicon {
  color: #2563EB;
}

.options-view-grid {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.options-view-card {
  background: #FFFFFF;
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  color: #111827;
  display: flex;
  flex-direction: column;
  min-height: 78px;
  padding: 14px;
  text-align: left;
}

.options-view-card.selected {
  background: #EFF6FF;
  border-color: #2563EB;
}

.options-view-title {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
}

.options-view-description {
  color: #6B7280;
  font-size: 13px;
  line-height: 1.4;
  margin-top: 5px;
}

.options-action-button {
  background: #FFFFFF;
  border: 1px solid;
  border-radius: 10px;
  font-weight: 700;
  height: 48px;
  width: 100%;
}

.options-action-button--refresh {
  background: #FEF2F2;
  border-color: #EF4444;
  color: #DC2626;
}

.options-action-button--add {
  background: #F0FDF4;
  border-color: #22C55E;
  color: #15803D;
}

.options-action-button--neutral {
  border-color: #D1D5DB;
  color: #374151;
}

.options-action-button:hover,
.options-action-button:focus-visible,
.options-view-card:hover,
.options-view-card:focus-visible {
  filter: brightness(0.98);
}

@media (max-width: 359px) {
  .options-sheet {
    padding-left: 16px;
    padding-right: 16px;
  }

  .options-view-grid {
    grid-template-columns: 1fr;
  }
}

@media (prefers-color-scheme: dark) {
  .options-sheet {
    background: var(--dark-page-surface);
    border-color: #374151;
  }

  .options-header h2,
  .options-section-header h3,
  .options-row,
  .options-view-card {
    color: var(--text-inverted);
  }

  .mobile-close-button,
  .options-view-card,
  .options-action-button--neutral {
    background: var(--bg-modal);
  }

  .options-row {
    border-bottom-color: #374151;
  }

  .options-row .glyphicon,
  .options-view-description {
    color: var(--text-muted);
  }
}

:global(body.mobile-options-open) {
  overflow: hidden;
}
</style>

<script>
export default {
  props: ["mobile"],
  watch: {
    mobile: {
      immediate: true,
      handler(isOpen) {
        document.body.classList.toggle('mobile-options-open', isOpen);
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
      this.$store.data.setShowModal('NewFeed');
    },
    refreshFeeds() {
      this.$emit('refresh');
    },
    subscribeNotifications() {
      //register service worker
      Notification.requestPermission().then(function(permission) {
        if (permission !== 'granted') {
          throw new Error('Permission not granted for Notification')
        }
      });
    },
    chatAssistant() {
      this.$store.data.chatAssistantOpen = !this.$store.data.chatAssistantOpen;
      this.emitClickEvent('mobile', null);
    },
    selectCategory(categoryId) {
      this.$store.data.currentSelection.categoryId = categoryId;
      this.$store.data.currentSelection.feedId = '%';
      setTimeout(() => {
        this.emitClickEvent('mobile', null);
      }, 150);
    },
    selectViewMode(mode) {
      this.$store.data.currentSelection.viewMode = mode;
      setTimeout(() => {
        this.emitClickEvent('mobile', null);
      }, 150);
    }
  }
};
</script>
