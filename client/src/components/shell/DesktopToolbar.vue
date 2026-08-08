<template>
  <nav class="desktop-toolbar" aria-label="Article toolbar">
    <!-- Article filter dropdowns -->
    <div class="toolbar-filters">
      <AppDropdown v-for="dropdown in toolbarDropdowns" :id="dropdown.id" :key="dropdown.id" :close-key="selectionCloseKey" class="toolbar-filter">
        <template #trigger="{ triggerProps }">
          <button
            v-bind="triggerProps"
            class="toolbar-filter-button"
            type="button"
            :disabled="dropdown.disabled"
            :title="dropdown.disabled ? briefingPresentationDisabledTitle : null"
          >
            <span class="toolbar-filter-label">{{ dropdown.label }}:</span>
            <span class="toolbar-filter-value">{{ dropdown.selectedLabel }}</span>
            <span class="toolbar-filter-chevron" aria-hidden="true"></span>
          </button>
        </template>
        <template #menu="{ menuProps }">
          <div v-bind="menuProps">
            <button v-for="option in dropdown.options" :key="option.value" type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': dropdown.selectedValue === option.value }" role="menuitem" @click="dropdownOptionClicked(dropdown.type, option.value)">{{ option.label }}</button>
          </div>
        </template>
      </AppDropdown>
    </div>

    <div class="toolbar-actions">
      <button v-if="isAIEnabled" type="button" class="toolbar-chat-button" @click="chatAssistant">
        <BootstrapIcon icon="chat-dots" />
        <span>
          {{ uiStore.chatAssistantOpen ? 'Close Chat' : 'Chat' }}
        </span>
      </button>
      <div class="toolbar-search" :class="{ 'toolbar-search-invalid': isSearchQueryInvalid, 'toolbar-search-open': isCompactSearchOpen }">
        <span class="toolbar-search-icon" aria-hidden="true">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M6.5 12a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11m0-1a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9m7.854 4.146-3.85-3.85a1 1 0 0 0-1.414 1.415l3.85 3.85a1 1 0 0 0 1.414-1.415" />
          </svg>
        </span>
        <input
          ref="searchInput"
          type="text"
          v-model="searchQuery"
          @input="debounceSearchEvent"
          @keydown.esc="closeCompactSearch"
          :placeholder="searchPlaceholder"
          autocomplete="off"
          class="toolbar-search-input"
          :class="{ 'toolbar-search-input-invalid': isSearchQueryInvalid }"
          :title="searchQueryError"
        />
      </div>
      <button type="button" class="toolbar-search-button" title="Search" @click="toggleCompactSearch">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6.5 12a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11m0-1a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9m7.854 4.146-3.85-3.85a1 1 0 0 0-1.414 1.415l3.85 3.85a1 1 0 0 0 1.414-1.415" />
        </svg>
      </button>
      <AppDropdown id="themeModeDropdown" :close-key="selectedThemeMode" align="end" class="toolbar-theme-dropdown">
        <template #trigger="{ triggerProps }">
          <button v-bind="triggerProps" type="button" class="toolbar-theme-button" title="Choose theme">
            <BootstrapIcon icon="brightness-high" size="20" />
            <span class="app-visually-hidden">Choose theme</span>
          </button>
        </template>
        <template #menu="{ menuProps }">
          <div v-bind="menuProps" class="toolbar-theme-menu">
          <button type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': selectedThemeMode === 'system' }" role="menuitemradio" :aria-checked="selectedThemeMode === 'system'" @click="selectThemeMode('system')">
            <BootstrapIcon icon="laptop" size="16" />
            System
          </button>
          <button type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': selectedThemeMode === 'light' }" role="menuitemradio" :aria-checked="selectedThemeMode === 'light'" @click="selectThemeMode('light')">
            <BootstrapIcon icon="sun" size="16" />
            Light
          </button>
          <button type="button" class="app-dropdown__item" :class="{ 'app-dropdown__item--active': selectedThemeMode === 'dark' }" role="menuitemradio" :aria-checked="selectedThemeMode === 'dark'" @click="selectThemeMode('dark')">
            <BootstrapIcon icon="moon-stars" size="16" />
            Dark
          </button>
          </div>
        </template>
      </AppDropdown>
      <button
        ref="settingsButton"
        type="button"
        class="toolbar-settings-button"
        title="Settings"
        aria-label="Open settings"
        aria-haspopup="dialog"
        :aria-expanded="showSettingsModal ? 'true' : 'false'"
        @click="settingsClicked"
      >
        <BootstrapIcon icon="gear-fill" size="20" />
      </button>
    </div>
    <Settings
      v-if="showSettingsModal"
      :return-focus-to="$refs.settingsButton"
      @close="closeSettingsModal"
      @forceReload="handleForceReload"
    />
  </nav>
