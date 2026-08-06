<template>
  <div ref="toolbarContainer" class="mobile-toolbar-container">
    <nav id="mobile-toolbar" class="mobile-toolbar" aria-label="Mobile article toolbar">
      <div class="mobile-toolbar-brand-row">
        <div class="mobile-toolbar-brand">
          <img
            class="mobile-toolbar-logo"
            src="../../assets/images/monster-ui-64.webp"
            srcset="../../assets/images/monster-ui-64.webp 1x, ../../assets/images/monster-ui-128.webp 2x"
            width="42"
            height="42"
            alt=""
          />
          <span>RSSMonster</span>
        </div>
        <div class="mobile-toolbar-actions">
          <button
            type="button"
            class="mobile-toolbar-button mobile-refresh-button"
            :title="refreshing ? 'Refreshing articles…' : 'Refresh articles'"
            :aria-label="refreshing ? 'Refreshing articles…' : 'Refresh articles'"
            :aria-busy="refreshing"
            :disabled="refreshing"
            @click="$emit('refresh')"
          >
            <BootstrapIcon
              icon="arrow-clockwise"
              :animation="refreshing ? 'spin' : ''"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            class="mobile-toolbar-button mobile-search-toggle"
            title="Search"
            aria-label="Search articles"
            @click="toggleSearch"
            data-behavior="search"
            data-remote="true"
          >
            <BootstrapIcon icon="search" aria-hidden="true" />
          </button>
          <button
            type="button"
            @click="emitClickEvent('mobile','mobile')"
            class="mobile-toolbar-button mobile-icon-button mobile-settings-button"
            title="Settings"
            aria-label="Open settings"
          >
            <BootstrapIcon icon="gear-fill" aria-hidden="true" />
          </button>
        </div>
      </div>
      <div class="mobile-toolbar-filters">
        <!-- Read Mode Dropdown -->
        <AppDropdown id="readModeDropdown" :close-key="selectionCloseKey" class="mobile-toolbar-filter">
          <template #trigger="{ triggerProps }">
            <button v-bind="triggerProps" class="mobile-filter-button" type="button">
              {{ currentStatus === 'briefing' ? 'Daily briefing' : capitalize(currentStatus) }} {{ getStatusCount() }}
            </button>
          </template>
          <template #menu="{ menuProps }">
            <div v-bind="menuProps">
        <button v-if="isAIEnabled" type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentStatus === 'briefing' }" role="menuitem" @click="statusClicked('briefing')">Daily briefing {{ overviewStore.briefingCount }}</button>
        <button type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentStatus === 'unread' }" role="menuitem" @click="statusClicked('unread')">Unread {{ overviewStore.unreadCount }}</button>
        <button type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentStatus === 'favorite' }" role="menuitem" @click="statusClicked('favorite')">Favorite {{ overviewStore.favoriteCount }}</button>
        <button type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentStatus === 'hot' }" role="menuitem" @click="statusClicked('hot')">Hot {{ overviewStore.hotCount }}</button>
        <button type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentStatus === 'clicked' }" role="menuitem" @click="statusClicked('clicked')">Clicked {{ overviewStore.clickedCount }}</button>
        <button type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentStatus === 'read' }" role="menuitem" @click="statusClicked('read')">Read {{ overviewStore.readCount }}</button>
        <hr class="app-dropdown__divider">
        <button type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentSelection.sort === 'asc' }" role="menuitem" @click="sortClicked('asc')">Oldest</button>
        <button type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentSelection.sort === 'desc' }" role="menuitem" @click="sortClicked('desc')">Newest</button>
        <button type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentSelection.sort === 'trust' }" role="menuitem" @click="sortClicked('trust')">Trust</button>
        <button v-if="isAIEnabled" type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentSelection.sort === 'recommended' }" role="menuitem" @click="sortClicked('recommended')">Recommended</button>
        <button v-if="isAIEnabled" type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentSelection.sort === 'quality' }" role="menuitem" @click="sortClicked('quality')">Quality</button>
        <button v-if="isAIEnabled" type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentSelection.sort === 'attention' }" role="menuitem" @click="sortClicked('attention')">Most Engaged</button>
        <hr v-if="isAIEnabled" class="app-dropdown__divider">
        <button v-if="isAIEnabled" type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentSelection.grouping === 'none' }" role="menuitem" @click="setGrouping('none')">All articles</button>
        <button v-if="isAIEnabled" type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentSelection.grouping === 'event' }" role="menuitem" @click="setGrouping('event')">Cluster per event</button>
        <button v-if="isAIEnabled" type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentSelection.grouping === 'topic' }" role="menuitem" @click="setGrouping('topic')">Cluster per topic</button>
            </div>
          </template>
        </AppDropdown>
        <!-- Smart Folder Dropdown -->
        <AppDropdown id="smartFoldersDropdown" :close-key="selectionCloseKey" class="mobile-toolbar-filter">
          <template #trigger="{ triggerProps }">
            <button v-bind="triggerProps" class="mobile-filter-button" type="button">
              {{ 'Smart folders' }}
            </button>
          </template>
          <template #menu="{ menuProps }">
            <div v-bind="menuProps">
        <button type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentSelection.smartFolderId === null }" role="menuitem"
          @click="selectionStore.setSmartFolder(null)"
        >
          {{ 'No smart folder' }}
        </button>
        <button
          v-for="folder in smartFolders"
          :key="folder.id"
          class="app-dropdown__item"
          :class="{ 'app-dropdown__item--active': currentSelection.smartFolderId === folder.id }"
          type="button"
          role="menuitem"
          @click="selectionStore.setSmartFolder(folder)"
        >
          {{ folder.name }} {{ folder.ArticleCount }}
        </button>
            </div>
          </template>
        </AppDropdown>
        <!-- Categories Dropdown -->
        <AppDropdown id="categoriesDropdown" :close-key="selectionCloseKey" class="mobile-toolbar-filter">
          <template #trigger="{ triggerProps }">
            <button v-bind="triggerProps" class="mobile-filter-button" type="button">
              {{ 'Categories' }}
            </button>
          </template>
          <template #menu="{ menuProps }">
            <div v-bind="menuProps">
        <button type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentSelection.categoryId === '%' }" role="menuitem"
          @click="selectionStore.selectCategory('%')"
        >
          {{ 'All categories' }}
        </button>
        <button
          v-for="category in categories"
          :key="category.id"
          class="app-dropdown__item"
          :class="{ 'app-dropdown__item--active': Number(currentSelection.categoryId) === category.id }"
          type="button"
          role="menuitem"
          @click="selectionStore.selectCategory(category.id)"
        >
          {{ category.name }} {{ getCategoryCount(category) }}
        </button>
            </div>
          </template>
        </AppDropdown>
      </div>
    </nav>
    <div v-if="showSearch" class="mobile-search-panel">
      <input
        ref="searchInput"
        v-model="searchQuery"
        @input="updateSearch"
        type="text"
        class="mobile-search-input"
        placeholder="Search articles..."
        @keyup.enter="performSearch"
        @keyup.esc="toggleSearch"
        autofocus
      />
    </div>
  </div>
  <div
    class="mobile-toolbar-spacer"
    :style="toolbarHeight > 0 ? { height: `${toolbarHeight}px` } : null"
    aria-hidden="true"
  ></div>
