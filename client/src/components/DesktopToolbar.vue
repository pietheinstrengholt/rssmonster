<template>
  <div class="toolbar">
    <div class="settings-icon" @click="settingsClicked" title="Settings">
      <BootstrapIcon icon="gear-fill" size="20" />
    </div>
    <div class="status-toolbar" @click="toggleShowStatus">
      <p id="status">{{ capitalize($store.data.currentSelection.status) }}</p>
    </div>
    <div v-if="showStatusMenu" class="dropdownmenu" id="status">
      <div class="item" href="#" @click="statusClicked('unread')">
        <p>Unread</p>
      </div>
      <div class="item" href="#" @click="statusClicked('star')">
        <p>Star</p>
      </div>
      <div class="item" href="#" @click="statusClicked('hot')">
        <p>Hot</p>
      </div>
      <div class="item" href="#" @click="statusClicked('clicked')">
        <p>Clicked</p>
      </div>
      <div class="item" href="#" @click="statusClicked('read')">
        <p>Read</p>
      </div>
    </div>
    <div class="status-toolbar" @click="toggleShowViewMode">
      <p id="filter">{{ capitalize($store.data.currentSelection.viewMode) }}</p>
    </div>
    <div v-if="showViewModeMenu" class="dropdownmenu" id="filter">
      <div class="item" href="#" @click="viewModeClicked('full')">
        <p>Full</p>
      </div>
      <div class="item" href="#" @click="viewModeClicked('summarized')">
        <p>Summarized</p>
      </div>
      <div class="item" href="#" @click="viewModeClicked('minimal')">
        <p>Minimal</p>
      </div>
    </div>
    <div class="status-toolbar" @click="toggleShowSort">
      <p id="filter" v-if="$store.data.currentSelection.sort == 'DESC'">Newest</p>
      <p id="filter" v-if="$store.data.currentSelection.sort == 'ASC'">Oldest</p>
      <p id="filter" v-if="$store.data.currentSelection.sort == 'IMPORTANCE'">Importance</p>
    </div>
    <div class="status-toolbar" @click="toggleClusteredView" v-if="$store.data.currentSelection.AIEnabled">
      <p id="filter" v-if="$store.data.currentSelection.clusterView">All articles</p>
      <p id="filter" v-else>Grouped view</p>
    </div>
    <div v-if="showSortMenu" class="dropdownmenu" id="sort">
      <div class="item" href="#" @click="sortClicked('ASC')">
        <p>Oldest</p>
      </div>
      <div class="item" href="#" @click="sortClicked('DESC')">
        <p>Newest</p>
      </div>
      <div v-if="$store.data.currentSelection.AIEnabled" class="item" href="#" @click="sortClicked('IMPORTANCE')">
        <p>Importance</p>
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
    <div class="search-wrap">
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
  overflow: hidden;
  background-color: #eff1f3;
  position: fixed;
  margin-left: -15px;
  display: flex;
  align-items: center;
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

.status-toolbar #status {
  width: 50px;
}

.dropdownmenu {
  position: fixed;
  margin-top: 40px;
  background-color: #eff1f3;
  cursor: pointer;
  box-shadow: 0px 8px 16px 0px #000000;
  min-width: 100px;
  color: #111;
}

.dropdownmenu .item {
  border-bottom: 1px solid #e0e0e0;
  border-right: 1px solid #e0e0e0;
  border-left: 1px solid #e0e0e0;
  padding: px;
  cursor: pointer;
}

.dropdownmenu .item p {
  margin-left: 10px;
  margin-right: 10px;
  margin-bottom: 0px;
  font-weight: 400;
  font-size: 14px;
}

#status.dropdownmenu {
  margin-left: 40px;
}

#filter.dropdownmenu {
  margin-left: 112px;
  min-width: 120px;
}

#sort.dropdownmenu {
  margin-left: 165px;
}

#chat-icon {
  float:left;
  width: 20px;
  height: 20px;
  margin-top: 7px;
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
}

.search-wrap input {
  width: 100%;
  height: 40px;
  background-color: #eff1f3;
  font-size: 14px;
  border: none;
  margin-left: 6px;
}

.search-wrap input:focus {
  outline: none;
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

  .settings-icon {
    color: #fff;
    border-right: 1px solid #000;
  }

  .settings-icon:hover {
    background-color: #4a4a4a;
  }

  .dropdownmenu .item {
    border-bottom: 1px solid #fff;
    border-right: 1px solid #fff;
    border-left: 1px solid #fff;
  }

  .search-wrap input {
    background-color: #1e1e1e;
    color: #fff;
    border-color: #333;
  }

  .search-wrap input::placeholder {
    color: #999;
  }

  .search-wrap input.input-invalid {
    background-color: #4a1f1f;
    color: #ffbaba;
    border-color: #d77;
  }

  .search-wrap input.input-invalid::placeholder {
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
    toggleClusteredView: function() {
      const newValue = !this.$store.data.currentSelection.clusterView;
      this.$store.data.setClusterView(newValue);
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
      return (value)=> {
        return value.charAt(0).toUpperCase() + value.slice(1);
      }
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