</template>

<style scoped>
.desktop-toolbar {
  height: 56px;
  box-sizing: border-box;
  border-bottom: 1px solid var(--color-transparent);
  border-color: var(--border-subtle);
  top: 0;
  right: 0;
  overflow: visible;
  background-color: var(--desktop-toolbar-background);
  position: fixed;
  margin-left: 0;
  display: flex;
  align-items: center;
  min-width: 0;
  z-index: 1000;
  padding-left: clamp(16px, 2vw, 28px);
  --toolbar-control-gap: clamp(4px, 1vw, 20px);
}

.toolbar-filters,
.toolbar-actions {
  display: flex;
  align-items: center;
  min-width: 0;
}

.toolbar-actions {
  flex: 1;
  gap: var(--toolbar-control-gap);
}

.toolbar-filters {
  gap: var(--toolbar-control-gap);
  margin-right: var(--toolbar-control-gap);
}

.toolbar-filter-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 34px;
  padding: 0 11px;
  color: var(--toolbar-text);
  background: var(--bg-input);
  border: 1px solid var(--border-control);
  border-radius: 8px;
  font-weight: 500;
  font-size: 14px;
  box-shadow: none;
  line-height: 20px;
  transition: background-color 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease, color 0.16s ease;
}

.toolbar-filter-button::after {
  display: none;
}

.toolbar-filters > .toolbar-filter {
  margin-right: 0;
}

@media (max-width: 1080px) {
  .desktop-toolbar {
    --toolbar-control-gap: clamp(0px, calc(3.846vw - 29.538px), 10px);
  }

  .toolbar-filter-button {
    padding-right: 10px;
    padding-left: 10px;
  }
}

@media (max-width: 1250px) {
  .toolbar-filter-label {
    display: none;
  }
}

.toolbar-filter-label {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
}

.toolbar-filter-value {
  color: var(--toolbar-text);
  font-size: 14px;
  font-weight: 600;
  margin-left: 0;
}

.toolbar-filter-chevron {
  flex-shrink: 0;
  color: var(--text-muted);
  width: 6px;
  height: 6px;
  margin-left: 3px;
  border-right: 1.5px solid var(--color-current);
  border-bottom: 1.5px solid var(--color-current);
  transform: translateY(-1px) rotate(45deg);
  transform-origin: center;
}

.toolbar-filter-button:hover {
  background-color: var(--bg-hover);
  border-color: var(--border-strong);
}

.toolbar-filter-button:disabled {
  color: var(--text-muted);
  background: var(--bg-input);
  border-color: var(--border-control);
  cursor: not-allowed;
  opacity: 0.65;
}

.toolbar-filter-button:focus,
.toolbar-filter-button:active,
.toolbar-filter-button:focus-visible {
  outline: none;
}

.toolbar-filter-button:focus-visible {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--overlay-primary-subtle);
}

.toolbar-filter-button[aria-expanded='true'] {
  background-color: var(--bg-hover);
  border-color: var(--border-strong);
  color: var(--toolbar-text);
}

.toolbar-filter .app-dropdown__menu {
  padding: 6px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  box-shadow: var(--shadow-modal);
}

.toolbar-filter .app-dropdown__item {
  padding: 8px 10px;
  margin-bottom: 4px;
  border-radius: 7px;
}

.toolbar-filter .app-dropdown__item:last-child {
  margin-bottom: 0;
}

