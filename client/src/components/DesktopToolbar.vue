<template>
  <div class="toolbar">
    <!-- Article filter dropdowns -->
    <div v-for="dropdown in toolbarDropdowns" :key="dropdown.id" class="dropdown">
      <button class="dropdown-toggle toolbar-dropdown" type="button" :id="dropdown.id" data-bs-toggle="dropdown" aria-expanded="false">
        <span class="toolbar-dropdown-label">{{ dropdown.label }}:</span>
        <span class="toolbar-dropdown-value">{{ dropdown.selectedLabel }}</span>
      </button>
      <div class="dropdown-menu" :aria-labelledby="dropdown.id">
        <button v-for="option in dropdown.options" :key="option.value" type="button" class="dropdown-item" :class="{ active: dropdown.selectedValue === option.value }" @click="dropdownOptionClicked(dropdown.type, option.value)">{{ option.label }}</button>
      </div>
    </div>

    <button v-if="isAIEnabled" type="button" class="chat-button" @click="chatAssistant">
      <BootstrapIcon icon="chat-dots" />
      <span>
        {{ $store.data.chatAssistantOpen ? 'Close Chat' : 'Chat' }}
      </span>
    </button>
    <div class="search-wrap" :class="{ invalid: isSearchQueryInvalid }">
      <span class="search-icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M6.5 12a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11m0-1a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9m7.854 4.146-3.85-3.85a1 1 0 0 0-1.414 1.415l3.85 3.85a1 1 0 0 0 1.414-1.415" />
        </svg>
      </span>
      <input
        type="text"
        v-model="$store.data.searchQuery"
        @input="debounceSearchEvent"
        placeholder="Search for words or tag:name, title:text, etc."
        autocomplete="off"
        :class="{ 'input-invalid': isSearchQueryInvalid }"
        :title="searchQueryError"
      />
    </div>
    <div class="theme-icon" title="Toggle light and dark mode">
      <BootstrapIcon icon="brightness-high" size="20" />
    </div>
    <div class="settings-icon" @click="settingsClicked" title="Settings">
      <BootstrapIcon icon="gear-fill" size="20" />
    </div>
    <Settings v-if="showSettingsModal" @close="closeSettingsModal" @forceReload="handleForceReload" />
  </div>
</template>

<style scoped>
.toolbar {
  height: 56px;
  box-sizing: border-box;
  border-bottom: 1px solid transparent;
  border-color: var(--border-input);
  left: 0;
  right: 0;
  overflow: visible;
  background-color: var(--desktop-toolbar-background);
  position: fixed;
  margin-left: 0;
  display: flex;
  align-items: center;
  min-width: 0;
  z-index: 1000;
}

.toolbar-dropdown {
  background: transparent;
  border: none;
  color: inherit;
  font-weight: 500;
  box-shadow: none;
  padding: 6px 10px;
  height: 40px;
  line-height: 20px;
  font-size: 14px;

}

.toolbar-dropdown-label {
  color: var(--text-muted);
}

.toolbar-dropdown-value {
  margin-left: 4px;
  color: var(--toolbar-text);
  font-weight: 500;
}

.toolbar-dropdown:focus,
.toolbar-dropdown:active,
.toolbar-dropdown:focus-visible {
  outline: none;
  box-shadow: none;
}

.dropdown-item {
  color: var(--toolbar-text);
  font-size: 14px;
  font-weight: 500;
}

.dropdown-item.active,
.dropdown-item:hover {
  color: var(--text-inverted);
}

.dropdown-item.active {
  background-color: var(--toolbar-active-background);
}

.settings-icon,
.theme-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  position: fixed;
  top: 4px;
  right: 0;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  cursor: pointer;
  color: var(--toolbar-text);
  background-color: var(--desktop-toolbar-background);
}

.theme-icon {
  right: 40px;
}

.settings-icon:hover,
.theme-icon:hover {
  background-color: var(--border-input);
}

.settings-icon svg {
  margin-top: 3px;
  width: 20px;
  height: 20px;
}

.chat-button {
  height: 36px;
  padding: 0 18px;
  border: 1px solid #E5E7EB;
  border-radius: 8px;
  background: #FFFFFF;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 10px;
  cursor: pointer;
  color: var(--toolbar-text);
  font-size: 14px;
  flex-shrink: 0;
}

.chat-button:hover {
  background-color: var(--bg-hover);
}

