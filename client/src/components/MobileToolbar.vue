<template>
  <div class="navbar-container">
    <div id="mobile-toolbar">
      <a
        @click="emitClickEvent('mobile','mobile')"
        id="rssmonster"
        class="view-button"
        data-behavior="view_unread change_view_mode"
        data-view-mode="view_unread"
        data-remote="true"
      >
      </a>
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
      <a
        v-on:click="loadType('unread')"
        v-bind:class="{ 'selected':  $store.data.currentSelection.status == 'unread' }"
        id="unread"
        class="view-button"
        title="View unread"
        data-behavior="view_unread change_view_mode"
        data-view-mode="view_unread"
        data-remote="true"
      >
        <i class="fas fa-circle" data-fa-transform="down-0 shrink-0 left-5"></i>
        Unread {{ $store.data.unreadCount }}
      </a>
      <a
        v-on:click="loadType('read')"
        v-bind:class="{ 'selected':  $store.data.currentSelection.status == 'read' }"
        id="read"
        class="view-button"
        title="View read"
        data-behavior="view_read change_view_mode"
        data-view-mode="view_read"
        data-remote="true"
      >
        <i class="far fa-circle" data-fa-transform="down-0 shrink-0 left-5"></i>
        Read {{ $store.data.readCount }}
      </a>
      <a
        v-on:click="loadType('star')"
        v-bind:class="{ 'selected':  $store.data.currentSelection.status == 'star' }"
        id="star"
        class="view-button"
        title="View starred"
        data-behavior="view_starred change_view_mode"
        data-view-mode="view_starred"
        data-remote="true"
      >
        <i class="far fa-heart" data-fa-transform="down-0 shrink-0 left-5"></i>
        Star {{ $store.data.starCount }}
      </a>
      <a
        v-on:click="loadType('hot')"
        v-bind:class="{ 'selected':  $store.data.currentSelection.status == 'hot' }"
        id="hot"
        class="view-button"
        title="View hot"
        data-behavior="view_hot change_view_mode"
        data-view-mode="view_hot"
        data-remote="true"
      >
        <i class="far fa-heart" data-fa-transform="down-0 shrink-0 left-5"></i>
        Hot {{ $store.data.hotCount }}
      </a>
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

#mobile-toolbar.hide {
  visibility: hidden;
  opacity: 0;
  transition: visibility 0s linear 150ms, opacity 150ms;
}

.view-button {
  -webkit-box-flex: 1;
  -webkit-flex: 1;
  -ms-flex: 1;
  flex: 1;
  text-align: center;
  line-height: 41px;
  height: 100%;
  text-decoration: none;
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  font-weight: bold;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  color: #b4b6b8;
}

#rssmonster.view-button {
  background: url(../assets/images/monster-dark.png) 8px 10px no-repeat;
  background-size: 20px 20px;
  max-width: 36px;
  min-width: 36px;
}

#search.view-button {
  max-width: 36px;
  min-width: 36px;
  flex: 0;
  background: url(../assets/images/magnifying-glass.png) 10px 13px no-repeat;
  background-size: 16px 16px;
  /* Force the PNG to appear white */
  filter: brightness(0) invert(1);
  border-left: 1px solid transparent;
  border-color: #dcdee0;
}

#search.view-button i {
  line-height: normal;
}

#title.view-button {
  text-align: left;
  margin-left: 10px;
  max-width: 90px;
}

#unread.view-button,
#star.view-button,
#read.view-button,
#hot.view-button {
  border-left: 1px solid transparent;
  border-color: #dcdee0;
  cursor: pointer;
}

#hot.view-button {
  flex: 0 0 64px;
}

.view-button.selected {
  color: #fff;
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

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 20px;
  transition: color 0.2s, transform 0.2s;
  flex-shrink: 0;
  margin-right: 4px;
}

.close-btn:hover {
  color: #000;
  transform: scale(1.1);
}

.close-btn:active {
  transform: scale(0.95);
}

.close-btn i {
  line-height: 1;
  display: block;
}

@media (prefers-color-scheme: dark) {
  #mobile-toolbar {
    background: #3a3a3a;
  }

  .view-toolbar,
  .view-button {
    color: #fff;
    background: #3a3a3a;
    border-color: #000;
  }

  #rssmonster.view-button,
  #unread.view-button,
  #star.view-button,
  #read.view-button,
  #hot.view-button {
    border-bottom: 1px solid #fff;
  }

  .view-button.selected {
    color: #3be6c4;
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

  .close-btn {
    color: #666;
  }

  .close-btn:hover {
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
    performSearch() {
      if (this.$store.data.searchQuery.trim()) {
        this.$store.data.setSelectedSearch(this.$store.data.searchQuery);
        this.toggleSearch();
      }
    }
  }
};
</script>