.app-dropdown__item {
  color: var(--toolbar-text);
  font-size: 14px;
  font-weight: 500;
}

.app-dropdown__item--active,
.app-dropdown__item:hover,
.app-dropdown__item:focus-visible {
  color: var(--text-inverted);
}

.app-dropdown__item--active {
  color: var(--color-primary);
  background-color: var(--color-primary-soft);
  border-radius: 4px;
}

.toolbar-filter .app-dropdown__item--active:hover,
.toolbar-filter .app-dropdown__item--active:focus-visible {
  color: var(--color-primary);
  background-color: var(--color-primary-soft);
}

.toolbar-settings-button,
.toolbar-theme-button,
.toolbar-search-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: fixed;
  top: 10px;
  right: 12px;
  width: 36px;
  height: 36px;
  border: 1px solid var(--border-control);
  border-radius: 999px;
  flex-shrink: 0;
  cursor: pointer;
  color: var(--toolbar-text);
  background-color: var(--bg-card);
  font-size: 20px;
  padding: 0;
}

.toolbar-theme-button {
  position: static;
}

.toolbar-theme-dropdown {
  position: fixed;
  top: 10px;
  right: 68px;
  z-index: 1;
  border: none;
}

.toolbar-theme-menu {
  min-width: 132px;
  padding: 4px;
  border-color: var(--border-default);
  border-radius: 6px;
  box-shadow: var(--shadow-modal);
}

.toolbar-theme-menu .app-dropdown__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  margin-bottom: 4px;
  border-radius: 4px;
}

.toolbar-theme-menu .app-dropdown__item:last-child {
  margin-bottom: 0;
}

.toolbar-theme-menu .app-dropdown__item svg {
  flex-shrink: 0;
}

.toolbar-theme-menu .app-dropdown__item--active {
  color: var(--color-primary);
  background-color: var(--color-primary-soft);
}

:global(:root[data-theme='dark'] .toolbar-theme-button) {
  color: var(--text-inverted);
  background-color: var(--bg-control);
  border-color: var(--border-control);
}

:global(:root[data-theme='dark'] .toolbar-theme-menu) {
  background-color: var(--bg-modal);
  border-color: var(--border-default);
}

:global(:root[data-theme='dark'] .desktop-toolbar) {
  background-color: var(--desktop-toolbar-background);
}

:global(:root[data-theme='dark'] .toolbar-theme-button:hover) {
  background-color: var(--toolbar-settings-hover-background-dark);
  border-color: var(--border-strong);
}

:global(:root[data-theme='dark'] .toolbar-settings-button),
:global(:root[data-theme='dark'] .toolbar-chat-button),
:global(:root[data-theme='dark'] .toolbar-search-button) {
  color: var(--text-inverted);
  background-color: var(--bg-control);
  border-color: var(--border-control);
}

:global(:root[data-theme='dark'] .toolbar-settings-button:hover),
:global(:root[data-theme='dark'] .toolbar-chat-button:hover),
:global(:root[data-theme='dark'] .toolbar-search-button:hover) {
  background-color: var(--toolbar-settings-hover-background-dark);
}

:global(:root[data-theme='dark'] .toolbar-settings-button:hover),
:global(:root[data-theme='dark'] .toolbar-search-button:hover) {
  border-color: var(--border-strong);
}

:global(:root[data-theme='dark'] .toolbar-search) {
  background-color: var(--bg-control);
  border-color: var(--border-control);
}

:global(:root[data-theme='dark'] .toolbar-search:hover) {
  background-color: var(--toolbar-settings-hover-background-dark);
  border-color: var(--border-strong);
}

:global(:root[data-theme='dark'] .toolbar-search:focus-within) {
  background-color: var(--toolbar-settings-hover-background-dark);
  border-color: var(--border-focus);
}

:global(:root[data-theme='dark'] .toolbar-search-input) {
  color: var(--toolbar-search-text-dark);
}

:global(:root[data-theme='dark'] .toolbar-search-input::placeholder) {
  color: var(--toolbar-search-placeholder-dark);
}

:global(:root[data-theme='dark'] .toolbar-filter-button) {
  color: var(--text-inverted);
  background-color: var(--bg-control);
  border-color: var(--border-subtle);
}

