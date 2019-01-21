<template>
  <div id="app">
    <div class="row" style="margin-right:0px;">
      <div class="sidebar col-md-3 col-sm-0" style="position:fixed">
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
    <app-mobile :mobile="mobile" @mobile="mobileClick" @modal="modalClick"></app-mobile>
  </div>
</template>

<style>
/* Landscape phones and portrait tablets */
@media (max-width: 766px) {
  .sidebar, .toolbar {
    display: none;
  }

  div.article {
    display: inline-block;
    position: relative;
  }

  div.col-md-9 {
    padding-right: 0px;
  }

  div#main {
    padding-top: 38px;
  }

  div.quickbar {
    position: fixed;
  }
}

/* Desktop */
@media (min-width: 766px) {
  div.home div.quickbar {
    display: none;
  }

  div.quickbar {
    display: none;
  }

  div.sidebar {
    height: 100%;
    background-color: #31344b;
    overflow-y: auto;
  }

  div#articles {
    margin-left: -10px;
    margin-right: -8px;
  }
}

body {
  background-color: #f9f9f9;
}

div#mobile.modal-body ul.categories {
  list-style-type: none;
  text-indent: 4px;
  padding-left: 0px;
}

div#mobile.modal-body li.category {
  background-color: #464f9e;
  border-radius: 4px;
  color: #fff;
  padding: 0px;
  margin-bottom: 2px;
}

button.close span {
  color: #111;
}

button.btn.btn-primary.content {
  margin-right: 7px;
}

span.error {
  color: red;
}
</style>

<script>
import store from './store';

import Sidebar from "./components/Sidebar.vue";
import Home from "./components/Home.vue";
import Toolbar from "./components/Toolbar.vue";
import Quickbar from "./components/Quickbar.vue";
import Modal from "./components/Modal.vue";
import Mobile from "./components/Mobile.vue";
export default {
  components: {
    appSidebar: Sidebar,
    appHome: Home,
    appToolbar: Toolbar,
    appQuickbar: Quickbar,
    appModal: Modal,
    appMobile: Mobile
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

        //update the categories in the store
        this.store.categories = data.categories;
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
  data() {
    return {
      category: {},
      feed: {},
      modal: null,
      mobile: null,
      store: store
    };
  },
  methods: {
    closeModal: function() {
      this.error_msg = "";
      this.modal = false;
    },
    modalClick: function(value) {
      this.modal = value;
      if (value == "newfeed") {
        this.feed = {};
      }
      if (value == "newcategory") {
        this.category = {};
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
    }
  },
  //watch the store.currentSelection, set local data (category, feed) based on current selection
  watch: {
    "store.currentSelection": {
      handler: function(data) {
        //set the feed to empty when the store changes, e.g. change can be that only a category is selected
        this.feed = {};

        //lookup category name based on the categoryId received
        if (data.category) {
          var category = this.store.categories.filter(function(a) {
            return a.id == data.category;
          })[0];
          this.category = category;
        }
        //lookup feed name based on the feedId
        if (data.feed) {
          this.feed = this.lookupFeedById(data.feed);
        }
      },
      deep: true
    },
    "store.currentSelection.category": {
      handler: function() {
        this.feed = {};
      }
    },
    "store.currentSelection.feed": {
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
