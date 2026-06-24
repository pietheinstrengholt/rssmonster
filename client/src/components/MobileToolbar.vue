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
        <button type="button" class="dropdown-item" :class="{ active: currentStatus === 'star' }" @click="statusClicked('star')">Star {{ $store.data.starCount }}</button>
        <button type="button" class="dropdown-item" :class="{ active: currentStatus === 'hot' }" @click="statusClicked('hot')">Hot {{ $store.data.hotCount }}</button>
        <button type="button" class="dropdown-item" :class="{ active: currentStatus === 'clicked' }" @click="statusClicked('clicked')">Clicked {{ $store.data.clickedCount }}</button>
        <button type="button" class="dropdown-item" :class="{ active: currentStatus === 'read' }" @click="statusClicked('read')">Read {{ $store.data.readCount }}</button>
        <li><hr class="dropdown-divider"></li>
        <button type="button" class="dropdown-item" :class="{ active: currentSelection.sort === 'ASC' }" @click="sortClicked('ASC')">Oldest</button>
        <button type="button" class="dropdown-item" :class="{ active: currentSelection.sort === 'DESC' }" @click="sortClicked('DESC')">Newest</button>
        <button v-if="isAIEnabled" type="button" class="dropdown-item" :class="{ active: currentSelection.sort === 'RECOMMENDED' }" @click="sortClicked('RECOMMENDED')">Recommended</button>
        <button v-if="isAIEnabled" type="button" class="dropdown-item" :class="{ active: currentSelection.sort === 'QUALITY' }" @click="sortClicked('QUALITY')">Quality</button>
        <button v-if="isAIEnabled" type="button" class="dropdown-item" :class="{ active: currentSelection.sort === 'ATTENTION' }" @click="sortClicked('ATTENTION')">Attention</button>
        <li><hr class="dropdown-divider"></li>
        <button v-if="isAIEnabled" type="button" class="dropdown-item" :class="{ active: currentSelection.clusterView === 'all' }" @click="setClusterView('all')">All articles</button>
        <button v-if="isAIEnabled" type="button" class="dropdown-item" :class="{ active: currentSelection.clusterView === 'eventCluster' }" @click="setClusterView('eventCluster')">Cluster per event</button>
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
  padding: 8px 12px 10px;
  color: #111827;
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
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
  color: #111827;
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
  background: transparent;
  color: #111827;
  font-size: 18px;
  cursor: pointer;
}

.mobile-toolbar-button:hover,
.mobile-toolbar-button:focus-visible {
  background: #f3f4f6;
}

.mobile-toolbar-filters {
  gap: 8px;
  padding-bottom: 2px;
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
  background: #ffffff;
  border-bottom: 1px solid #e5e7eb;
}

.mobile-search-input {
  width: 100%;
  height: 42px;
  padding: 0 14px;
  color: #111827;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  outline: none;
  font-size: 15px;
}

.mobile-filter-button {
  height: 40px;
  padding: 0 6px;
  color: #111827;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
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
  color: #111827;
  background: #f9fafb;
  border-color: #d1d5db;
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

.dropdown-item.active {
  color: #2a71e7;
  background-color: #ebf2fe;
}

:global(:root[data-theme='dark']) {
  .mobile-toolbar {
    color: var(--text-inverted);
    background: var(--bg-control);
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
  background: var(--bg-control);
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
</style>

<script>
const MOBILE_LANDSCAPE_WIDTH = 767;

const statusCountMap = {
  unread: 'unreadCount',
  star: 'starCount',
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
  },
  unmounted() {
    window.removeEventListener('resize', this.handleResize);
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
    setClusterView: function(value) {
      // Don't trigger if already at the selected value
      if (this.$store.data.currentSelection.clusterView === value) {
        return;
      }
      this.$store.data.setClusterView(value);
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
