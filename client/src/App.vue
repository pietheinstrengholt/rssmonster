<template>
  <div id="app">
    <div class="row" style="margin-right:0px;">
      <div class="sidebar col-md-3 col-sm-0" style="position:fixed">
        <app-quickbar></app-quickbar>
        <app-sidebar @modal="modalClick"></app-sidebar>
      </div>
      <div class="home col-md-9 offset-md-3 col-sm-12">
        <app-quickbar></app-quickbar>
        <app-home></app-home>
      </div>
    </div>
    <!-- Modal -->
    <app-modal @modal="modalClick" :modal="modal" :feed="feed" :category="category"></app-modal>
  </div>
</template>

<style>
/* Landscape phones and portrait tablets */
@media (max-width: 766px) {
  div.sidebar {
    display: none;
  }

  div.article {
    display: inline-block;
    position: relative;
  }

  div.col-md-9 {
    padding-right: 0px;
  }

  div.main {
    margin-top: 50px;
  }

  .view-toolbar {
    position: fixed;
    z-index: 9999;
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
import Sidebar from "./components/Sidebar.vue";
import Home from "./components/Home.vue";
import Quickbar from "./components/Quickbar.vue";
import Modal from "./components/Modal.vue";
export default {
  components: {
    appSidebar: Sidebar,
    appHome: Home,
    appQuickbar: Quickbar,
    appModal: Modal
  },
  store: {
    data: "data",
    //modal: "modal",
    refreshCategories: "refreshCategories"
  },
  props: {
    //modal: 'test'
  },
  created: function() {
    document.title = "RSSMonster";
    document.head.querySelector("meta[name=viewport]").content =
      "width=device-width, initial-scale=1";
    document.head.querySelector("meta[http-equiv=X-UA-Compatible]").content =
      "IE=edge";
  },
  data() {
    return {
      debug: true,
      domain: "",
      ajaxRequest: false,
      postResults: [],
      error_msg: "",
      category: {},
      feed: {},
      modal: null
    };
  },
  methods: {
    closeModal: function() {
      this.error_msg = "";
      this.$store.modal = false;
    },
    modalClick: function(value) {
      this.modal = value;
      //console.log(this.modal);
    },
    lookupFeedById: function(feedId) {
      for (var x = 0; x < this.$store.categories.length; x++) {
        for (var i = 0; i < this.$store.categories[x].feeds.length; i++) {
          if (this.$store.categories[x].feeds[i].id === feedId) {
            return this.$store.categories[x].feeds[i];
          }
        }
      }
    }
  },
  //watch the store.data.category, update the category name, needed for model input dialog
  watch: {
    "$store.data": {
      handler: function(data) {
        //set the feed to empty when the store changes
        this.feed = {};

        //lookup category name based on the categoryId received
        if (data.category) {
          var category = this.$store.categories.filter(function(a) {
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
    "$store.data.category": {
      handler: function() {
        //TODO: fix closing the modal when adding new feed and changing the category
        //this.closeModal();
        this.feed = {};
      }
    },
    "$store.data.feed": {
      handler: function() {
        this.closeModal();
      }
    },
    "$store.data.filter": {
      handler: function() {
        this.closeModal();
      }
    },
    "$store.data.status": {
      handler: function() {
        this.closeModal();
      }
    }
  }
};
</script>
