<template>
  <div class="toolbar">
    <div class="settings-icon" @click="settingsClicked" title="Settings">
      <BootstrapIcon icon="gear-fill" size="20" />
    </div>
    <!-- Read Mode Dropdown -->
    <div class="dropdown">
      <button class="dropdown-toggle toolbar-dropdown" type="button" id="dropdownMenuButton" data-bs-toggle="dropdown" aria-expanded="false">
        {{ capitalize($store.data.currentSelection.status) }}
      </button>
      <div class="dropdown-menu" aria-labelledby="dropdownMenuButton">
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.status === 'unread' }" href="#" @click="statusClicked('unread')">Unread</a>
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.status === 'star' }" href="#" @click="statusClicked('star')">Star</a>
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.status === 'hot' }" href="#" @click="statusClicked('hot')">Hot</a>
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.status === 'clicked' }" href="#" @click="statusClicked('clicked')">Clicked</a>
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.status === 'read' }" href="#" @click="statusClicked('read')">Read</a>
      </div>
    </div>
    <!-- View Mode Dropdown -->
    <div class="dropdown">
      <button class="dropdown-toggle toolbar-dropdown" type="button" id="dropdownMenuButton" data-bs-toggle="dropdown" aria-expanded="false">
        {{ capitalize($store.data.currentSelection.viewMode) }}
      </button>
      <div class="dropdown-menu" aria-labelledby="dropdownMenuButton">
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.viewMode === 'full' }" href="#" @click="viewModeClicked('full')">Full</a>
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.viewMode === 'summarized' }" href="#" @click="viewModeClicked('summarized')">Summarized</a>
        <a v-if="$store.data.currentSelection.AIEnabled" class="dropdown-item" :class="{ active: $store.data.currentSelection.viewMode === 'summaryBullets' }" href="#" @click="viewModeClicked('summaryBullets')">Summary Bullets</a>
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.viewMode === 'minimal' }" href="#" @click="viewModeClicked('minimal')">Minimal</a>
      </div>
    </div>
    <!-- Sort Mode Dropdown -->
    <div class="dropdown">
      <button class="dropdown-toggle toolbar-dropdown" type="button" id="dropdownMenuButton" data-bs-toggle="dropdown" aria-expanded="false">
        <span v-if="$store.data.currentSelection.sort === 'ASC'">Oldest</span>
        <span v-else-if="$store.data.currentSelection.sort === 'DESC'">Newest</span>
        <span v-else-if="$store.data.currentSelection.sort === 'IMPORTANCE'">Importance</span>
        <span v-else-if="$store.data.currentSelection.sort === 'QUALITY'">Quality</span>
        <span v-else-if="$store.data.currentSelection.sort === 'ATTENTION'">Attention</span>
      </button>
      <div class="dropdown-menu" aria-labelledby="dropdownMenuButton">
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.sort === 'ASC' }" href="#" @click="sortClicked('ASC')">Oldest</a>
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.sort === 'DESC' }" href="#" @click="sortClicked('DESC')">Newest</a>
        <a v-if="$store.data.currentSelection.AIEnabled" class="dropdown-item" :class="{ active: $store.data.currentSelection.sort === 'IMPORTANCE' }" href="#" @click="sortClicked('IMPORTANCE')">Importance</a>
        <a v-if="$store.data.currentSelection.AIEnabled" class="dropdown-item" :class="{ active: $store.data.currentSelection.sort === 'QUALITY' }" href="#" @click="sortClicked('QUALITY')">Quality</a>
        <a v-if="$store.data.currentSelection.AIEnabled" class="dropdown-item" :class="{ active: $store.data.currentSelection.sort === 'ATTENTION' }" href="#" @click="sortClicked('ATTENTION')">Attention</a>
      </div>
    </div>

    <!-- Cluster View Dropdown -->
    <div v-if="$store.data.currentSelection.AIEnabled" class="dropdown">
      <button class="dropdown-toggle toolbar-dropdown" type="button" id="dropdownMenuButton" data-bs-toggle="dropdown" aria-expanded="false">
        {{ $store.data.currentSelection.clusterView ? 'Cluster Reading Mode' : 'All articles' }}
      </button>
      <div class="dropdown-menu" aria-labelledby="dropdownMenuButton">
        <a class="dropdown-item" :class="{ active: $store.data.currentSelection.clusterView }" href="#" @click="setClusterView(true)">Cluster Reading Mode</a>
        <a class="dropdown-item" :class="{ active: !$store.data.currentSelection.clusterView }" href="#" @click="setClusterView(false)">All articles</a>
      </div>
    </div>

    <div v-if="$store.data.currentSelection.AIEnabled" class="status-toolbar" @click="chatAssistant">
      <div id="chat-icon">
          <BootstrapIcon icon="robot" size="20" />
      </div>
      <p id="chat-text">
        {{ $store.data.chatAssistantOpen ? 'Close Chat' : 'Chat' }}
      </p>
    </div>
    <div class="search-wrap" :class="{ invalid: isSearchQueryInvalid }">
      <input
        type="text"
        v-model="$store.data.searchQuery"
        @keyup="emitSearchEvent()"
        placeholder="Search for words or tag:name, title:text, etc."
        autocomplete="off"
        :class="{ 'input-invalid': isSearchQueryInvalid }"
        :title="searchQueryError"
      />
    </div>
    <Settings v-if="showSettingsModal" @close="closeSettingsModal" @forceReload="handleForceReload" />
  </div>
