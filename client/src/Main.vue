<template>
  <div id="app">
    <div class="row">
      <div id="sidebar" class="col-md-3 col-sm-0">
        <!-- Sidebar events -->
        <app-sidebar ref="sidebar" @forceReload="forceReload"></app-sidebar>
      </div>
      <div id="home" class="col-md-9 offset-md-3 col-sm-12">
        <!-- MobileToolbar events -->
        <app-mobile-toolbar @mobile="mobileClick" @forceReload="forceReload"></app-mobile-toolbar>
        <!-- Toolbar events -->
        <app-toolbar id="toolbar" @forceReload="forceReload"></app-toolbar>
        <p class="offline" v-if="offlineStatus">Application is currently offline!</p>
        <!-- Add reference to home for calling child loadContent component function -->
        <app-home v-if="!offlineStatus && !$store.data.chatAssistantOpen" ref="home" @forceReload="forceReload"></app-home>
        <app-assistant v-if="enableAgent && $store.data.chatAssistantOpen"></app-assistant>
      </div>
    </div>
    <!-- Mobile events -->
    <app-mobile-menu-overlay :mobile="mobile" @mobile="mobileClick" @refresh="refreshFeeds"></app-mobile-menu-overlay>

    <!-- New category modal -->
    <app-new-category v-if="$store.data.getShowModal === 'NewCategory'"></app-new-category>
    <!-- New feed modal -->
    <app-new-feed v-if="$store.data.getShowModal === 'NewFeed'"></app-new-feed>
    <!-- Delete category modal -->
    <app-delete-category v-if="$store.data.getShowModal === 'DeleteCategory'"></app-delete-category>
    <!-- Delete feed modal -->
    <app-delete-feed v-if="$store.data.getShowModal === 'DeleteFeed'"></app-delete-feed>
    <!-- Rename category modal -->
    <app-rename-category v-if="$store.data.getShowModal === 'RenameCategory'"></app-rename-category>
    <!-- Rename feed modal -->
    <app-update-feed v-if="$store.data.getShowModal === 'UpdateFeed'"></app-update-feed>
    <!-- Cleanup modal -->
    <app-cleanup v-if="$store.data.getShowModal === 'Cleanup'"></app-cleanup>
    <!-- Manage users modal -->
    <app-manage-users v-if="$store.data.getShowModal === 'ManageUsers'"></app-manage-users>

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
//import idb-keyval
import { get, set } from 'idb-keyval';

import Home from "./components/Home.vue";

//import components
import { defineAsyncComponent } from 'vue'
const Sidebar = defineAsyncComponent(() => import(/* webpackChunkName: "sidebar" */ "./components/Sidebar.vue"));
const Toolbar = defineAsyncComponent(() =>  import(/* webpackChunkName: "toolbar" */ "./components/Toolbar.vue"));
const MobileToolbar = defineAsyncComponent(() =>  import(/* webpackChunkName: "mobiletoolbar" */ "./components/MobileToolbar.vue"));
const MobileMenuOverlay = defineAsyncComponent(() =>  import(/* webpackChunkName: "mobilemenuoverlay" */ "./components/MobileMenuOverlay.vue"));
const Assistant = defineAsyncComponent(() =>  import(/* webpackChunkName: "assistant" */ "./components/Assistant.vue"));

//import modals
const NewCategory = defineAsyncComponent(() =>  import(/* webpackChunkName: "newcategory" */ "./components/Modal/NewCategory.vue"));
const NewFeed = defineAsyncComponent(() =>  import(/* webpackChunkName: "newfeed" */ "./components/Modal/NewFeed.vue"));
const DeleteCategory = defineAsyncComponent(() =>  import(/* webpackChunkName: "deletecategory" */ "./components/Modal/DeleteCategory.vue"));
const DeleteFeed = defineAsyncComponent(() =>  import(/* webpackChunkName: "deletefeed" */ "./components/Modal/DeleteFeed.vue"));
const RenameCategory = defineAsyncComponent(() =>  import(/* webpackChunkName: "renamecategory" */ "./components/Modal/RenameCategory.vue"));
const UpdateFeed = defineAsyncComponent(() =>  import(/* webpackChunkName: "updatefeed" */ "./components/Modal/UpdateFeed.vue"));
const Cleanup = defineAsyncComponent(() =>  import(/* webpackChunkName: "cleanup" */ "./components/Modal/Cleanup.vue"));
const ManageUsers = defineAsyncComponent(() =>  import(/* webpackChunkName: "manageusers" */ "./components/Modal/ManageUsers.vue"));