:global(:root[data-theme='dark'] .toolbar-filter-button:hover),
:global(:root[data-theme='dark'] .toolbar-filter-button[aria-expanded='true']) {
  background-color: var(--toolbar-settings-hover-background-dark);
  border-color: var(--border-strong);
}

:global(:root[data-theme='dark'] .toolbar-filter-button:focus-visible) {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px var(--overlay-primary-strong);
}

:global(:root[data-theme='dark'] .toolbar-filter-label),
:global(:root[data-theme='dark'] .toolbar-filter-chevron) {
  color: var(--text-secondary);
}

:global(:root[data-theme='dark'] .toolbar-filter-value) {
  color: var(--text-inverted);
}

:global(:root[data-theme='dark'] .desktop-toolbar .app-dropdown__menu--open) {
  background-color: var(--bg-modal);
  border-color: var(--border-default);
}

:global(:root[data-theme='dark'] .desktop-toolbar .app-dropdown__menu .app-dropdown__item) {
  color: var(--text-secondary);
}

:global(:root[data-theme='dark'] .desktop-toolbar .app-dropdown__menu .app-dropdown__item:hover),
:global(:root[data-theme='dark'] .desktop-toolbar .app-dropdown__menu .app-dropdown__item:focus-visible),
:global(:root[data-theme='dark'] .desktop-toolbar .app-dropdown__menu .app-dropdown__item--active) {
  color: var(--text-inverted);
  background-color: var(--toolbar-active-background);
}

.toolbar-settings-button:hover,
.toolbar-theme-button:hover,
.toolbar-search-button:hover {
  background-color: var(--bg-hover);
  border-color: var(--border-strong);
}

.toolbar-settings-button svg,
.toolbar-theme-button svg,
.toolbar-search-button svg {
  display: block;
  margin-bottom: 0;
  width: 20px;
  height: 20px;
}

.toolbar-chat-button {
  height: 36px;
  padding: 0 18px;
  border: 1px solid var(--border-control);
  border-radius: 8px;
  background: var(--bg-input);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 0;
  margin-right: 0;
  cursor: pointer;
  color: var(--toolbar-text);
  font-size: 14px;
  flex-shrink: 0;
}

.toolbar-chat-button svg {
  color: var(--text-muted);
}

.toolbar-chat-button:hover {
  background-color: var(--bg-hover);
}

.toolbar-search {
  flex: 0 1 clamp(320px, 40vw, 620px);
  min-width: 0;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  margin: 0 130px 0 0;
  padding: 0 12px;
  background-color: var(--bg-input);
  border: 1px solid var(--border-control);
  border-radius: 8px;
}

.toolbar-search:hover {
  background-color: var(--bg-hover);
  border-color: var(--border-strong);
}

.toolbar-search:focus-within {
  background-color: var(--bg-hover);
  border-color: var(--border-focus);
}

.toolbar-search-icon {
  display: flex;
  flex-shrink: 0;
  color: var(--text-muted);
}

.toolbar-search-icon svg {
  width: 16px;
  height: 16px;
  fill: var(--color-current);
}

.toolbar-search-input {
  width: 100%;
  min-width: 0;
  height: 100%;
  color: var(--text-muted);
  background-color: var(--color-transparent);
  font-size: 14px;
  font-weight: 500;
  border: none;
}

.toolbar-search-input::placeholder {
  color: var(--text-muted);
}

.toolbar-search-input:focus {
  outline: none;
}

.toolbar-search.toolbar-search-invalid {
  background-color: var(--bg-danger-subtle);
}

.toolbar-search.toolbar-search-invalid .toolbar-search-input.toolbar-search-input-invalid {
  color: var(--text-danger);
}

.toolbar-search.toolbar-search-invalid .toolbar-search-input.toolbar-search-input-invalid::placeholder {
  color: var(--text-danger-placeholder);
}

.toolbar-search-input.toolbar-search-input-invalid {
  background-color: var(--bg-danger-subtle);
  color: var(--text-danger);
  border-color: var(--border-danger);
}

