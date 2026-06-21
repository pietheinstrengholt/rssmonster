<template>
  <div class="navbar-container">
    <div id="mobile-toolbar">
      <button
        @click="emitClickEvent('mobile','mobile')"
        id="rssmonster"
        class="view-button icon-button"
        title="Settings"
      >
        <BootstrapIcon icon="gear-fill" />
      </button>
      <a
        id="search"
        class="view-button"
        title="Search"
        @click="toggleSearch"
        data-behavior="search"
        data-remote="true"
      >
        <i class="fas fa-search" data-fa-transform="down-0 shrink-0 left-5"></i>
      </a>
    <!-- Read Mode Dropdown -->
    <div class="dropdown top-menu-dropdown first">
      <button class="dropdown-toggle toolbar-dropdown" type="button" id="readModeDropdown" data-bs-toggle="dropdown" aria-expanded="false">
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
    <div class="dropdown top-menu-dropdown middle">
      <button class="dropdown-toggle toolbar-dropdown" type="button" id="smartFoldersDropdown" data-bs-toggle="dropdown" aria-expanded="false">
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
    <div class="dropdown top-menu-dropdown last">
      <button class="dropdown-toggle toolbar-dropdown" type="button" id="categoriesDropdown" data-bs-toggle="dropdown" aria-expanded="false">
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
    <div v-if="showSearch" class="search-dialog">
      <input
        v-model="$store.data.searchQuery"
        @input="updateSearch"
        type="text"
        class="search-input"
        placeholder="Search articles..."
        @keyup.enter="performSearch"
        @keyup.esc="toggleSearch"
        autofocus
      />
    </div>
  </div>
</template>

<style>
.navbar-container {
  display: contents;
}

#mobile-toolbar {
  width: 100%;
  background-color: var(--toolbar-active-background);
  display: -webkit-box;
  display: -webkit-flex;
  display: -ms-flexbox;
  display: flex;
  height: 40px;
  border-bottom: 1px solid transparent;
  border-color: var(--mobile-toolbar-border);
  position: fixed;
  color: var(--text-primary);
  visibility: visible;
  opacity: 1;
  transition: visibility 0s linear 0s, opacity 150ms;
}
</style>

<style scoped>
#mobile-toolbar a {
  font-size: 14px;
  cursor: pointer;
}

.view-button {
  flex: 1;
  text-align: center;
  line-height: 41px;
  height: 100%;
  text-decoration: none;
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  font-weight: bold;
  user-select: none;
  color: var(--mobile-toolbar-title);
}

#rssmonster.icon-button {
  margin-top: 2px;
  max-width: 36px;
  min-width: 36px;
  flex: 0;
  border: none;
  background: transparent;
  color: var(--text-inverted);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-color: var(--mobile-toolbar-border);
}

#rssmonster.icon-button:hover {
  color: var(--text-inverted);
}

#search.view-button {
  max-width: 36px;
  min-width: 36px;
  flex: 0;
  position: relative;
  background: none;
  border-left: 1px solid var(--mobile-toolbar-border);
}

#search.view-button::before {
  content: "";
  position: absolute;
  top: 13px;
  left: 10px;
  width: 16px;
  height: 16px;
  background: url(../assets/images/magnifying-glass.png) center no-repeat;
  background-size: 16px 16px;
  filter: brightness(0) invert(1);
  pointer-events: none;
}

#search.view-button .fa-search {
  display: none;
}

.search-dialog {
  position: fixed;
  top: 41px;
  left: 0;
  right: 0;
  width: 100%;
  background-color: var(--text-inverted);
  border-bottom: 1px solid var(--border-input);
  display: flex;
  align-items: center;
  padding: 8px 0;
  z-index: 9998;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  padding: 8px 12px;
  font-size: 16px;
  background: transparent;
}

.toolbar-dropdown {
  background-color: transparent !important;
  border: none !important;
  color: var(--text-inverted);
  padding: 0 12px;
  font-weight: 500;
  font-size: 14px;
  cursor: pointer;
  margin-top: 10px;
}

.toolbar-dropdown:hover {
  color: var(--text-inverted);
}

.toolbar-dropdown:focus {
  box-shadow: none !important;
  color: var(--text-inverted);
}

.dropdown-item.active {
  background-color: var(--toolbar-active-background);
}

.top-menu-dropdown {
  border-left: 1px solid transparent;
  border-color: var(--mobile-toolbar-border);
}

@media (prefers-color-scheme: dark) {
  #mobile-toolbar {
    background: var(--bg-control);
  }

  .toolbar-dropdown,
  .toolbar-dropdown:hover,
  .toolbar-dropdown:focus,
  .toolbar-dropdown:active,
  .toolbar-dropdown.show,
  .show > .toolbar-dropdown.dropdown-toggle {
    color: var(--text-inverted) !important;
  }

  .view-button {
    color: var(--text-inverted);
    background: var(--bg-control);
    border-color: var(--dark-contrast);
  }

  #rssmonster.icon-button,
  #rssmonster.icon-button:hover {
    color: var(--text-inverted);
  }

  #search.view-button::before {
    filter: brightness(0) invert(1);
  }

  .search-dialog {
    background-color: var(--toolbar-search-background-dark);
    border-bottom-color: var(--bg-subtle);
  }

  .search-input {
    color: var(--text-inverted);
  }

  .search-input::placeholder {
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
