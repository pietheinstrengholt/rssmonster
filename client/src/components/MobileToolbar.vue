<template>
  <div class="mobile-toolbar-container">
    <nav id="mobile-toolbar" class="mobile-toolbar" aria-label="Mobile article toolbar">
      <div class="mobile-toolbar-brand-row">
        <div class="mobile-toolbar-brand">
          <img class="mobile-toolbar-logo" src="../assets/images/monster.png" alt="" />
          <span>RSSMonster</span>
        </div>
        <div class="mobile-toolbar-actions">
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
        <div class="dropdown mobile-toolbar-filter">
      <button class="dropdown-toggle mobile-filter-button" type="button" id="readModeDropdown" data-bs-toggle="dropdown" aria-expanded="false">
        {{ capitalize(currentStatus) }} {{ getStatusCount() }}
      </button>
      <div class="dropdown-menu" aria-labelledby="readModeDropdown">
        <button type="button" class="dropdown-item" :class="{ active: currentStatus === 'unread' }" @click="statusClicked('unread')">Unread {{ $store.data.unreadCount }}</button>
        <button type="button" class="dropdown-item" :class="{ active: currentStatus === 'favorite' }" @click="statusClicked('favorite')">Favorite {{ $store.data.favoriteCount }}</button>
        <button type="button" class="dropdown-item" :class="{ active: currentStatus === 'hot' }" @click="statusClicked('hot')">Hot {{ $store.data.hotCount }}</button>
        <button type="button" class="dropdown-item" :class="{ active: currentStatus === 'clicked' }" @click="statusClicked('clicked')">Clicked {{ $store.data.clickedCount }}</button>
        <button type="button" class="dropdown-item" :class="{ active: currentStatus === 'read' }" @click="statusClicked('read')">Read {{ $store.data.readCount }}</button>
        <li><hr class="dropdown-divider"></li>
        <button type="button" class="dropdown-item" :class="{ active: currentSelection.sort === 'asc' }" @click="sortClicked('asc')">Oldest</button>
        <button type="button" class="dropdown-item" :class="{ active: currentSelection.sort === 'desc' }" @click="sortClicked('desc')">Newest</button>
        <button v-if="isAIEnabled" type="button" class="dropdown-item" :class="{ active: currentSelection.sort === 'recommended' }" @click="sortClicked('recommended')">Recommended</button>
        <button v-if="isAIEnabled" type="button" class="dropdown-item" :class="{ active: currentSelection.sort === 'quality' }" @click="sortClicked('quality')">Quality</button>
        <button v-if="isAIEnabled" type="button" class="dropdown-item" :class="{ active: currentSelection.sort === 'attention' }" @click="sortClicked('attention')">Most Engaged</button>
        <li v-if="isAIEnabled" ><hr class="dropdown-divider"></li>
        <button v-if="isAIEnabled" type="button" class="dropdown-item" :class="{ active: currentSelection.grouping === 'none' }" @click="setGrouping('none')">All articles</button>
        <button v-if="isAIEnabled" type="button" class="dropdown-item" :class="{ active: currentSelection.grouping === 'event' }" @click="setGrouping('event')">Cluster per event</button>
        <button v-if="isAIEnabled" type="button" class="dropdown-item" :class="{ active: currentSelection.grouping === 'topic' }" @click="setGrouping('topic')">Cluster per topic</button>
      </div>
    </div>
        <!-- Smart Folder Dropdown -->
        <div class="dropdown mobile-toolbar-filter">
          <button class="dropdown-toggle mobile-filter-button" type="button" id="smartFoldersDropdown" data-bs-toggle="dropdown" aria-expanded="false">
        {{ 'Smart folders' }}
      </button>
      <div class="dropdown-menu" aria-labelledby="smartFoldersDropdown">
        <button type="button" class="dropdown-item" :class="{ active: currentSelection.smartFolderId === null }"
          @click="$store.data.setSmartFolder(null)"
        >
          {{ 'No smart folder' }}
        </button>
        <button
          v-for="folder in smartFolders"
          :key="folder.id"
          class="dropdown-item"
          :class="{ active: currentSelection.smartFolderId === folder.id }"
          type="button"
          @click="$store.data.setSmartFolder(folder)"
        >
          {{ folder.name }} {{ folder.ArticleCount }}
        </button>
      </div>
    </div>
        <!-- Categories Dropdown -->
        <div class="dropdown mobile-toolbar-filter">
          <button class="dropdown-toggle mobile-filter-button" type="button" id="categoriesDropdown" data-bs-toggle="dropdown" aria-expanded="false">
        {{ 'Categories' }}
      </button>
      <div class="dropdown-menu" aria-labelledby="categoriesDropdown">
        <button type="button" class="dropdown-item" :class="{ active: currentSelection.categoryId === '%' }"
          @click="$store.data.setSelectedCategoryId('%')"
        >
          {{ 'All categories' }}
        </button>
        <button
          v-for="category in categories"
          :key="category.id"
          class="dropdown-item"
          :class="{ active: Number(currentSelection.categoryId) === category.id }"
          type="button"
          @click="$store.data.setSelectedCategoryId(category.id)"
        >
          {{ category.name }} {{ getCategoryCount(category) }}
        </button>
      </div>
        </div>
      </div>
    </nav>
    <div v-if="showSearch" class="mobile-search-panel">
      <input
        ref="searchInput"
        v-model="$store.data.searchQuery"
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
</template>

