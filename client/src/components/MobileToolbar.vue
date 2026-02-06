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
      <button class="dropdown-toggle toolbar-dropdown" type="button" id="dropdownMenuButton" data-bs-toggle="dropdown" aria-expanded="false">
        {{ capitalize($store.data.currentSelection.status) }} {{ getStatusCount() }}
      </button>
      <div class="dropdown-menu" aria-labelledby="dropdownMenuButton">
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.status === 'unread' }" href="#" @click="statusClicked('unread')">Unread {{ $store.data.unreadCount }}</a>
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.status === 'star' }" href="#" @click="statusClicked('star')">Star {{ $store.data.starCount }}</a>
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.status === 'hot' }" href="#" @click="statusClicked('hot')">Hot {{ $store.data.hotCount }}</a>
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.status === 'clicked' }" href="#" @click="statusClicked('clicked')">Clicked {{ $store.data.clickedCount }}</a>
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.status === 'read' }" href="#" @click="statusClicked('read')">Read {{ $store.data.readCount }}</a>
        <li><hr class="dropdown-divider"></li>
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.sort === 'ASC' }" href="#" @click="sortClicked('ASC')">Oldest</a>
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.sort === 'DESC' }" href="#" @click="sortClicked('DESC')">Newest</a>
        <a v-if="$store.data.currentSelection.AIEnabled" class="dropdown-item" :class="{ active: $store.data.currentSelection.sort === 'IMPORTANCE' }" href="#" @click="sortClicked('IMPORTANCE')">Importance</a>
        <a v-if="$store.data.currentSelection.AIEnabled" class="dropdown-item" :class="{ active: $store.data.currentSelection.sort === 'QUALITY' }" href="#" @click="sortClicked('QUALITY')">Quality</a>
        <a v-if="$store.data.currentSelection.AIEnabled" class="dropdown-item" :class="{ active: $store.data.currentSelection.sort === 'ATTENTION' }" href="#" @click="sortClicked('ATTENTION')">Attention</a>
        <li><hr class="dropdown-divider"></li>
        <a v-if="$store.data.currentSelection.AIEnabled" class="dropdown-item" :class="{ active: !$store.data.currentSelection.clusterView }" href="#" @click="toggleClusteredView">Cluster Reading Mode</a>
        <a v-if="$store.data.currentSelection.AIEnabled" class="dropdown-item" :class="{ active: $store.data.currentSelection.clusterView }" href="#" @click="toggleClusteredView">All articles</a>
      </div>
    </div>
    <!-- Smart Folder Dropdown -->
    <div class="dropdown top-menu-dropdown middle">
      <button class="dropdown-toggle toolbar-dropdown" type="button" id="dropdownMenuButton" data-bs-toggle="dropdown" aria-expanded="false">
        {{ 'Smart Folders' }}
      </button>
      <div class="dropdown-menu" aria-labelledby="dropdownMenuButton">
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.smartFolderId === null }" href="#" 
          @click="$store.data.setCurrentSmartFolderId(null, '')"
        >
          {{ 'No smart folder' }}
        </a>
        <a 
          v-for="folder in $store.data.smartFolders" 
          :key="folder.id" 
          class="dropdown-item" 
          :class="{ active: $store.data.currentSelection.smartFolderId === folder.id }" 
          href="#" 
          @click="$store.data.setCurrentSmartFolderId(folder.id, folder.query)"
        >
          {{ folder.name }} {{ folder.ArticleCount }}
        </a>
      </div>
    </div>
    <!-- Categories Dropdown -->
    <div class="dropdown top-menu-dropdown last">
      <button class="dropdown-toggle toolbar-dropdown" type="button" id="dropdownMenuButton" data-bs-toggle="dropdown" aria-expanded="false">
        {{ 'Categories' }}
      </button>
      <div class="dropdown-menu" aria-labelledby="dropdownMenuButton">
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.categoryId === '%' }" href="#" 
          @click="$store.data.setSelectedCategoryId('%')"
        >
          {{ 'All categories' }}
        </a>
        <a 
          v-for="category in $store.data.categories" 
          :key="category.id" 
          class="dropdown-item" 
          :class="{ active: Number($store.data.currentSelection.categoryId) === category.id }" 
          href="#" 
          @click="$store.data.setSelectedCategoryId(category.id)"
        >
          {{ category.name }} {{ getCategoryCount(category) }}
        </a>
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
  background-color: #3b4651;
  display: -webkit-box;
  display: -webkit-flex;
  display: -ms-flexbox;
  display: flex;
  height: 41px;
  border-bottom: 1px solid transparent;
  border-color: #dcdee0;
  position: fixed;
  color: #fff;
  visibility: visible;
  opacity: 1;
  transition: visibility 0s linear 0s, opacity 150ms;
}
</style>

