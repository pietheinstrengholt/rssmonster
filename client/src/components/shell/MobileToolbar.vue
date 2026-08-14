<template>
  <div class="mobile-toolbar-container">
    <div class="mobile-toolbar-surface" :class="{ hide: hidden }">
      <nav
        id="mobile-toolbar"
        class="mobile-toolbar"
        aria-label="Mobile article toolbar"
      >
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
            v-if="selectionSettingsAction"
            type="button"
            class="mobile-toolbar-button mobile-selection-settings-button"
            :title="selectionSettingsAction.label"
            :aria-label="selectionSettingsAction.label"
            @click="openSelectionSettings"
          >
            <BootstrapIcon icon="sliders2" aria-hidden="true" />
          </button>
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
            ref="searchButton"
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
              {{ currentStatusLabel }} {{ getStatusCount() }}
            </button>
          </template>
          <template #menu="{ menuProps }">
            <div v-bind="menuProps">
        <button v-for="option in visibleStatusOptions" :key="option.value" type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentStatus === option.value }" role="menuitem" @click="statusClicked(option.value)">{{ option.label }} {{ getStatusCount(option.value) }}</button>
        <hr class="app-dropdown__divider">
        <button v-for="option in visibleSortOptions" :key="option.value" type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentSelection.sort === option.value }" role="menuitem" :disabled="briefingPresentationControlsDisabled" :title="briefingPresentationControlsDisabled ? briefingPresentationDisabledTitle : null" @click="sortClicked(option.value)">{{ option.label }}</button>
        <hr v-if="isAIEnabled" class="app-dropdown__divider">
        <button v-for="option in visibleGroupingOptions" :key="option.value" type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': currentSelection.grouping === option.value }" role="menuitem" :disabled="briefingPresentationControlsDisabled" :title="briefingPresentationControlsDisabled ? briefingPresentationDisabledTitle : null" @click="setGrouping(option.value)">{{ option.mobileLabel }}</button>
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
      <div v-if="showSearch" ref="searchPanel" class="mobile-search-panel">
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
  </div>
</template>

<style scoped>
.mobile-toolbar-container {
  position: sticky;
  top: 0;
  z-index: var(--layer-sticky);
  display: block;
  width: 100%;
  pointer-events: none;
}

.mobile-toolbar {
  --mobile-toolbar-block-start: 8px;
  --mobile-toolbar-block-end: 8px;
  --mobile-toolbar-inline-padding: 12px;
  --mobile-toolbar-row-gap: 8px;
  --mobile-toolbar-filter-gap: 16px;

  display: grid;
  row-gap: var(--mobile-toolbar-row-gap);
  width: 100%;
  padding-block: var(--mobile-toolbar-block-start) var(--mobile-toolbar-block-end);
  padding-inline: var(--mobile-toolbar-inline-padding);
  color: var(--text-primary);
  background-color: var(--desktop-toolbar-background);
  border-bottom: 1px solid var(--border-subtle);
  pointer-events: auto;
}

@media (max-width: 879px) {
  .mobile-toolbar-surface {
    transition: transform 150ms ease;
    will-change: transform;
  }

  .mobile-toolbar-surface.hide {
    transform: translateY(-100%);
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
  font-size: 20px;
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
  font-size: 20px;
  cursor: pointer;
}

.mobile-toolbar-button:hover,
.mobile-toolbar-button:focus-visible {
  background: var(--surface-chrome);
}

.mobile-toolbar-button:disabled {
  opacity: 0.55;
  cursor: wait;
}

.mobile-selection-settings-button {
  display: none;
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
  background: var(--surface-card);
  border-bottom: 1px solid var(--border-subtle);
  pointer-events: auto;
}

.mobile-search-input {
  width: 100%;
  height: 42px;
  padding: 0 14px;
  color: var(--text-primary);
  background: var(--surface-card);
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
  background: var(--surface-card);
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
  background: var(--surface-page);
  border-color: var(--border-strong);
  box-shadow: none;
}

.mobile-filter-button:focus {
  color: var(--text-primary);
  background: var(--surface-page);
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
  .mobile-selection-settings-button {
    display: inline-flex;
  }

  .mobile-filter-button {
    height: var(--shell-filter-control-height, 34px);
    border-radius: 8px;
  }

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
    background-color: var(--surface-card);
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
  }

  .mobile-toolbar-filters {
    padding-inline: 4px;
  }
}