.toolbar-search-input.toolbar-search-input-invalid::placeholder {
  color: var(--text-danger-placeholder);
}

.toolbar-search-button {
  display: none;
}

@media (min-width: 880px) {
  .desktop-toolbar {
    left: var(--sidebar-width);
  }
}

@media (min-width: 1600px) {
  .toolbar-search {
    margin-left: 0;
  }
}

@media (max-width: 1120px) {
  .toolbar-search {
    margin-right: 128px;
  }

  .toolbar-settings-button,
  .toolbar-theme-button {
    z-index: 1;
  }
}

@media (max-width: 1199px) {
  .toolbar-search {
    display: none;
  }

  .toolbar-search.toolbar-search-open {
    display: flex;
    position: fixed;
    top: 64px;
    right: 124px;
    width: min(420px, calc(100vw - 320px));
    margin: 0;
    box-shadow: var(--shadow-modal);
    z-index: 1001;
  }

  .toolbar-search-button {
    display: inline-flex;
    position: fixed;
    top: 10px;
    right: 124px;
    padding: 0;
    z-index: 1;
  }

  .toolbar-search-button svg {
    width: 16px;
    height: 16px;
    fill: var(--color-current);
  }
}

@media (max-width: 1149px) {
  .toolbar-chat-button {
    position: fixed;
    top: 10px;
    right: 180px;
    width: 36px;
    height: 36px;
    padding: 0;
    margin-right: 0;
    justify-content: center;
    border-radius: 999px;
    font-size: 20px;
    z-index: 1;
  }

  .toolbar-chat-button span {
    display: none;
  }
}

@media (max-width: 1149px) {
  .toolbar-theme-dropdown {
    right: 60px;
  }

  .toolbar-search.toolbar-search-open,
  .toolbar-search-button {
    right: 108px;
  }

  .toolbar-chat-button {
    right: 156px;
  }
}

@media (max-width: 990px) {
  .toolbar-search-button {
    display: none;
  }

  .toolbar-chat-button {
    right: 108px;
  }
}

@media (max-width: 940px) {
  .toolbar-chat-button {
    display: none;
  }
}

:global(:root[data-theme='dark']) {
  .desktop-toolbar {
    color: var(--text-inverted);
    background: var(--desktop-toolbar-background);
    border-color: var(--border-subtle);
    border-bottom-color: var(--border-subtle);
  }

  .toolbar-chat-button {
    color: var(--text-inverted);
    background: var(--bg-control);
    border-color: var(--border-control);
  }

  .toolbar-chat-button svg {
    color: var(--text-inverted);
  }

  .app-dropdown__menu {
    background-color: var(--bg-modal);
    border-color: var(--border-default);
  }

  .app-dropdown__item {
    color: var(--text-secondary);
  }

  .app-dropdown__item:hover,
  .app-dropdown__item:focus-visible {
    background-color: var(--bg-control);
    color: var(--text-inverted);
  }

  .app-dropdown__item--active {
    background-color: var(--toolbar-active-background);
    color: var(--text-inverted);
  }

  .toolbar-filter-button {
    color: var(--text-inverted);
    background-color: var(--bg-control);
    border-color: var(--border-control);
  }

  .toolbar-filter-button:hover,
  .toolbar-filter-button[aria-expanded='true'] {
    background-color: var(--toolbar-settings-hover-background-dark);
    border-color: var(--border-strong);
  }

  .toolbar-filter-button:focus-visible {
    border-color: var(--border-focus);
    box-shadow: 0 0 0 3px var(--overlay-primary-strong);
  }

  .toolbar-filter-label,
  .toolbar-filter-chevron {
    color: var(--text-secondary);
  }

  .toolbar-settings-button,
  .toolbar-theme-button,
  .toolbar-search-button {
    color: var(--text-inverted);
    background-color: var(--bg-control);
    border-color: var(--border-control);
  }

  .toolbar-settings-button:hover,
  .toolbar-theme-button:hover,
  .toolbar-chat-button:hover,
  .toolbar-search-button:hover {
    background-color: var(--toolbar-settings-hover-background-dark);
    border-color: var(--border-strong);
  }

  .app-dropdown__item {
    color: var(--text-inverted);
  }

  .toolbar-filter-value {
    color: var(--text-inverted);
  }

  .toolbar-search {
    background-color: var(--bg-control);
    border-color: var(--border-control);
  }

  .toolbar-search:hover {
    background-color: var(--toolbar-settings-hover-background-dark);
    border-color: var(--border-strong);
  }

  .toolbar-search:focus-within {
    background-color: var(--toolbar-settings-hover-background-dark);
    border-color: var(--border-focus);
  }

  .toolbar-search-input {
    color: var(--toolbar-search-text-dark);
    background: var(--color-transparent);
  }

  .toolbar-search-input::placeholder {
    color: var(--toolbar-search-placeholder-dark);
  }

  .toolbar-search.toolbar-search-invalid {
    background-color: var(--bg-danger-subtle);
  }

  .toolbar-search.toolbar-search-invalid .toolbar-search-input.toolbar-search-input-invalid {
    color: var(--text-danger);
    border-color: var(--border-danger);
  }

  .toolbar-search.toolbar-search-invalid .toolbar-search-input.toolbar-search-input-invalid::placeholder {
    color: var(--text-danger);
  }
}