<style scoped>
#mobile-toolbar a {
  font-size: 12px;
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
  color: #b4b6b8;
}

#rssmonster.icon-button {
  margin-top: 2px;
  max-width: 36px;
  min-width: 36px;
  flex: 0;
  border: none;
  background: transparent;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-color: #dcdee0;
}

#rssmonster.icon-button:hover {
  color: #fff;
}

#search.view-button {
  max-width: 36px;
  min-width: 36px;
  flex: 0;
  background: url(../assets/images/magnifying-glass.png) 10px 13px no-repeat;
  background-size: 16px 16px;
  filter: brightness(0) invert(1);
  border-left: 1px solid transparent;
  border-color: #dcdee0;
}

.search-dialog {
  position: fixed;
  top: 41px;
  left: 0;
  right: 0;
  width: 100%;
  background-color: #fff;
  border-bottom: 1px solid #dcdee0;
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
  color: #b4b6b8;
  padding: 0 12px;
  font-weight: bold;
  font-size: 12px;
  text-transform: uppercase;
  cursor: pointer;
  margin-top: 12px;
}

.toolbar-dropdown:hover {
  color: #fff;
}

.toolbar-dropdown:focus {
  box-shadow: none !important;
  color: #fff;
}

.top-menu-dropdown {
  border-left: 1px solid transparent;
  border-color: #dcdee0;
}

@media (prefers-color-scheme: dark) {
  #mobile-toolbar {
    background: #3a3a3a;
  }

  .toolbar-dropdown {
    color: #fff;
  }

  .view-button {
    color: #fff;
    background: #3a3a3a;
    border-color: #000;
  }

  .search-dialog {
    background-color: #1e1e1e;
    border-bottom-color: #333;
  }

  .search-input {
    color: #fff;
  }

  .search-input::placeholder {
    color: #999;
  }

  .dropdown-menu {
    background-color: #2a2a2a;
    border-color: #444;
  }

  .dropdown-item {
    color: #ccc;
  }

  .dropdown-item:hover {
    background-color: #3a3a3a;
    color: #fff;
  }

  .dropdown-item.active {
    background-color: #4a7fc7;
    color: #fff;
  }
}
</style>

<script>
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
    loadType: function(status) {
      //if user selects current selection, then do a forceReload by emitting an event to parent
      if (status == this.$store.data.getSelectedStatus) {
        this.$emit('forceReload');
      } else {
        this.$store.data.setSelectedStatus(status);
      }
    },
    emitClickEvent(eventType, value) {
      this.$emit(eventType, value);
    },
    handleResize() {
      // Close search when switching from portrait to landscape (width >= 767)
      if (this.showSearch && window.innerWidth >= 767) {
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
    toggleClusteredView: function() {
      const newValue = !this.$store.data.currentSelection.clusterView;
      this.$store.data.setClusterView(newValue);
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
      if (status == this.$store.data.getSelectedStatus) {
        this.$emit('forceReload');
      } else {
        this.$store.data.setSelectedStatus(status);
      }
    },
    getStatusCount() {
      const status = this.$store.data.currentSelection.status;
      switch(status) {
        case 'unread':
          return this.$store.data.unreadCount;
        case 'star':
          return this.$store.data.starCount;
        case 'hot':
          return this.$store.data.hotCount;
        case 'clicked':
          return this.$store.data.clickedCount;
        case 'read':
          return this.$store.data.readCount;
        default:
          return 0;
      }
    },
    getSmartFolderName() {
      const smartFolderId = this.$store.data.currentSelection.smartFolderId;
      if (!smartFolderId) return null;
      const folder = this.$store.data.smartFolders.find(f => f.id === smartFolderId);
      return folder ? folder.name : null;
    },
    getCategoryCount(category) {
      const status = this.$store.data.currentSelection.status;
      switch(status) {
        case 'unread':
          return category.unreadCount || 0;
        case 'star':
          return category.starCount || 0;
        case 'hot':
          return category.hotCount || 0;
        case 'clicked':
          return category.clickedCount || 0;
        case 'read':
          return category.readCount || 0;
        default:
          return 0;
      }
    }
  },
  computed: {
    capitalize() {
      return function(s) {
        if (typeof s !== 'string') return '';
        return s.charAt(0).toUpperCase() + s.slice(1);
      };
    }
  }
};
</script>