/* Uses the persistent sidebar as the sole brand surface in the hybrid layout. */
@media (min-width: 768px) and (max-width: 879px) {
  .mobile-toolbar {
    --mobile-toolbar-block-start: 6px;
    --mobile-toolbar-block-end: 6px;
    --mobile-toolbar-inline-padding: 12px;
    --mobile-toolbar-row-gap: 8px;
    --mobile-toolbar-filter-gap: 8px;

    display: flex;
    align-items: center;
    gap: 8px;
    box-sizing: border-box;
    max-width: 100%;
    min-width: 0;
    min-height: var(--shell-toolbar-height, 56px);
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
    flex: 1 1 0;
    order: 1;
    width: 0;
    max-width: 100%;
    min-width: 0;
    padding-inline: 0;
  }

  .mobile-toolbar-filter {
    flex: 1 1 0;
    width: 0;
    max-width: 100%;
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
    border-bottom-color: var(--surface-page);
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
    background: var(--surface-chrome);
  }

  .mobile-filter-button {
    background: var(--surface-control);
    border-color: var(--border-control);
  }

  .mobile-filter-button:hover,
  .mobile-filter-button[aria-expanded='true'] {
    background: var(--surface-control);
    border-color: var(--border-strong);
  }

  .mobile-filter-button:focus {
    background: var(--surface-control);
    border-color: var(--border-focus);
  }

  .mobile-search-panel {
    background-color: var(--toolbar-search-background-dark);
    border-bottom-color: var(--border-subtle);
  }

  .mobile-search-input {
    color: var(--text-inverted);
    background: var(--surface-control);
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
  background: var(--surface-chrome);
}

:global(:root[data-theme='dark'] .mobile-filter-button) {
  background: var(--surface-control);
  border-color: var(--border-control);
}

:global(:root[data-theme='dark'] .mobile-filter-button:hover),
:global(:root[data-theme='dark'] .mobile-filter-button[aria-expanded='true']) {
  background: var(--surface-control);
  border-color: var(--border-strong);
}

:global(:root[data-theme='dark'] .mobile-filter-button:focus) {
  background: var(--surface-control);
  border-color: var(--border-focus);
}

:global(:root[data-theme='dark'] .mobile-search-panel) {
  background-color: var(--toolbar-search-background-dark);
  border-bottom-color: var(--border-subtle);
}

:global(:root[data-theme='dark'] .mobile-search-input) {
  color: var(--text-inverted);
  background: var(--surface-control);
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
    background-color: var(--surface-control);
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
import {
  ARTICLE_GROUPING_OPTIONS,
  ARTICLE_SORT_OPTIONS,
  ARTICLE_STATUS_OPTIONS,
  getArticleStatusOption,
  getAvailableArticleOptions
} from '../../config/articleSelectionOptions.js';
import AppDropdown from '../shared/AppDropdown.vue';

export default {
  components: { AppDropdown },
  props: {
    hidden: {
      type: Boolean,
      default: false
    },
    refreshing: {
      type: Boolean,
      default: false
    }
  },
  emits: ['mobile', 'forceReload', 'refresh'],
  data() {
    return {
      showSearch: false
    };
  },
  mounted() {
    window.addEventListener('rssmonster:focus-search', this.focusSearchInput);
    document.addEventListener('pointerdown', this.handleSearchOutsideClick);
  },
  unmounted() {
    window.removeEventListener('rssmonster:focus-search', this.focusSearchInput);
    document.removeEventListener('pointerdown', this.handleSearchOutsideClick);
    this.uiStore.setMobileSearchOpen(false);
  },
  methods: {
    // This function emits a toolbar selection event.
    emitClickEvent(eventType, value) {
      this.$emit(eventType, value);
    },
    // This function opens the settings dialog for the active configurable selection.
    openSelectionSettings() {
      if (!this.selectionSettingsAction) return;
      this.uiStore.setShowModal(this.selectionSettingsAction.modalName);
    },
    // This function applies the current mobile search query.
    updateSearch() {
      this.selectionStore.setSelectedSearch(this.uiStore.searchQuery);
    },
    // This function toggles the mobile search controls and shared state.
    toggleSearch() {
      this.showSearch = !this.showSearch;
      this.uiStore.setMobileSearchOpen(this.showSearch);
    },
    // This function closes mobile search when a pointer press occurs outside its controls.
    handleSearchOutsideClick(event) {
      if (!this.showSearch) return;
      if (this.$refs.searchPanel?.contains(event.target)) return;
      if (this.$refs.searchButton?.contains(event.target)) return;
      this.toggleSearch();
    },
    // This function opens and focuses the mobile search input.
    focusSearchInput() {
      this.showSearch = true;
      this.uiStore.setMobileSearchOpen(true);
      this.$nextTick(() => {
        this.$refs.searchInput?.focus();
      });
    },
    // This function changes the grouping only when the value differs.
    setGrouping: function(value) {
      if (this.briefingPresentationControlsDisabled) return;
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
      if (this.briefingPresentationControlsDisabled) return;
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
    getStatusCount(status = this.currentStatus) {
      const countKey = getArticleStatusOption(status)?.countKey;
      return this.overviewStore[countKey] ?? 0;
    },
    // This function returns a category count for the active article status.
    getCategoryCount(category) {
      const countKey = getArticleStatusOption(this.currentStatus)?.countKey;
      return category[countKey] ?? 0;
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
    // This function disables presentation controls whose values are owned by Briefing settings.
    briefingPresentationControlsDisabled() {
      return this.currentStatus === 'briefing';
    },
    // This function explains why Briefing presentation controls cannot be changed here.
    briefingPresentationDisabledTitle() {
      return 'Briefing sorting and grouping are managed in Briefing settings.';
    },
    // This function returns the configured status label with a fallback for unknown values.
    currentStatusLabel() {
      return getArticleStatusOption(this.currentStatus)?.label ?? this.capitalize(this.currentStatus);
    },
    // This function exposes status options supported by the active mobile capabilities.
    visibleStatusOptions() {
      return getAvailableArticleOptions(ARTICLE_STATUS_OPTIONS, {
        aiEnabled: this.isAIEnabled,
        mobile: true
      });
    },
    // This function exposes sort options supported by the active mobile capabilities.
    visibleSortOptions() {
      return getAvailableArticleOptions(ARTICLE_SORT_OPTIONS, {
        aiEnabled: this.isAIEnabled,
        mobile: true
      });
    },
    // This function exposes grouping choices only when AI capabilities are available.
    visibleGroupingOptions() {
      return this.isAIEnabled ? ARTICLE_GROUPING_OPTIONS : [];
    },
    // This function maps configurable article selections to their mobile settings dialogs.
    selectionSettingsAction() {
      if (this.currentStatus === 'briefing') {
        return {
          label: 'Open briefing settings',
          modalName: 'BriefingPreferences'
        };
      }

      if (this.currentStatus === 'unread') {
        return {
          label: 'Open unread settings',
          modalName: 'UnreadConfiguration'
        };
      }

      return null;
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
