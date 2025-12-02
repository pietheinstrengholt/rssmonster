<template>
  <div class="toolbar">
    <div class="settings-icon" @click="settingsClicked" title="Settings">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" class="bi bi-gear-fill" viewBox="0 0 16 16">
        <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z"/>
      </svg>
    </div>
    <div class="status-toolbar" @click="toggleShowStatus">
      <p id="status">{{ capitalize($store.data.currentSelection.status) }}</p>
    </div>
    <div v-if="showStatusMenu" class="dropdownmenu" id="status">
      <div class="item" href="#" @click="statusClicked('unread')">
        <p>Unread</p>
      </div>
      <div class="item" href="#" @click="statusClicked('read')">
        <p>Read</p>
      </div>
      <div class="item" href="#" @click="statusClicked('star')">
        <p>Star</p>
      </div>
      <div class="item" href="#" @click="statusClicked('hot')">
        <p>Hot</p>
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
    </div>
    <div v-if="showSortMenu" class="dropdownmenu" id="sort">
      <div class="item" href="#" @click="sortClicked('ASC')">
        <p>Oldest</p>
      </div>
      <div class="item" href="#" @click="sortClicked('DESC')">
        <p>Newest</p>
      </div>
    </div>
    <div v-if="enableAgent" class="status-toolbar" @click="chatAssistant">
      <p>
        <BootstrapIcon icon="chat-text-fill" />
        {{ $store.data.chatAssistantOpen ? 'Close Chat' : 'Chat' }}
      </p>
    </div>    
    <form
      id="search-form"
      class="search-wrap"
      data-behavior="search_form"
      accept-charset="UTF-8"
      data-remote="true"
      method="post"
      role="url"
    >
      <input
        @keyup="emitSearchEvent()"
        v-model="search"
        type="text"
        class="search"
        placeholder="Search"
        autocomplete="off"
      >
    </form>
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
}

.status-toolbar {
  float: left;
  border-right: 1px solid #e0e0e0;
  margin-left: 10px;
  text-align: center;
  cursor: pointer;
  color: #111;
}

.status-toolbar p {
  padding: 4px;
  font-size: 14px;
  margin-right: 12px;
  margin-top: 5px;
}

.status-toolbar #status {
  width: 50px;
}

.search-wrap {
  width: 50%;
  float: left;
}

.search {
  width: 100%;
  height: 39px;
  margin: 0;
  padding: 4px 0px 3px 28px;
  font-size: 14px;
  background-color: #eff1f3;
  border: none;
  line-height: 1;
  color: #212325;
  background: url(../assets/images/search.svg) 8px 13px no-repeat;
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
  padding: 4px;
  cursor: pointer;
}

.dropdownmenu .item p {
  margin-left: 10px;
  margin-right: 10px;
  margin-bottom: 0px;
  font-weight: 400;
  font-size: 14px;
}


#filter.dropdownmenu {
  margin-left: 72px;
  min-width: 120px;
}

#sort.dropdownmenu {
  margin-left: 145px;
}

.settings-icon {
  float: left;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
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
}
</style>

<script>
import Settings from './Modal/Settings.vue';

export default {
  components: {
    Settings
  },
  data() {
    return {
      search: null,
      showStatusMenu: false,
      showViewModeMenu: false,
      showSortMenu: false,
      showSettingsModal: false
    };
  },
  methods: {
    emitSearchEvent: function() {
      if (!(this.search === undefined || this.search === null)) {
        this.$store.data.setSelectedSearch(this.search);
      }
    },
    toggleShowStatus: function() {
      this.showStatusMenu = !this.showStatusMenu;
      this.showSortMenu = false;
      this.showViewModeMenu = false;
    },
    toggleShowViewMode: function() {
      this.showViewModeMenu = !this.showViewModeMenu;
      this.showSortMenu = false;
      this.showStatusMenu = false;
    },
    toggleShowSort: function() {
      this.showSortMenu = !this.showSortMenu;
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
      this.showSettingsModal = false;
    },
    handleForceReload: function() {
      this.$emit('forceReload');
    },
    chatAssistant: function() {
      this.$store.data.chatAssistantOpen = !this.$store.data.chatAssistantOpen;
    }
  },
  computed:{
    capitalize() {
      return (value)=> {
        return value.charAt(0).toUpperCase() + value.slice(1);
      }
    },
    enableAgent() {
      return import.meta.env.VITE_ENABLE_AGENT === 'true';
    }
  }
};
</script>