.search-wrap {
  flex-basis: 0;
  flex-grow: 1;
  min-width: 0;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  margin: 0 104px 0 32px;
  padding: 0 12px;
  background-color: var(--bg-input);
  border: 1px solid #E5E7EB;
  border-radius: 10px;
}

.search-icon {
  display: flex;
  flex-shrink: 0;
  color: var(--text-muted);
}

.search-icon svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
}

.search-wrap input {
  width: 100%;
  min-width: 0;
  height: 100%;
  color: #9CA3AF;
  background-color: transparent;
  font-size: 14px;
  font-weight: 500;
  border: none;
}

.search-wrap input::placeholder {
  color: var(--text-muted);
}

.search-wrap input:focus {
  outline: none;
}

.search-wrap.invalid {
  background-color: var(--bg-danger-subtle);
}

.search-wrap.invalid input.input-invalid {
  color: var(--text-danger);
}

.search-wrap.invalid input.input-invalid::placeholder {
  color: var(--text-danger-placeholder);
}

.search-wrap input.input-invalid {
  background-color: var(--bg-danger-subtle);
  color: var(--text-danger);
  border-color: var(--border-danger-subtle);
}

.search-wrap input.input-invalid::placeholder {
  color: var(--text-danger-placeholder);
}

@media (min-width: 768px) {
  .toolbar {
    left: calc(25% - 15px);
  }
}

@media (min-width: 1120px) {
  .toolbar {
    left: 265px;
  }
}

@media (prefers-color-scheme: dark) {
  .toolbar,
  .dropdownmenu .item {
    color: var(--text-inverted);
    background: var(--bg-control);
    border-color: var(--dark-contrast);
    border-bottom: 1px solid var(--text-inverted);
  }

  .dropdown {
    border-left: 1px solid var(--text-inverted);
  }

  .chat-button {
    color: var(--text-inverted);
    background: var(--bg-control);
    border-color: var(--border-color);
  }

  .dropdown-menu {
    background-color: var(--bg-modal);
    border-color: var(--border-color);
  }

  .dropdown-item {
    color: var(--text-secondary);
  }

  .dropdown-item:hover {
    background-color: var(--bg-control);
    color: var(--text-inverted);
  }

  .dropdown-item.active {
    background-color: var(--toolbar-active-background);
    color: var(--text-inverted);
  }

  .settings-icon,
  .theme-icon {
    color: var(--text-inverted);
    background-color: var(--bg-control);
  }

  .settings-icon:hover,
  .theme-icon:hover {
    background-color: var(--toolbar-settings-hover-background-dark);
  }

  .dropdown-item {
    color: var(--text-inverted);
  }

  .toolbar-dropdown-value {
    color: var(--text-inverted);
  }

  .dropdown-menu .item {
    border-bottom: 1px solid var(--text-inverted);
    border-right: 1px solid var(--text-inverted);
    border-left: 1px solid var(--text-inverted);
  }

  .search-wrap {
    background-color: var(--toolbar-search-background-dark);
    border-color: var(--border-input);
  }

  .search-wrap input {
    color: var(--text-inverted);
    background: transparent;
  }

  .search-wrap input::placeholder {
    color: var(--text-muted);
  }

  .search-wrap.invalid {
    background-color: var(--bg-danger-subtle);
  }

  .search-wrap.invalid input.input-invalid {
    color: var(--text-danger);
    border-color: var(--border-danger-subtle);
  }

  .search-wrap.invalid input.input-invalid::placeholder {
    color: var(--text-danger);
  }
}
</style>

<script>
import Settings from './model/Settings.vue';
import { validateSearchQuery } from '../services/queryValidation.js';

const SEARCH_DEBOUNCE_DELAY = 300;