/* Keep explicit light-mode controls light when the device prefers dark mode. */
:global(:root[data-theme='light'] .toolbar-settings-button),
:global(:root[data-theme='light'] .toolbar-theme-button),
:global(:root[data-theme='light'] .toolbar-search-button) {
  color: var(--toolbar-text);
  background-color: var(--bg-card);
  border-color: var(--border-control);
}

:global(:root[data-theme='light'] .toolbar-settings-button:hover),
:global(:root[data-theme='light'] .toolbar-theme-button:hover),
:global(:root[data-theme='light'] .toolbar-search-button:hover) {
  background-color: var(--bg-hover);
  border-color: var(--border-strong);
}
</style>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { useUiStore } from '../../store/ui.js';
import { defineAsyncComponent } from 'vue';
import { saveThemeMode as saveThemeModeAPI } from '../../api/settings.js';
import {
  ARTICLE_GROUPING_OPTIONS,
  ARTICLE_SORT_OPTIONS,
  ARTICLE_STATUS_OPTIONS,
  ARTICLE_VIEW_MODE_OPTIONS,
  getAvailableArticleOptions
} from '../../config/articleSelectionOptions.js';
import { notifyActionError } from '../../services/actionNotifications.js';
import { validateSearchQuery } from '../../services/queryValidation.js';
import { getThemeMode, setThemeMode } from '../../services/theme.js';
import AppDropdown from '../shared/AppDropdown.vue';

const SEARCH_DEBOUNCE_DELAY = 300;

// This async boundary defers the settings workspace until the user opens it.
const Settings = defineAsyncComponent(() => import('../settings/Settings.vue'));