<style scoped>
.mobile-toolbar-container {
  display: contents;
}

.mobile-toolbar {
  position: sticky;
  top: 0;
  z-index: 100;
  width: 100%;
  padding: 8px 12px 8px;
  color: var(--text-primary);
  background-color: var(--desktop-toolbar-background);
  border-bottom: 1px solid var(--border-color);
}

@media (max-width: 766px) {
  .mobile-toolbar {
    transition: transform 150ms ease;
    will-change: transform;
  }

  .mobile-toolbar.hide {
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
  margin-bottom: 8px;
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

.mobile-toolbar-filters {
  gap: 8px;
  overflow: visible;
}

.mobile-toolbar-filter {
  flex: 0 0 auto;
  margin-right: 8px;
}

.mobile-search-panel {
  position: relative;
  width: 100%;
  padding: 10px 16px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border-color);
}

.mobile-search-input {
  width: 100%;
  height: 42px;
  padding: 0 14px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  outline: none;
  font-size: 15px;
}

.mobile-filter-button {
  height: 40px;
  padding: 0 6px;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  box-shadow: 0 1px 2px var(--shadow-card-subtle-color);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  white-space: nowrap;
  cursor: pointer;
}

.dropdown-menu.show,
.dropdown-menu.show .dropdown-item {
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
}

.mobile-filter-button:hover,
.mobile-filter-button:focus,
.mobile-filter-button.show {
  color: var(--text-primary);
  background: var(--bg-page);
  border-color: var(--border-subtle);
  box-shadow: none;
}

.mobile-filter-button::after {
  margin-left: 6px;
}

@media (max-width: 360px) {
  .mobile-toolbar-filters {
    gap: 6px;
  }

  .mobile-filter-button {
    padding: 0 4px;
  }
}

/* Keeps only the phone portrait brand row compact without affecting the filter dropdowns. */
@media (max-width: 766px) and (orientation: portrait) {
  .mobile-toolbar-brand-row {
    min-height: 56px;
    margin: -10px -4px 0px;
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
    position: relative;
    isolation: isolate;
    width: 40px;
    height: 40px;
    color: var(--toolbar-text);
    background: var(--color-transparent);
    font-size: 20px;
  }

  .mobile-toolbar-button::before {
    position: absolute;
    z-index: 0;
    inset: 2px;
    content: '';
    background-color: var(--bg-card);
    border: 1px solid var(--border-input);
    border-radius: 999px;
    pointer-events: none;
  }

  .mobile-toolbar-button:hover,
  .mobile-toolbar-button:focus-visible {
    background: var(--color-transparent);
  }

  .mobile-toolbar-button:hover::before,
  .mobile-toolbar-button:focus-visible::before {
    background-color: var(--border-input);
  }

  .mobile-toolbar-button:focus-visible {
    outline: 2px solid var(--color-primary);
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

  .mobile-filter-button {
    height: 34px;
    border-radius: 8px;
    font-size: 14px;
  }
}

.dropdown-item.active {
  color: var(--color-primary);
  background-color: var(--color-primary-soft);
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
  .mobile-filter-button.show {
    color: var(--text-inverted) !important;
  }

  .mobile-toolbar-button:hover,
  .mobile-toolbar-button:focus-visible {
    background: var(--bg-subtle);
  }

  .mobile-filter-button,
  .mobile-filter-button:hover,
  .mobile-filter-button:focus,
  .mobile-filter-button.show {
    background: var(--bg-control);
    border-color: var(--dark-contrast);
  }

  .mobile-search-panel {
    background-color: var(--toolbar-search-background-dark);
    border-bottom-color: var(--dark-contrast);
  }

  .mobile-search-input {
    color: var(--text-inverted);
    background: var(--bg-control);
    border-color: var(--dark-contrast);
  }

  .mobile-search-input::placeholder {
    color: var(--text-muted);
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
}

:global(:root[data-theme='dark'] .mobile-toolbar) {
  color: var(--text-inverted);
  background-color: var(--desktop-toolbar-background);
  border-bottom-color: var(--dark-contrast);
}

:global(:root[data-theme='dark'] .mobile-toolbar-brand),
:global(:root[data-theme='dark'] .mobile-toolbar-button),
:global(:root[data-theme='dark'] .mobile-filter-button),
:global(:root[data-theme='dark'] .mobile-filter-button:hover),
:global(:root[data-theme='dark'] .mobile-filter-button:focus),
:global(:root[data-theme='dark'] .mobile-filter-button.show) {
  color: var(--text-inverted) !important;
}

:global(:root[data-theme='dark'] .mobile-toolbar-button:hover),
:global(:root[data-theme='dark'] .mobile-toolbar-button:focus-visible) {
  background: var(--bg-subtle);
}

:global(:root[data-theme='dark'] .mobile-filter-button),
:global(:root[data-theme='dark'] .mobile-filter-button:hover),
:global(:root[data-theme='dark'] .mobile-filter-button:focus),
:global(:root[data-theme='dark'] .mobile-filter-button.show) {
  background: var(--bg-control);
  border-color: var(--dark-contrast);
}

:global(:root[data-theme='dark'] .mobile-search-panel) {
  background-color: var(--toolbar-search-background-dark);
  border-bottom-color: var(--dark-contrast);
}

:global(:root[data-theme='dark'] .mobile-search-input) {
  color: var(--text-inverted);
  background: var(--bg-control);
  border-color: var(--dark-contrast);
}

:global(:root[data-theme='dark'] .mobile-search-input::placeholder) {
  color: var(--text-muted);
}

:global(:root[data-theme='dark'] .dropdown-menu) {
  background-color: var(--bg-modal);
  border-color: var(--border-color);
}

:global(:root[data-theme='dark'] .dropdown-item) {
  color: var(--text-secondary);
}

:global(:root[data-theme='dark'] .dropdown-item:hover) {
  color: var(--text-inverted);
  background-color: var(--bg-control);
}

:global(:root[data-theme='dark'] .dropdown-item.active) {
  color: var(--text-inverted);
  background-color: var(--toolbar-active-background);
}

@media (max-width: 766px) and (orientation: portrait) {
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
const MOBILE_LANDSCAPE_WIDTH = 767;

const statusCountMap = {
  unread: 'unreadCount',
  favorite: 'favoriteCount',
  hot: 'hotCount',
  clicked: 'clickedCount',
  read: 'readCount'
};

export default {
  emits: ['mobile', 'forceReload'],
  data() {
    return {
      showSearch: false
    };
  },
  mounted() {
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('rssmonster:focus-search', this.focusSearchInput);
  },
  unmounted() {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('rssmonster:focus-search', this.focusSearchInput);
  },
  methods: {
    emitClickEvent(eventType, value) {
      this.$emit(eventType, value);
    },
    handleResize() {
      // Close search when switching from portrait to landscape
      if (this.showSearch && window.innerWidth >= MOBILE_LANDSCAPE_WIDTH) {
        this.toggleSearch();
      }
    },
    updateSearch() {
      this.$store.data.setSelectedSearch(this.$store.data.searchQuery);
    },
    toggleSearch() {
      this.showSearch = !this.showSearch;
      this.$store.data.setMobileSearchOpen(this.showSearch);
    },
    focusSearchInput() {
      this.showSearch = true;
      this.$store.data.setMobileSearchOpen(true);
      this.$nextTick(() => this.$refs.searchInput?.focus());
    },
    setGrouping: function(value) {
      // Don't trigger if already at the selected value
      if (this.$store.data.currentSelection.grouping === value) {
        return;
      }
      this.$store.data.setGrouping(value);
    },
    performSearch() {
      if (this.$store.data.searchQuery.trim()) {
        this.$store.data.setSelectedSearch(this.$store.data.searchQuery);
        this.toggleSearch();
      }
    },
    sortClicked: function(sort) {
      this.$store.data.setSelectedSort(sort);
    },
    statusClicked: function(status) {
      //if user selects current selection, then do a forceReload by emitting an event to parent
      if (status === this.$store.data.getSelectedStatus) {
        this.$emit('forceReload');
      } else {
        this.$store.data.setSelectedStatus(status);
      }
    },
    getStatusCount() {
      return this.$store.data[statusCountMap[this.currentStatus]] ?? 0;
    },
    getCategoryCount(category) {
      return category[statusCountMap[this.currentStatus]] ?? 0;
    }
  },
  computed: {
    currentSelection() {
      return this.$store.data.currentSelection;
    },
    smartFolders() {
      return this.$store.data.smartFolders;
    },
    categories() {
      return this.$store.data.categories;
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