</template>

<style scoped>
.toolbar {
  height: 40px;
  border-bottom: 1px solid transparent;
  border-color: #dcdee0;
  width: 100%;
  overflow: visible;
  background-color: #eff1f3;
  position: fixed;
  margin-left: -15px;
  display: flex;
  align-items: center;
  z-index: 1000;
}

.toolbar-dropdown {
  background: transparent;
  border: none;
  color: inherit;
  box-shadow: none;
  padding: 6px 10px;
  height: 40px;
  line-height: 20px;
  font-size: 14px;
}

.toolbar-dropdown:focus,
.toolbar-dropdown:active,
.toolbar-dropdown:focus-visible {
  outline: none;
  box-shadow: none;
}

.dropdown, .status-toolbar {
  border-left: 1px solid #e0e0e0;
}

.dropdown-item {
  color: #111;
  font-size: 14px;
}

.dropdown-item.active,
.dropdown-item:hover {
  color: #fff;
}

.settings-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  cursor: pointer;
  color: #111;
  border-right: 1px solid #e0e0e0;
}

.settings-icon:hover {
  background-color: #dcdee0;
}

.settings-icon svg {
  margin-top: 3px;
  width: 20px;
  height: 20px;
}

.status-toolbar {
  border-right: 1px solid #e0e0e0;
  margin-left: 10px;
  text-align: center;
  cursor: pointer;
  color: #111;
  height: 40px;
  flex-shrink: 0;
}

.status-toolbar p {
  padding: 5px;
  font-size: 14px;
  margin-right: 12px;
  margin-top: 5px;
  height: 20px;
}

.search-wrap {
  border-bottom: 1px solid #e0e0e0;
}

.status-toolbar #status {
  width: 50px;
}

#chat-icon {
  float:left;
  width: 20px;
  height: 20px;
  margin-top: 7px;
  margin-left: 5px;
}

#chat-text {
  float:left;
  margin: 0;
  padding: 4px;
  font-size: 14px;
  margin-top: 6px;
  margin-right: 6px;
}

.search-wrap {
  flex-grow: 1;
  display: flex;
  align-items: center;
  padding-left: 6px;
}

.search-wrap input {
  width: 100%;
  height: 40px;
  background-color: #eff1f3;
  font-size: 14px;
  border: none;
}

.search-wrap input:focus {
  outline: none;
}

.search-wrap.invalid {
  background-color: #fdecea;
}

.search-wrap.invalid input.input-invalid {
  color: #b71c1c;
}

.search-wrap.invalid input.input-invalid::placeholder {
  color: #d32f2f;
}

.search-wrap input.input-invalid {
  background-color: #fdecea;
  color: #b71c1c;
  border-color: #f5c6cb;
}

.search-wrap input.input-invalid::placeholder {
  color: #d32f2f;
}