</template>

<style scoped>
.mobile-toolbar-container {
  display: contents;
}

.mobile-toolbar-spacer {
  display: none;
}

.mobile-toolbar {
  --mobile-toolbar-block-start: 8px;
  --mobile-toolbar-block-end: 8px;
  --mobile-toolbar-inline-padding: 12px;
  --mobile-toolbar-row-gap: 8px;
  --mobile-toolbar-filter-gap: 16px;

  position: sticky;
  top: 0;
  z-index: var(--layer-sticky);
  display: grid;
  row-gap: var(--mobile-toolbar-row-gap);
  width: 100%;
  padding-block: var(--mobile-toolbar-block-start) var(--mobile-toolbar-block-end);
  padding-inline: var(--mobile-toolbar-inline-padding);
  color: var(--text-primary);
  background-color: var(--desktop-toolbar-background);
  border-bottom: 1px solid var(--border-subtle);
}

@media (max-width: 879px) {
  .mobile-toolbar {
    transition: transform 150ms ease;
    will-change: transform;
  }

  .mobile-toolbar.hide {
    transform: translateY(-100%);
  }
}

/* Keeps the hybrid toolbar fixed while a measured spacer preserves its place in the article flow. */
@media (min-width: 768px) and (max-width: 879px) {
  .mobile-toolbar-container {
    position: fixed;
    top: 0;
    right: 0;
    left: var(--sidebar-width);
    z-index: 9999;
    display: block;
    pointer-events: none;
  }

  .mobile-toolbar,
  .mobile-search-panel {
    pointer-events: auto;
  }

  .mobile-toolbar {
    position: relative;
    top: auto;
  }

  .mobile-toolbar-spacer {
    display: block;
    flex: 0 0 auto;
    width: 100%;
    height: 59px;
  }
}

