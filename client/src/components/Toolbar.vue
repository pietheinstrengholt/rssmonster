<template>
  <div class="toolbar">
    <div class="status-toolbar" @click="toggleShowStatus">
      <p id="status">{{ this.store.currentSelection.status | capitalize }}</p>
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
    </div>
    <div class="status-toolbar" @click="toggleShowFilter">
      <p id="filter">{{ this.store.filter | capitalize }}</p>
    </div>
    <div v-if="showFilterMenu" class="dropdownmenu" id="filter">
      <div class="item" href="#" @click="filterClicked('full')">
        <p>Full</p>
      </div>
      <div class="item" href="#" @click="filterClicked('minimal')">
        <p>Minimal</p>
      </div>
    </div>
    <div class="status-toolbar" @click="toggleShowSort">
      <p id="filter" v-if="this.store.currentSelection.sort == 'DESC'">Newest</p>
      <p id="filter" v-if="this.store.currentSelection.sort == 'ASC'">Oldest</p>
    </div>
    <div v-if="showSortMenu" class="dropdownmenu" id="sort">
      <div class="item" href="#" @click="sortClicked('ASC')">
        <p>Oldest</p>
      </div>
      <div class="item" href="#" @click="sortClicked('DESC')">
        <p>Newest</p>
      </div>
    </div>
    <form
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
  </div>
</template>

<style>
div.toolbar {
  height: 40px;
  border-bottom: 1px solid transparent;
  border-color: #dcdee0;
  position: absolute;
  width: 100%;
  overflow: hidden;
  background-color: #eff1f3;
  position: fixed;
  margin-left: -18px;
}

.search-wrap {
  width: 50%;
  float: left;
}

.search {
  width: 100%;
  color: #3399ff;
  height: 39px;
  margin: 0;
  padding: 4px 0px 3px 28px;
  font-size: 14px;
  background-color: #eff1f3;
  border: none;
  line-height: 1;
  color: #212325;
  background: url(../assets/search.svg) 8px 13px no-repeat;
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

.dropdownmenu {
  position: fixed;
  margin-top: 40px;
  background-color: #eff1f3;
  cursor: pointer;
  box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.2);
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

.status-toolbar #status,
.status-toolbar #filter {
  width: 50px;
}

#filter.dropdownmenu {
  margin-left: 72px;
}

#sort.dropdownmenu {
  margin-left: 145px;
}
</style>


<script>
import store from "../store";

export default {
  data() {
    return {
      store: store,
      search: null,
      showStatusMenu: false,
      showFilterMenu: false,
      showSortMenu: false
    };
  },
  methods: {
    emitSearchEvent: function() {
      if (!(this.search === undefined || this.search === null)) {
        this.store.currentSelection.search = this.search;
      }
    },
    toggleShowStatus: function() {
      this.showStatusMenu = !this.showStatusMenu;
      this.showSortMenu = false;
      this.showFilterMenu = false;
    },
    toggleShowFilter: function() {
      this.showFilterMenu = !this.showFilterMenu;
      this.showSortMenu = false;
      this.showStatusMenu = false;
    },
    toggleShowSort: function() {
      this.showSortMenu = !this.showSortMenu;
      this.showFilterMenu = false;
      this.showStatusMenu = false;
    },
    statusClicked: function(status) {
      this.store.currentSelection.status = status;
      this.toggleShowStatus();
    },
    filterClicked: function(filter) {
      this.store.filter = filter;
      this.toggleShowFilter();
    },
    sortClicked: function(sort) {
      this.store.currentSelection.sort = sort;
      this.toggleShowSort();
    }
  },
  filters: {
    capitalize: function(value) {
      if (!value) return "";
      value = value.toString();
      return value.charAt(0).toUpperCase() + value.slice(1);
    }
  }
};
</script>