@media (prefers-color-scheme: dark) {
  .toolbar,
  .status-toolbar,
  .dropdownmenu .item {
    color: #fff;
    background: #3a3a3a;
    border-color: #000;
    border-bottom: 1px solid #fff;
  }

  .dropdown, .status-toolbar {
    border-left: 1px solid #fff;
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

  .settings-icon {
    color: #fff;
  }

  .settings-icon:hover {
    background-color: #4a4a4a;
  }

  .dropdown-item {
    color: #fff;
  }

  .dropdown-menu .item {
    border-bottom: 1px solid #fff;
    border-right: 1px solid #fff;
    border-left: 1px solid #fff;
  }

  .search-wrap {
    border-left: 1px solid #fff;
  }

  .search-wrap input {
    background-color: #1e1e1e;
    color: #fff;
    border-color: #333;
    background: #3a3a3a;
  }

  .search-wrap input::placeholder {
    color: #999;
  }

  .search-wrap.invalid {
    background-color: #4a1f1f;
  }

  .search-wrap.invalid input.input-invalid {
    color: #ffbaba;
    border-color: #d77;
  }

  .search-wrap.invalid input.input-invalid::placeholder {
    color: #ffbaba;
  }
}
</style>

<script>
import Settings from './Modal/Settings.vue';
import { validateSearchQuery } from '../services/queryValidation.js';

export default {
  components: {
    Settings
  },
  data() {
    return {
      showStatusMenu: false,
      showViewModeMenu: false,
      showSortMenu: false,
      showSettingsModal: false,
      showClusteredView: false
    };
  },
  methods: {
    emitSearchEvent: function() {
      if (!(this.$store.data.searchQuery === undefined || this.$store.data.searchQuery === null)) {
        const { valid } = validateSearchQuery(this.$store.data.searchQuery);
        if (valid) {
          this.$store.data.setSelectedSearch(this.$store.data.searchQuery);
        }
      }
    },
    toggleShowStatus: function() {
      this.showStatusMenu = !this.showStatusMenu;
      this.showSortMenu = false;
      this.showViewModeMenu = false;
      this.showClusteredView = false;
    },
    toggleShowViewMode: function() {
      this.showViewModeMenu = !this.showViewModeMenu;
      this.showSortMenu = false;
      this.showStatusMenu = false;
      this.showClusteredView = false;
    },
    toggleShowSort: function() {
      this.showSortMenu = !this.showSortMenu;
      this.showViewModeMenu = false;
      this.showStatusMenu = false;
      this.showClusteredView = false;
    },
    setClusterView: function(value) {
      // Don't trigger if already at the selected value
      if (this.$store.data.currentSelection.clusterView === value) {
        return;
      }
      this.$store.data.setClusterView(value);
      this.showSortMenu = false;
      this.showViewModeMenu = false;
      this.showStatusMenu = false;
    },
    statusClicked: function(status) {
      //if user selects current selection, then do a forceReload by emitting an event to parent
      if (status == this.$store.data.getSelectedStatus) {
        this.$emit('forceReload');
      } else {
        this.$store.data.setSelectedStatus(status);
      }
      this.toggleShowStatus();
    },
    viewModeClicked: function(filter) {
      this.$store.data.setViewMode(filter)
      this.toggleShowViewMode();
    },
    sortClicked: function(sort) {
      this.$store.data.setSelectedSort(sort);
      this.toggleShowSort();
    },
    settingsClicked: function() {
      this.showSettingsModal = true;
      this.showStatusMenu = false;
      this.showViewModeMenu = false;
      this.showSortMenu = false;
    },
    closeSettingsModal: function() {
      this.showStatusMenu = false;
      this.showViewModeMenu = false;
      this.showSortMenu = false;
      this.showSettingsModal = false;
    },
    handleForceReload: function() {
      this.$emit('forceReload');
    },
    chatAssistant: function() {
      this.showStatusMenu = false;
      this.showViewModeMenu = false;
      this.showSortMenu = false;
      this.$store.data.searchQuery = null;
      this.$store.data.chatAssistantOpen = !this.$store.data.chatAssistantOpen;
    }
  },
  computed:{
    capitalize() {
      return (value)=> value.charAt(0).toUpperCase() + value.slice(1)
    },
    isSearchQueryInvalid() {
      const query = this.$store.data.searchQuery || '';
      const { valid } = validateSearchQuery(query);
      return !valid;
    },
    searchQueryError() {
      const query = this.$store.data.searchQuery || '';
      const { error } = validateSearchQuery(query);
      return error;
    }
  }
};
</script>