.mobile-toolbar-brand-row,
.mobile-toolbar-actions,
.mobile-toolbar-brand,
.mobile-toolbar-filters {
  display: flex;
  align-items: center;
}

.mobile-toolbar-brand-row {
  justify-content: space-between;
  min-width: 0;
  margin: 0;
}

.mobile-toolbar-brand {
  gap: 10px;
  color: var(--text-primary);
  font-size: 26px;
  font-weight: 700;
  letter-spacing: -0.02em;
}

.mobile-toolbar-logo {
  width: 42px;
  height: 42px;
  object-fit: contain;
}

.mobile-toolbar-actions {
  gap: 4px;
}

.mobile-toolbar-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--color-transparent);
  color: var(--text-primary);
  font-size: 18px;
  cursor: pointer;
}

.mobile-toolbar-button:hover,
.mobile-toolbar-button:focus-visible {
  background: var(--bg-muted);
}

.mobile-toolbar-button:disabled {
  opacity: 0.55;
  cursor: wait;
}

.mobile-toolbar-filters {
  gap: var(--mobile-toolbar-filter-gap);
  min-width: 0;
  overflow: visible;
}

.mobile-toolbar-filter {
  flex: 0 1 auto;
  min-width: 0;
  margin-right: 0;
}

.mobile-search-panel {
  position: relative;
  width: 100%;
  padding: 10px 16px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-subtle);
}

.mobile-search-input {
  width: 100%;
  height: 42px;
  padding: 0 14px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-control);
  border-radius: 14px;
  outline: none;
  font-size: 15px;
}

.mobile-filter-button {
  max-width: 100%;
  height: 40px;
  padding: 0 6px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-control);
  border-radius: 14px;
  box-shadow: 0 1px 2px var(--shadow-card-subtle-color);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.mobile-filter-button:hover,
.mobile-filter-button[aria-expanded='true'] {
  color: var(--text-primary);
  background: var(--bg-page);
  border-color: var(--border-strong);
  box-shadow: none;
}

.mobile-filter-button:focus {
  color: var(--text-primary);
  background: var(--bg-page);
  border-color: var(--border-focus);
  box-shadow: none;
}

.mobile-filter-button::after {
  display: inline-block;
  margin-left: 6px;
  vertical-align: 0.255em;
  content: '';
  border-top: 0.3em solid;
  border-right: 0.3em solid var(--color-transparent);
  border-bottom: 0;
  border-left: 0.3em solid var(--color-transparent);
}

@media (max-width: 360px) {
  .mobile-toolbar {
    --mobile-toolbar-filter-gap: 14px;
  }

  .mobile-filter-button {
    padding: 0 4px;
  }
}

/* Preserves the circular action surfaces across portrait and landscape mobile toolbar layouts. */
@media (max-width: 879px) {
  .mobile-toolbar-button {
    position: relative;
    isolation: isolate;
    color: var(--toolbar-text);
    background: var(--color-transparent);
  }

  .mobile-toolbar-button::before {
    position: absolute;
    z-index: 0;
    inset: 2px;
    content: '';
    background-color: var(--bg-card);
    border: 1px solid var(--border-control);
    border-radius: 999px;
    pointer-events: none;
  }

  .mobile-toolbar-button:hover,
  .mobile-toolbar-button:focus-visible {
    background: var(--color-transparent);
  }

  .mobile-toolbar-button:hover::before,
  .mobile-toolbar-button:focus-visible::before {
    background-color: var(--bg-toolbar-control-hover);
  }

  .mobile-toolbar-button:focus-visible {
    outline: 2px solid var(--border-focus);
    outline-offset: 1px;
  }

  .mobile-toolbar-button :deep(svg) {
    position: relative;
    z-index: 1;
    display: block;
    width: 20px;
    height: 20px;
    margin-bottom: 0;
  }
}

