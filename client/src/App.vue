<template>
  <div id="app">
    <div class="row">
      <div id="sidebar" class="col-md-3 col-sm-0">
        <!-- Sidebar events -->
        <app-sidebar ref="sidebar" @modal="modalClick" @forceReload="forceReload"></app-sidebar>
      </div>
      <div id="home" class="col-md-9 offset-md-3 col-sm-12">
        <!-- Quickbar events -->
        <app-quickbar @mobile="mobileClick" @forceReload="forceReload"></app-quickbar>
        <!-- Toolbar events -->
        <app-toolbar id="toolbar" @forceReload="forceReload"></app-toolbar>
          <p class="offline" v-show="offlineStatus">Application is currently offline!</p>
        <!-- Add reference to home for calling child loadContent component function -->
        <app-home ref="home"></app-home>
      </div>
    </div>
    <!-- Modal events -->
    <app-modal @modal="modalClick" :modal="modal" :input-category="category" :input-feed="feed"></app-modal>
    <!-- Mobile events -->
    <app-mobile :mobile="mobile" @mobile="mobileClick" @modal="modalClick" @refresh="refreshFeeds"></app-mobile>
  </div>
</template>

<style lang="scss">
@import "./assets/scss/global.scss";
</style>

<style>
/* Landscape phones and portrait tablets */
@media (max-width: 766px) {
  #sidebar,
  #toolbar {
    display: none;
  }

  div.col-md-9 {
    padding-right: 0px;
  }

  div#mobile-toolbar {
    position: fixed;
    z-index: 9999;
  }
}

/* Desktop */
@media (min-width: 766px) {
  div#mobile-toolbar {
    display: none;
  }

  #sidebar {
    height: 100%;
    background-color: #e3e3e3;
    overflow-y: auto;
    overflow-x: hidden;
  }

  @media (prefers-color-scheme: dark) {
    #sidebar {
      background-color: #2c2c2c;
    }
  }
}

div.row {
  margin-right: 0px;
}

#sidebar {
  position: fixed;
}

p.offline {
  margin-top: 50px;
  text-align: center;
}

html, #app {
  background-color: #d6d6d6;
}

html, #app, body {
    height: 100%;
}

@media (prefers-color-scheme: dark) {
  html, #app {
    background-color: #121212;
  }

  #home {
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
import axios from 'axios';

//import idb-keyval
import { get, set } from 'idb-keyval';

import Home from "./components/Home.vue";

