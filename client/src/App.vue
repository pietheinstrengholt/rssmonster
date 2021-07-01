<template>
  <div id="app">
    <div class="row">
      <div class="sidebar col-md-3 col-sm-0">
        <app-sidebar @modal="modalClick"></app-sidebar>
      </div>
      <div class="home col-md-9 offset-md-3 col-sm-12">
        <app-quickbar @mobile="mobileClick"></app-quickbar>
        <app-toolbar class="toolbar"></app-toolbar>
        <app-home></app-home>
      </div>
    </div>
    <!-- Modal -->
    <app-modal @modal="modalClick" :modal="modal" :input-category="category" :input-feed="feed"></app-modal>
    <!-- Mobile Pop-up -->
    <app-mobile :mobile="mobile" @mobile="mobileClick" @modal="modalClick"></app-mobile>
  </div>
</template>

<style>
/* Landscape phones and portrait tablets */
@media (max-width: 766px) {
  div.sidebar,
  div.toolbar {
    display: none;
  }

  div.col-md-9 {
    padding-right: 0px;
  }

  div.quickbar {
    position: fixed;
    z-index: 9999;
  }
}

/* Desktop */
@media (min-width: 766px) {
  div.quickbar {
    display: none;
  }

  div.sidebar {
    height: 100%;
    background-color: #31344b;
    overflow-y: auto;
    overflow-x: hidden;
  }

  @media (prefers-color-scheme: dark) {
    div.sidebar {
      background-color: #2c2c2c;
    }
  }
}

div.row {
  margin-right: 0px;
}

div.sidebar {
  position: fixed;
}

body {
  background-color: #f9f9f9;
}

@media (prefers-color-scheme: dark) {
  body {
    background-color: #121212;
  }

  div.home {
    background: black;
  }

  img {
    filter: brightness(.8) contrast(1.2);
  }

  body svg.icon path {
    fill: #efefef;
  }

  a:visited, a:active, a:link {
    color: #18bc9c;
  }
}
</style>

<script>
import store from "./store";

import Home from "./components/Home.vue";
const Sidebar = () =>
  import(/* webpackChunkName: "sidebar" */ "./components/Sidebar.vue");
const Toolbar = () =>
  import(/* webpackChunkName: "toolbar" */ "./components/Toolbar.vue");
const Quickbar = () =>
  import(/* webpackChunkName: "quickbar" */ "./components/Quickbar.vue");
const Modal = () =>
  import(/* webpackChunkName: "modal" */ "./components/Modal.vue");
const Mobile = () =>
  import(/* webpackChunkName: "mobile" */ "./components/Mobile.vue");
export default {
  components: {
    appSidebar: Sidebar,
    appHome: Home,
    appToolbar: Toolbar,
    appQuickbar: Quickbar,
    appModal: Modal,
    appMobile: Mobile
  },
  data() {
    return {
      category: {},
      feed: {},
      modal: false,
      mobile: null,
      store: store
    };
  },
  beforeCreate() {
    //get an overview with the count for all feeds
    this.$http
      .get("api/manager/overview")
      .then(response => {
        return response.json();
      })
      .then(data => {
        //update the store counts
        this.store.unreadCount = data.unreadCount;
        this.store.readCount = data.readCount;
        this.store.starCount = data.starCount;
        this.store.hotCount = data.hotCount;

        //update the categories in the store
        this.store.categories = data.categories;

        //update local category and feed based on current selection
        this.updateSelection(this.store.currentSelection);
      });
  },
  created: function() {
    //add metadata properties to document
    document.title = "RSSMonster";
    document.head.querySelector("meta[name=viewport]").content =
      "width=device-width, initial-scale=1";
    document.head.querySelector("meta[http-equiv=X-UA-Compatible]").content =
      "IE=edge";
  },
  methods: {
    closeModal: function() {
      this.error_msg = "";
      this.store.showModal = false;
    },
    modalClick: function(value) {
      this.store.showModal = value;
      if (value == "newfeed") {
        this.feed = {};
      }
      if (value == "newcategory") {
        this.category = {};
      }
      if (value == "renamefeed") {
        this.feed = this.lookupFeedById(
          parseInt(this.store.currentSelection.feedId)
        );
      }
      if (value == "renamecategory") {
        this.category = this.lookupCategoryById(
          parseInt(this.store.currentSelection.categoryId)
        );
      }
    },
    mobileClick: function(value) {
      this.mobile = value;
    },
    lookupFeedById: function(feedId) {
      for (var x = 0; x < this.store.categories.length; x++) {
        for (var i = 0; i < this.store.categories[x].feeds.length; i++) {
          if (this.store.categories[x].feeds[i].id === feedId) {
            return this.store.categories[x].feeds[i];
          }
        }
      }
    },
    lookupCategoryById: function(categoryId) {
      for (var x = 0; x < this.store.categories.length; x++) {
        if (this.store.categories[x].id === categoryId) {
          return this.store.categories[x];
        }
      }
    },
    updateSelection: function(data) {
      //only update the local values of some categories exist
      if (this.store.categories.length) {
        //set the feed to empty when the store changes, e.g. change can be that only a category is selected
        this.feed = {};

        //lookup category name based on the categoryId received
        if (data.categoryId) {
          var category = this.store.categories.filter(function(a) {
            return a.id == data.categoryId;
          })[0];
          this.category = category;
        }
        //lookup feed name based on the feedId
        if (data.feedId) {
          this.feed = this.lookupFeedById(data.feedId);
        }
      }
    }
  },
  //watch the store.currentSelection, set local data (category, feed) based on current selection
  watch: {
    "store.currentSelection": {
      handler: function(data) {
        this.updateSelection(data);
      },
      deep: true
    },
    "store.currentSelection.categoryId": {
      handler: function() {
        this.feed = {};
      }
    },
    "store.currentSelection.feedId": {
      handler: function() {
        this.closeModal();
      }
    },
    "store.currentSelection.filter": {
      handler: function() {
        this.closeModal();
      }
    },
    "store.currentSelection.status": {
      handler: function() {
        this.closeModal();
      }
    }
  }
};
</script>