/* Lets the toolbar own phone portrait compaction and the filter row's inner alignment. */
@media (max-width: 879px) and (orientation: portrait) {
  .mobile-toolbar {
    --mobile-toolbar-block-start: 0px;
    --mobile-toolbar-block-end: 8px;
    --mobile-toolbar-inline-padding: 8px;
    --mobile-toolbar-row-gap: 0px;
  }

  .mobile-toolbar-brand-row {
    min-height: 54px;
    margin: 0;
  }

  .mobile-toolbar-brand {
    flex: 1 1 auto;
    min-width: 0;
    gap: 10px;
    font-size: 20px;
  }

  .mobile-toolbar-brand span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-toolbar-logo {
    flex: 0 0 auto;
    width: 38px;
    height: 38px;
  }

  .mobile-toolbar-actions {
    flex: 0 0 auto;
    gap: 2px;
  }

  .mobile-toolbar-button {
    width: 40px;
    height: 40px;
    font-size: 20px;
  }

  .mobile-filter-button {
    height: 34px;
    border-radius: 8px;
    font-size: 14px;
  }

  .mobile-toolbar-filters {
    padding-inline: 4px;
  }
}

/* Uses the persistent sidebar as the sole brand surface in the hybrid layout. */
@media (min-width: 768px) and (max-width: 879px) {
  .mobile-toolbar {
    --mobile-toolbar-block-start: 8px;
    --mobile-toolbar-block-end: 8px;
    --mobile-toolbar-inline-padding: 12px;
    --mobile-toolbar-row-gap: 8px;
    --mobile-toolbar-filter-gap: 8px;

    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mobile-toolbar-brand-row {
    flex: 0 0 auto;
    order: 2;
    min-height: 0;
    margin: 0;
  }

  .mobile-toolbar-brand {
    display: none;
  }

  .mobile-toolbar-filters {
    flex: 1 1 auto;
    order: 1;
    min-width: 0;
    padding-inline: 0;
  }

  .mobile-toolbar-filter {
    flex: 1 1 0;
    min-width: 0;
    margin-right: 0;
  }

  .mobile-filter-button {
    width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

:global(:root[data-theme='dark']) {
  .mobile-toolbar {
    color: var(--text-inverted);
    background-color: var(--desktop-toolbar-background);
    border-bottom-color: var(--dark-contrast);
  }

  .mobile-toolbar-brand,
  .mobile-toolbar-button,
  .mobile-filter-button,
  .mobile-filter-button:hover,
  .mobile-filter-button:focus,
  .mobile-filter-button[aria-expanded='true'] {
    color: var(--text-inverted) !important;
  }

  .mobile-toolbar-button:hover,
  .mobile-toolbar-button:focus-visible {
    background: var(--bg-subtle);
  }

  .mobile-filter-button {
    background: var(--bg-control);
    border-color: var(--border-control);
  }

  .mobile-filter-button:hover,
  .mobile-filter-button[aria-expanded='true'] {
    background: var(--bg-control);
    border-color: var(--border-strong);
  }

  .mobile-filter-button:focus {
    background: var(--bg-control);
    border-color: var(--border-focus);
  }

  .mobile-search-panel {
    background-color: var(--toolbar-search-background-dark);
    border-bottom-color: var(--border-subtle);
  }

  .mobile-search-input {
    color: var(--text-inverted);
    background: var(--bg-control);
    border-color: var(--border-control);
  }

  .mobile-search-input::placeholder {
    color: var(--text-muted);
  }

}

:global(:root[data-theme='dark'] .mobile-toolbar) {
  color: var(--text-inverted);
  background-color: var(--desktop-toolbar-background);
  border-bottom-color: var(--border-subtle);
}

:global(:root[data-theme='dark'] .mobile-toolbar-brand),
:global(:root[data-theme='dark'] .mobile-toolbar-button),
:global(:root[data-theme='dark'] .mobile-filter-button),
:global(:root[data-theme='dark'] .mobile-filter-button:hover),
:global(:root[data-theme='dark'] .mobile-filter-button:focus),
:global(:root[data-theme='dark'] .mobile-filter-button[aria-expanded='true']) {
  color: var(--text-inverted) !important;
}

:global(:root[data-theme='dark'] .mobile-toolbar-button:hover),
:global(:root[data-theme='dark'] .mobile-toolbar-button:focus-visible) {
  background: var(--bg-subtle);
}

:global(:root[data-theme='dark'] .mobile-filter-button) {
  background: var(--bg-control);
  border-color: var(--border-control);
}

:global(:root[data-theme='dark'] .mobile-filter-button:hover),
:global(:root[data-theme='dark'] .mobile-filter-button[aria-expanded='true']) {
  background: var(--bg-control);
  border-color: var(--border-strong);
}

:global(:root[data-theme='dark'] .mobile-filter-button:focus) {
  background: var(--bg-control);
  border-color: var(--border-focus);
}

:global(:root[data-theme='dark'] .mobile-search-panel) {
  background-color: var(--toolbar-search-background-dark);
  border-bottom-color: var(--border-subtle);
}

:global(:root[data-theme='dark'] .mobile-search-input) {
  color: var(--text-inverted);
  background: var(--bg-control);
  border-color: var(--border-control);
}

:global(:root[data-theme='dark'] .mobile-search-input::placeholder) {
  color: var(--text-muted);
}

@media (max-width: 879px) {
  :global(:root[data-theme='dark'] .mobile-toolbar-button),
  :global(:root[data-theme='dark'] .mobile-toolbar-button:hover),
  :global(:root[data-theme='dark'] .mobile-toolbar-button:focus-visible) {
    background: var(--color-transparent);
  }

  :global(:root[data-theme='dark'] .mobile-toolbar-button::before) {
    background-color: var(--bg-control);
    border-color: var(--border-subtle);
  }

  :global(:root[data-theme='dark'] .mobile-toolbar-button:hover::before),
  :global(:root[data-theme='dark'] .mobile-toolbar-button:focus-visible::before) {
    background-color: var(--toolbar-settings-hover-background-dark);
  }
}
</style>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { useOverviewStore } from '../../store/overview.js';
import { useUiStore } from '../../store/ui.js';
import AppDropdown from '../shared/AppDropdown.vue';
const MOBILE_LANDSCAPE_WIDTH = 880;

const statusCountMap = {
  briefing: 'briefingCount',
  unread: 'unreadCount',
  favorite: 'favoriteCount',
  hot: 'hotCount',
  clicked: 'clickedCount',
  read: 'readCount'
};

export default {
  components: { AppDropdown },
  props: {
    refreshing: {
      type: Boolean,
      default: false
    }
  },
  emits: ['mobile', 'forceReload', 'refresh'],
  data() {
    return {
      showSearch: false,
      toolbarHeight: 0,
      toolbarMeasurementFrameId: null,
      toolbarResizeObserver: null
    };
  },
  mounted() {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
    window.addEventListener('rssmonster:focus-search', this.focusSearchInput);
    this.$nextTick(this.setupToolbarMeasurement);
  },
  unmounted() {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    window.removeEventListener('rssmonster:focus-search', this.focusSearchInput);
    if (this.toolbarMeasurementFrameId !== null) {
      window.cancelAnimationFrame?.(this.toolbarMeasurementFrameId);
      this.toolbarMeasurementFrameId = null;
    }
    this.toolbarResizeObserver?.disconnect();
    this.toolbarResizeObserver = null;
    this.uiStore.setMobileSearchOpen(false);
  },
  methods: {
    // This function keeps the hybrid toolbar spacer equal to the rendered toolbar stack.
    updateToolbarHeight() {
      this.toolbarHeight = Math.ceil(
        this.$refs.toolbarContainer?.getBoundingClientRect().height || 0
      );
    },
    // This function measures after rotation styles and the visual viewport have settled.
    scheduleToolbarMeasurement() {
      if (this.toolbarMeasurementFrameId !== null) {
        window.cancelAnimationFrame?.(this.toolbarMeasurementFrameId);
      }

      if (typeof window.requestAnimationFrame !== 'function') {
        this.toolbarMeasurementFrameId = null;
        this.updateToolbarHeight();
        return;
      }

      // Two frames avoid retaining dimensions from Safari's pre-rotation layout pass.
      this.toolbarMeasurementFrameId = window.requestAnimationFrame(() => {
        this.toolbarMeasurementFrameId = window.requestAnimationFrame(() => {
          this.toolbarMeasurementFrameId = null;
          this.updateToolbarHeight();
        });
      });
    },
    // This function observes toolbar and search-panel height changes in the hybrid layout.
    setupToolbarMeasurement() {
      this.scheduleToolbarMeasurement();
      if (typeof ResizeObserver !== 'function' || !this.$refs.toolbarContainer) return;

      // This observer updates the spacer whenever responsive rows or search change height.
      this.toolbarResizeObserver = new ResizeObserver(() => this.scheduleToolbarMeasurement());
      this.toolbarResizeObserver.observe(this.$refs.toolbarContainer);
    },
    // This function emits a toolbar selection event.
    emitClickEvent(eventType, value) {
      this.$emit(eventType, value);
    },
    // This function closes mobile search when the layout becomes wide enough.
    handleResize() {
      this.scheduleToolbarMeasurement();
      // Close search when switching from portrait to landscape
      if (this.showSearch && window.innerWidth >= MOBILE_LANDSCAPE_WIDTH) {
        this.toggleSearch();
      }
    },
    // This function applies the current mobile search query.
    updateSearch() {
      this.selectionStore.setSelectedSearch(this.uiStore.searchQuery);
    },
    // This function toggles the mobile search controls and shared state.
    toggleSearch() {
      this.showSearch = !this.showSearch;
      this.uiStore.setMobileSearchOpen(this.showSearch);
      this.$nextTick(this.scheduleToolbarMeasurement);
    },
    // This function opens and focuses the mobile search input.
    focusSearchInput() {
      this.showSearch = true;
      this.uiStore.setMobileSearchOpen(true);
      this.$nextTick(() => {
        this.$refs.searchInput?.focus();
        this.scheduleToolbarMeasurement();
      });
    },
    // This function changes the grouping only when the value differs.
    setGrouping: function(value) {
      // Don't trigger if already at the selected value
      if (this.selectionStore.currentSelection.grouping === value) {
        return;
      }
      this.selectionStore.setGrouping(value);
    },
    // This function applies a non-empty mobile search query.
    performSearch() {
      if (this.uiStore.searchQuery.trim()) {
        this.selectionStore.setSelectedSearch(this.uiStore.searchQuery);
        this.toggleSearch();
      }
    },
    // This function updates the active article sort order.
    sortClicked: function(sort) {
      this.selectionStore.setSelectedSort(sort);
    },
    // This function updates the selected status, clearing smart folders before reloading.
    statusClicked: function(status) {
      const currentSelection = this.selectionStore.currentSelection;
      if (status === currentSelection.status && currentSelection.smartFolderId === null) {
        this.$emit('forceReload');
      } else {
        this.selectionStore.setSelectedStatus(status);
      }
    },
    // This function returns the count for the active article status.
    getStatusCount() {
      return this.overviewStore[statusCountMap[this.currentStatus]] ?? 0;
    },
    // This function returns a category count for the active article status.
    getCategoryCount(category) {
      return category[statusCountMap[this.currentStatus]] ?? 0;
    }
  },
  computed: {
    ...mapStores(useSelectionStore, useOverviewStore, useUiStore),
    // This computed field routes shared search changes through the store action contract.
    searchQuery: {
      get() {
        return this.uiStore.searchQuery;
      },
      set(value) {
        this.uiStore.setSearchQuery(value);
      }
    },
    currentSelection() {
      return this.selectionStore.currentSelection;
    },
    // This function closes open mobile menus when the active article view changes.
    selectionCloseKey() {
      const selection = this.currentSelection;
      return [selection.status, selection.viewMode, selection.sort, selection.grouping, selection.smartFolderId, selection.categoryId].join(':');
    },
    smartFolders() {
      return this.overviewStore.smartFolders;
    },
    categories() {
      return this.overviewStore.categories;
    },
    currentStatus() {
      return this.currentSelection.status;
    },
    isAIEnabled() {
      return this.currentSelection.AIEnabled;
    },
    capitalize() {
      return function(s) {
        if (typeof s !== 'string') return '';
        return s.charAt(0).toUpperCase() + s.slice(1);
      };
    }
  }
};
</script>