export default {
  components: {
    AppDropdown,
    Settings
  },
  // This function initializes the toolbar's local state and dropdown options.
  data() {
    return {
      showSettingsModal: false,
      isCompactSearchOpen: false,
      searchDebounceTimer: null,
      selectedThemeMode: getThemeMode(),
      windowWidth: window.innerWidth,
      statusOptions: ARTICLE_STATUS_OPTIONS,
      viewModeOptions: ARTICLE_VIEW_MODE_OPTIONS,
      sortOptions: ARTICLE_SORT_OPTIONS,
      groupingOptions: ARTICLE_GROUPING_OPTIONS
    };
  },
  mounted() {
    window.addEventListener('rssmonster:focus-search', this.focusSearchInput);
    window.addEventListener('resize', this.updateWindowWidth);
  },
  methods: {
    // This function stores the current viewport width for responsive toolbar copy.
    updateWindowWidth: function() {
      this.windowWidth = window.innerWidth;
    },
    // This function toggles the compact search field and focuses it when opening.
    toggleCompactSearch: function() {
      if (this.isCompactSearchOpen) {
        this.closeCompactSearch();
        return;
      }
      this.isCompactSearchOpen = true;
      this.$nextTick(() => this.$refs.searchInput.focus());
    },
    // This function closes the compact search field.
    closeCompactSearch: function() {
      this.isCompactSearchOpen = false;
    },
    // This function opens the compact search field and puts focus in it.
    focusSearchInput: function() {
      this.isCompactSearchOpen = true;
      this.$nextTick(() => this.$refs.searchInput?.focus());
    },
    // This function delays search updates until typing pauses.
    debounceSearchEvent: function() {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        this.emitSearchEvent();
      }, SEARCH_DEBOUNCE_DELAY);
    },
    // This function updates the selected search query when it is valid.
    emitSearchEvent: function() {
      if (!(this.uiStore.searchQuery === undefined || this.uiStore.searchQuery === null)) {
        const { valid } = validateSearchQuery(this.uiStore.searchQuery);
        if (valid) {
          this.selectionStore.setSelectedSearch(this.uiStore.searchQuery);
        }
      }
    },
    // This function changes the grouping only when the value differs.
    setGrouping: function(value) {
      if (this.briefingPresentationControlsDisabled) return;
      if (this.selectionStore.currentSelection.grouping === value) {
        return;
      }
      this.selectionStore.setGrouping(value);
    },
    // This function updates the selected article status or reloads the current one.
    statusClicked: function(status) {
      const currentSelection = this.selectionStore.currentSelection;
      if (status === currentSelection.status && currentSelection.smartFolderId === null) {
        this.$emit('forceReload');
      } else {
        this.selectionStore.setSelectedStatus(status);
      }
    },
    // This function updates the active article view mode.
    viewModeClicked: function(filter) {
      this.selectionStore.setViewMode(filter);
    },
    // This function updates the active article sort order.
    sortClicked: function(sort) {
      if (this.briefingPresentationControlsDisabled) return;
      this.selectionStore.setSelectedSort(sort);
    },
    // This function routes a configured dropdown option to its matching handler.
    dropdownOptionClicked: function(type, value) {
      if (type === 'status') {
        this.statusClicked(value);
      } else if (type === 'viewMode') {
        this.viewModeClicked(value);
      } else if (type === 'sort') {
        this.sortClicked(value);
      } else if (type === 'grouping') {
        this.setGrouping(value);
      }
    },
    // This function opens the settings modal.
    settingsClicked: function() {
      this.showSettingsModal = true;
    },
    // This function saves and applies an explicitly selected color theme.
    selectThemeMode: async function(theme) {
      const previousThemeMode = this.selectedThemeMode;
      this.selectedThemeMode = theme;
      setThemeMode(theme);
      this.uiStore.setThemeMode(theme);

      try {
        await saveThemeModeAPI(theme);
      } catch (err) {
        console.error('Error saving theme mode:', err);
        this.selectedThemeMode = previousThemeMode;
        setThemeMode(previousThemeMode);
        this.uiStore.setThemeMode(previousThemeMode);
        notifyActionError('Could not save the theme preference. Please try again.', err);
      }
    },
    // This function closes the settings modal.
    closeSettingsModal: function() {
      this.showSettingsModal = false;
    },
    // This function asks the parent to reload the current content.
    handleForceReload: function() {
      this.$emit('forceReload');
    },
    // This function toggles the chat assistant and clears the search field.
    chatAssistant: function() {
      this.uiStore.setSearchQuery(null);
      this.uiStore.setChatAssistantOpen(!this.uiStore.chatAssistantOpen);
    }
  },
  // This function clears a pending search update before the component is removed.
  beforeUnmount() {
    clearTimeout(this.searchDebounceTimer);
    window.removeEventListener('rssmonster:focus-search', this.focusSearchInput);
    window.removeEventListener('resize', this.updateWindowWidth);
  },
  watch: {
    // This function keeps the selected toolbar option in sync with saved settings.
    'uiStore.themeMode': function(themeMode) {
      if (themeMode) {
        this.selectedThemeMode = themeMode;
      }
    }
  },
  computed:{
    ...mapStores(useSelectionStore, useUiStore),
    // This computed field routes shared search changes through the store action contract.
    searchQuery: {
      get() {
        return this.uiStore.searchQuery;
      },
      set(value) {
        this.uiStore.setSearchQuery(value);
      }
    },
    // This function returns the currently active article selection from the store.
    currentSelection() {
      return this.selectionStore.currentSelection;
    },
    // This function closes open toolbar menus when the active article view changes.
    selectionCloseKey() {
      const selection = this.currentSelection;
      return [selection.status, selection.viewMode, selection.sort, selection.grouping, selection.smartFolderId, selection.categoryId].join(':');
    },
    // This function reports whether AI-powered toolbar options are available.
    isAIEnabled() {
      return this.currentSelection.AIEnabled;
    },
    // This function returns shorter search placeholder text on narrower screens.
    searchPlaceholder() {
      if (this.windowWidth < 1440) {
        return 'Search';
      }

      return 'Search for words or tag:name, title:text, etc.';
    },
    // This function returns the selected article status.
    selectedStatus() {
      return this.currentSelection.status;
    },
    // This function returns the selected article view mode.
    selectedViewMode() {
      return this.currentSelection.viewMode;
    },
    // This function returns the selected article sort order.
    selectedSort() {
      return this.currentSelection.sort;
    },
    // This function disables presentation controls whose values are owned by Briefing settings.
    briefingPresentationControlsDisabled() {
      return this.currentSelection.status === 'briefing';
    },
    // This function explains why Briefing presentation controls cannot be changed here.
    briefingPresentationDisabledTitle() {
      return 'Briefing sorting and grouping are managed in Briefing settings.';
    },
    // This function builds the configured view, show, and sort dropdowns.
    toolbarDropdowns() {
      // This function filters configured options against the active desktop capabilities.
      const visibleOptions = (options) => getAvailableArticleOptions(options, {
        aiEnabled: this.isAIEnabled
      });
      const selectedSortOption = this.sortOptions.find((option) => option.value === this.selectedSort);
      const selectedViewModeOption = this.viewModeOptions.find((option) => option.value === this.selectedViewMode);
      const selectedStatusOption = this.statusOptions.find((option) => option.value === this.selectedStatus);
      const selectedGroupingOption = this.groupingOptions.find((option) => option.value === this.currentSelection.grouping);

      const dropdowns = [
        {
          id: 'viewModeDropdown',
          type: 'viewMode',
          label: 'View',
          selectedLabel: selectedViewModeOption ? selectedViewModeOption.label : this.capitalize(this.selectedViewMode),
          selectedValue: this.selectedViewMode,
          options: visibleOptions(this.viewModeOptions)
        },
        {
          id: 'statusDropdown',
          type: 'status',
          label: 'Show',
          selectedLabel: selectedStatusOption ? selectedStatusOption.label : this.capitalize(this.selectedStatus),
          selectedValue: this.selectedStatus,
          options: visibleOptions(this.statusOptions)
        },
        {
          id: 'sortDropdown',
          type: 'sort',
          label: 'Sort',
          selectedLabel: selectedSortOption ? selectedSortOption.label : '',
          selectedValue: this.selectedSort,
          options: visibleOptions(this.sortOptions),
          disabled: this.briefingPresentationControlsDisabled
        }
      ];

      if (this.isAIEnabled) {
        dropdowns.push({
          id: 'groupingDropdown',
          type: 'grouping',
          label: 'Grouping',
          selectedLabel: selectedGroupingOption ? selectedGroupingOption.label : 'None',
          selectedValue: this.currentSelection.grouping,
          options: this.groupingOptions,
          disabled: this.briefingPresentationControlsDisabled
        });
      }

      return dropdowns;
    },
    // This function capitalizes a dropdown value for display.
    capitalize() {
      return (value)=> value.charAt(0).toUpperCase() + value.slice(1)
    },
    // This function reports whether the current search query is invalid.
    isSearchQueryInvalid() {
      const query = this.uiStore.searchQuery || '';
      const { valid } = validateSearchQuery(query);
      return !valid;
    },
    // This function returns the validation message for the current search query.
    searchQueryError() {
      const query = this.uiStore.searchQuery || '';
      const { error } = validateSearchQuery(query);
      return error;
    }
  }
};
</script>