export default {
  components: {
    Settings
  },
  // This function initializes the toolbar's local state and dropdown options.
  data() {
    return {
      showSettingsModal: false,
      searchDebounceTimer: null,
      statusOptions: [
        { value: 'unread', label: 'Unread' },
        { value: 'star', label: 'Star' },
        { value: 'hot', label: 'Hot' },
        { value: 'clicked', label: 'Clicked' },
        { value: 'read', label: 'Read' }
      ],
      viewModeOptions: [
        { value: 'full', label: 'Full' },
        { value: 'summarized', label: 'Summarized' },
        { value: 'summaryBullets', label: 'Summary Bullets', requiresAI: true },
        { value: 'minimal', label: 'Minimal' }
      ],
      sortOptions: [
        { value: 'ASC', label: 'Oldest' },
        { value: 'DESC', label: 'Newest' },
        { value: 'RECOMMENDED', label: 'Recommended', requiresAI: true },
        { value: 'QUALITY', label: 'Quality', requiresAI: true },
        { value: 'ATTENTION', label: 'Attention', requiresAI: true }
      ],
      groupingOptions: [
        { value: 'all', label: 'None' },
        { value: 'eventCluster', label: 'Events' }
      ]
    };
  },
  methods: {
    // This function delays search updates until typing pauses.
    debounceSearchEvent: function() {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        this.emitSearchEvent();
      }, SEARCH_DEBOUNCE_DELAY);
    },
    // This function updates the selected search query when it is valid.
    emitSearchEvent: function() {
      if (!(this.$store.data.searchQuery === undefined || this.$store.data.searchQuery === null)) {
        const { valid } = validateSearchQuery(this.$store.data.searchQuery);
        if (valid) {
          this.$store.data.setSelectedSearch(this.$store.data.searchQuery);
        }
      }
    },
    // This function changes the cluster view only when the value differs.
    setClusterView: function(value) {
      if (this.$store.data.currentSelection.clusterView === value) {
        return;
      }
      this.$store.data.setClusterView(value);
    },
    // This function updates the selected article status or reloads the current one.
    statusClicked: function(status) {
      if (status === this.$store.data.getSelectedStatus) {
        this.$emit('forceReload');
      } else {
        this.$store.data.setSelectedStatus(status);
      }
    },
    // This function updates the active article view mode.
    viewModeClicked: function(filter) {
      this.$store.data.setViewMode(filter);
    },
    // This function updates the active article sort order.
    sortClicked: function(sort) {
      this.$store.data.setSelectedSort(sort);
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
        this.setClusterView(value);
      }
    },
    // This function opens the settings modal.
    settingsClicked: function() {
      this.showSettingsModal = true;
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
      this.$store.data.searchQuery = null;
      this.$store.data.chatAssistantOpen = !this.$store.data.chatAssistantOpen;
    }
  },
  // This function clears a pending search update before the component is removed.
  beforeUnmount() {
    clearTimeout(this.searchDebounceTimer);
  },
  computed:{
    // This function returns the currently active article selection from the store.
    currentSelection() {
      return this.$store.data.currentSelection;
    },
    // This function reports whether AI-powered toolbar options are available.
    isAIEnabled() {
      return this.currentSelection.AIEnabled;
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
    // This function builds the configured status, view, and sort dropdowns.
    toolbarDropdowns() {
      // This function filters out AI-only options when AI is unavailable.
      const visibleOptions = (options) => options.filter((option) => this.isAIEnabled || !option.requiresAI);
      const selectedSortOption = this.sortOptions.find((option) => option.value === this.selectedSort);
      const selectedGroupingOption = this.groupingOptions.find((option) => option.value === this.currentSelection.clusterView);

      const dropdowns = [
        {
          id: 'statusDropdown',
          type: 'status',
          label: 'Status',
          selectedLabel: this.capitalize(this.selectedStatus),
          selectedValue: this.selectedStatus,
          options: this.statusOptions
        },
        {
          id: 'viewModeDropdown',
          type: 'viewMode',
          label: 'View',
          selectedLabel: this.capitalize(this.selectedViewMode),
          selectedValue: this.selectedViewMode,
          options: visibleOptions(this.viewModeOptions)
        },
        {
          id: 'sortDropdown',
          type: 'sort',
          label: 'Sort',
          selectedLabel: selectedSortOption ? selectedSortOption.label : '',
          selectedValue: this.selectedSort,
          options: visibleOptions(this.sortOptions)
        }
      ];

      if (this.isAIEnabled) {
        dropdowns.push({
          id: 'groupingDropdown',
          type: 'grouping',
          label: 'Grouping',
          selectedLabel: selectedGroupingOption ? selectedGroupingOption.label : 'None',
          selectedValue: this.currentSelection.clusterView,
          options: this.groupingOptions
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
      const query = this.$store.data.searchQuery || '';
      const { valid } = validateSearchQuery(query);
      return !valid;
    },
    // This function returns the validation message for the current search query.
    searchQueryError() {
      const query = this.$store.data.searchQuery || '';
      const { error } = validateSearchQuery(query);
      return error;
    }
  }
};
</script>