//import components
import { defineAsyncComponent } from 'vue'
const Sidebar = defineAsyncComponent(() => import(/* webpackChunkName: "sidebar" */ "./components/Sidebar.vue"));
const Toolbar = defineAsyncComponent(() =>  import(/* webpackChunkName: "toolbar" */ "./components/Toolbar.vue"));
const Quickbar = defineAsyncComponent(() =>  import(/* webpackChunkName: "quickbar" */ "./components/Quickbar.vue"));
const Modal = defineAsyncComponent(() =>  import(/* webpackChunkName: "modal" */ "./components/Modal.vue"));
const Mobile = defineAsyncComponent(() =>  import(/* webpackChunkName: "mobile" */ "./components/Mobile.vue"));

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
      store: store,
      notificationStatus: null,
      offlineStatus: false
    };
  },
  created: async function() {
    //reset newUnreads count to zero
    this.store.newUnreads = 0;

    //fetch all category and feed information for an complete overview including total read and unread counts
    this.getOverview(true);

    //Trigger PWA notification support
    if ('Notification' in window && 'serviceWorker' in navigator && 'indexedDB' in window) {

      get('notificationStatus').then((val) => {
        if (val === undefined) {
          //notificationStatus isn't set, thus ask for permissions to install WPA
          Notification.requestPermission(result => {
            if (result !== 'granted') {
              set('notificationStatus', false);
              this.notificationStatus = false;
            } else {
              set('notificationStatus', true);
              this.notificationStatus = true;
            }
          })
        } else {
          //update local data
          this.notificationStatus = val;
        }
      });

      //save reference to 'this', while it's still this!
      var self = this;

      //background update overview every five minutes
      setInterval(function() {
        self.getOverview(false);
      }, 300 * 1000);
    }

    //default body background color to black for dark mode.
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      //This addresses bounce background glitch for devices running safari: https://www.tempertemper.net/blog/scroll-bounce-page-background-colour
      document.body.style.background="#000000";
      document.querySelector('meta[name="theme-color"]').setAttribute('content',  '#000000');
    }
    //default body background color to blue for light mode.
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      document.querySelector('meta[name="theme-color"]').setAttribute('content',  '#31344b');
    }
    //add metadata properties to document
    document.title = "RSSMonster";
    document.head.querySelector("meta[name=viewport]").content = "width=device-width, initial-scale=1";
    document.head.querySelector("meta[http-equiv=X-UA-Compatible]").content = "IE=edge";
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
    },
    getOverview: async function(initial) {
      //get an overview with the count for all feeds
      await axios
        .get(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/manager/overview")
        .then(response => {
          return response;
        })
        .then(response => {
          //set offlineStatus to false
          this.offlineStatus = false;

          //update the store counts
          var previousUnreadCount = this.store.unreadCount;
          this.store.unreadCount = response.data.unreadCount;
          this.store.readCount = response.data.readCount;
          this.store.starCount = response.data.starCount;
          this.store.hotCount = response.data.hotCount;

          //set PWA badge using unread count
          if ('Notification' in window && 'serviceWorker' in navigator && 'indexedDB' in window) {
            navigator.setAppBadge(response.data.unreadCount);
          }

          //update the categories in the store
          this.store.categories = response.data.categories;

          //update newUnreads count, so we could show a message that new content is ready
          if (!initial) {
            this.store.newUnreads = response.data.unreadCount - previousUnreadCount;
          }

          //update local category and feed based on current selection
          if (initial === true) {
            this.updateSelection(this.store.currentSelection);
          } else {
            //only show notification when new messages have arrived (previousUnreadCount is larger than current unreadCount)
            if (previousUnreadCount < response.data.unreadCount) {
              this.showNotification(response.data.unreadCount - previousUnreadCount);
            }
          }
        })
        .catch(error => {
          console.error("There was an error!", error);
          this.offlineStatus = true;
        });
    },
    showNotification: async function (input) {
      if ('serviceWorker' in navigator) {
        if(Notification.permission === 'granted') {
          navigator.serviceWorker.ready // returns a Promise, the active SW registration
            .then(swreg => swreg.showNotification('New articles', {
              body: input + ' new articles arrived',
              icon: '/img/icons/android-icon-192x192.png',
              vibrate: [300, 200, 300]
          }))
        }
      }
    },
    forceReload: function(data) {
      //set newUnreads count back to zero. This removes the notification from the Sidebar.
      this.store.newUnreads = 0;
      //refresh the overview with updated categories and feeds counts
      this.getOverview(true);
      //invoke ref home child component function to reload content
      this.$refs.home.fetchArticleIds(this.store.currentSelection);
    },
    refreshFeeds() {
      //call sidebar refreshFeeds function
      this.$refs.sidebar.refreshFeeds();
    },
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
      },
      deep: true
    },
    "store.currentSelection.feedId": {
      handler: function() {
        this.closeModal();
      },
      deep: true
    },
    "store.currentSelection.filter": {
      handler: function() {
        this.closeModal();
      },
      deep: true
    },
    "store.currentSelection.status": {
      handler: function() {
        this.closeModal();
      },
      deep: true
    },
    "store.unreadCount": {
      handler: function(count) {
        //set PWA badge count
        if ('serviceWorker' in navigator) {
          navigator.setAppBadge(count);
        }
      },
      deep: true
    }
  }
};
</script>