export default {
  components: {
    appSidebar: Sidebar,
    appHome: Home,
    appToolbar: Toolbar,
    appMobileToolbar: MobileToolbar,
    appMobileMenuOverlay: MobileMenuOverlay,
    appAssistant: Assistant,
    //import modals
    appNewCategory: NewCategory,
    appNewFeed: NewFeed,
    appDeleteCategory: DeleteCategory,
    appDeleteFeed: DeleteFeed,
    appRenameCategory: RenameCategory,
    appUpdateFeed: UpdateFeed,
    appCleanup: Cleanup,
    appManageUsers: ManageUsers
  },
  data() {
    return {
      category: {},
      feed: {},
      mobile: null,
      notificationStatus: null,
      offlineStatus: false,
      overviewIntervalId: null
    };
  },
  computed: {
    enableAgent() {
      return import.meta.env.VITE_ENABLE_AGENT === 'true';
    }
  },
  async created() {
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
      const self = this;

      //background update overview every five minutes
      this.overviewIntervalId = setInterval(() => {
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
    mobileClick(value) {
      this.mobile = value;
    },
    lookupFeedById(feedId) {
      for (let x = 0; x < this.$store.data.categories.length; x++) {
        for (let i = 0; i < this.$store.data.categories[x].feeds.length; i++) {
          if (this.$store.data.categories[x].feeds[i].id === feedId) {
            return this.$store.data.categories[x].feeds[i];
          }
        }
      }
    },
    lookupCategoryById(categoryId) {
      for (let x = 0; x < this.$store.data.categories.length; x++) {
        if (this.$store.data.categories[x].id === categoryId) {
          return this.$store.data.categories[x];
        }
      }
    },
    updateSelection(data) {
      //only update the local values of some categories exist
      if (this.$store.data.categories.length) {
        //set the feed to empty when the store changes, e.g. change can be that only a category is selected
        this.feed = {};

        //lookup category name based on the categoryId received
        if (data.categoryId) {
          const category = this.$store.data.categories.filter(function(a) {
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
    async getOverview(initial) {
      console.log("Fetching overview from server via store.");
      try {
        const { response, previousUnreadCount } = await this.$store.data.fetchOverview(initial, this.$store.auth.token);
        //set offlineStatus to false
        this.offlineStatus = false;

        //set PWA badge using unread count (keep in Main)
        if ('Notification' in window && 'serviceWorker' in navigator && 'indexedDB' in window) {
          navigator.setAppBadge(response.data.unreadCount);
        }

        //update local selection and notifications (kept in Main)
        if (initial === true) {
          this.updateSelection(this.$store.data.currentSelection);
        } else {
          if (previousUnreadCount < response.data.unreadCount) {
            this.showNotification(response.data.unreadCount - previousUnreadCount);
          }
        }
      } catch (error) {
        console.error("There was an error!", error);
        // Clear the background interval on authentication failure
        if (this.overviewIntervalId) {
          clearInterval(this.overviewIntervalId);
          this.overviewIntervalId = null;
        }
        this.$store.auth.setToken(null);
        this.offlineStatus = true;
      }
    },
    async showNotification(input) {
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
    forceReload() {
      //set unreadsSinceLastUpdate count back to zero. This removes the notification from the Sidebar.
      this.$store.data.unreadsSinceLastUpdate = 0;
      //refresh the overview with updated categories and feeds counts
      this.getOverview(true);
      //invoke ref home child component function to reload content
      this.$refs.home.fetchArticleIds(this.$store.data.currentSelection);
    },
    refreshFeeds() {
      //call sidebar refreshFeeds function
      this.$refs.sidebar.refreshFeeds();
    }
  },
  //watch the store.currentSelection, set local data (category, feed) based on current selection
  watch: {
    "$store.data.currentSelection": {
      handler: function(data) {
        this.updateSelection(data);
      },
      deep: true
    },
    "$store.data.currentSelection.categoryId": {
      handler: function() {
        this.feed = {};
      },
      deep: true
    },
    "$store.data.unreadsSinceLastUpdate": {
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