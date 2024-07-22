<template>
  <div class="feeds-inner">
    <div id="monster">
      <p>RSSMonster</p>
    </div>
    <div class="drag">
      <div @click="markAll()" class="option" id="mark-all-as-read">
        <span class="glyphicon">
          <BootstrapIcon icon="check-square-fill" variant="light" />
        </span>Mark all as read
      </div>

      <div @click="refreshFeeds()" class="option" id="refresh">
        <span class="glyphicon">
          <BootstrapIcon icon="arrow-down-square-fill" variant="light" />
        </span>Refresh feeds
        <span v-show="refreshing" class="spin">
          <BootstrapIcon icon="arrow-repeat" variant="light" animation="spin"/>
        </span>
      </div>

      <div @click="emitClickEvent('modal','newfeed')" class="option" id="addnew">
        <span class="glyphicon">
          <BootstrapIcon icon="plus-square-fill" variant="light" />
        </span>Add new feed
      </div>

      <div>
        <p class="title">All feeds</p>
      </div>
      <div v-if="(this.store.newUnreads !== 0)" v-on:click="loadType('refresh')" id="newunreads" class="sidebar-category-top">
        <span class="glyphicon">
          <BootstrapIcon icon="lightbulb-fill" variant="light" />
        </span>
        <span class="title">Click to refresh!</span>
        <span class="badge-unread">
          <span class="badge">{{ this.store.newUnreads }}</span>
        </span>
      </div>
      <div v-bind:class="{ 'selected': store.currentSelection.status === 'unread' }" v-on:click="loadType('unread')" id="unread" class="sidebar-category-top">
        <span class="glyphicon">
          <BootstrapIcon icon="record-circle-fill" variant="light" />
        </span>
        <span class="title">Unread</span>
        <span class="badge-unread">
          <span class="badge">{{ this.store.unreadCount }}</span>
        </span>
      </div>
      <div v-bind:class="{ 'selected': store.currentSelection.status === 'star' }" v-on:click="loadType('star')" id="star" class="sidebar-category-top">
        <span class="glyphicon">
          <BootstrapIcon icon="heart-fill" variant="light" />
        </span>
        <span class="title">Favorites</span>
        <span class="badge-unread">
          <span class="badge">{{ this.store.starCount }}</span>
        </span>
      </div>
      <div v-bind:class="{ 'selected': store.currentSelection.status === 'hot' }" v-on:click="loadType('hot')" id="hot" class="sidebar-category-top">
        <span class="glyphicon">
          <BootstrapIcon icon="fire" variant="light" />
        </span>
        <span class="title">Hot</span>
        <span class="badge-unread">
          <span class="badge">{{ this.store.hotCount }}</span>
        </span>
      </div>
      <div v-bind:class="{ 'selected': store.currentSelection.status === 'read' }" v-on:click="loadType('read')" id="read" class="sidebar-category-top">
        <span class="glyphicon">
          <BootstrapIcon icon="check-circle-fill" variant="light" />
        </span>
        <span class="title">Read</span>
        <span class="badge-unread">
          <span class="badge">{{ this.store.readCount }}</span>
        </span>
      </div>

      <div>
        <p class="title">All</p>
      </div>
      <div v-bind:class="{ 'selected': store.currentSelection.categoryId === '%' }" v-on:click="loadAll()" id="all" class="sidebar-category-top">
        <span class="glyphicon">
          <BootstrapIcon icon="star-fill" variant="light" />
        </span>
        <span class="title">Load all categories</span>
        <span class="badge-unread">
          <span v-if="store.currentSelection.status === 'unread'" class="badge white">{{ unreadCount }}</span>
          <span v-if="store.currentSelection.status === 'read'" class="badge white">{{ readCount }}</span>
          <span v-if="store.currentSelection.status === 'star'" class="badge white">{{ starCount }}</span>
          <span v-if="store.currentSelection.status === 'hot'" class="badge white">{{ hotCount }}</span>
        </span>
      </div>
      <div>
        <p v-if="store.currentSelection.status != 'hot'" class="title">Categories</p>
      </div>
      <draggable v-model="this.store.categories" item-key="id" @end="updateSortOrder">
        <template #item="{element}">
          <div v-bind:class="{ 'selected': (store.currentSelection.categoryId == element.id) && (store.currentSelection.feedId === '%') }" v-bind:id="element.id" class="sidebar-category-main" v-on:click="loadCategory(element)">
          <div class="sidebar-category-sub">
            <span class="glyphicon">
              <BootstrapIcon icon="folder-fill" variant="light" />
            </span>
            <span class="title">{{element.name}}</span>
            <span class="badge-unread">
              <span
                v-if="store.currentSelection.status === 'unread'" class="badge white">{{ element.unreadCount }}</span>
              <span
                v-if="store.currentSelection.status === 'read'" class="badge white">{{ element.readCount }}</span>
              <span
                v-if="store.currentSelection.status === 'star'" class="badge white">{{ element.starCount }}</span>
            </span>
          </div>
          <div v-if="element.feeds">
            <div v-if="store.currentSelection.categoryId == element.id" class="sidebar-category-feeds">
              <div v-for="(feed, index) in element.feeds" v-bind:key="index">
                <div class="sidebar-category-feed" v-on:click.stop="loadFeed(feed)" v-bind:class="{ 'selected': store.currentSelection.feedId == feed.id, 'error': feed.errorCount > 10, last : index === (element.feeds.length-1) }" v-bind:id="feed.id">
                  <span class="glyphicon">
                    <img v-if="feed.favicon" :src="feed.favicon" width="16" height="16">
                    <BootstrapIcon v-if="!feed.favicon" icon="rss-fill" variant="light" />
                  </span>
                  <span class="title">{{feed.feedName}}</span>
                  <span class="badge-unread">
                  <span v-if="store.currentSelection.status === 'unread'" class="badge white">{{ feed.unreadCount }}</span>
                  <span v-if="store.currentSelection.status === 'read'" class="badge white">{{ feed.readCount }}</span>
                  <span v-if="store.currentSelection.status === 'star'" class="badge white">{{ feed.starCount }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        </template>
      </draggable>

      <div class="category-options">
        <div @click="emitClickEvent('modal','newcategory')" id="add" class="category-button">
          <div>
            <BootstrapIcon icon="plus-square-fill" color="3b4651" />
            <div class="text">Add</div>
          </div>
        </div>
        <div v-if="(store.currentSelection.categoryId === '%') && (store.currentSelection.feedId == '%')">
          <div @click="emitClickEvent('modal','cleanup')" id="cleanup" class="category-button">
            <BootstrapIcon icon="eraser-fill" color="3b4651" />
            <div class="text">Cleanup</div>
          </div>
        </div>
        <div v-if="(store.currentSelection.categoryId !== '%') && (store.currentSelection.feedId == '%')" @click="emitClickEvent('modal','deletecategory')" id="delete" class="category-button">
          <div>
            <BootstrapIcon icon="trash3-fill" color="3b4651" />
            <div class="text">Delete</div>
          </div>
        </div>
        <div v-if="(store.currentSelection.categoryId !== '%') && (store.currentSelection.feedId === '%')" @click="emitClickEvent('modal','renamecategory')" id="rename" class="category-button">
          <div>
            <BootstrapIcon icon="pencil-fill" color="3b4651" />
            <div class="text">Edit</div>
          </div>
        </div>
        <div v-if="(store.currentSelection.categoryId !== '%') && (store.currentSelection.feedId !== '%')" @click="emitClickEvent('modal','deletefeed')" id="delete" class="category-button">
          <div>
            <BootstrapIcon icon="trash3-fill" color="3b4651" />
            <div class="text">Delete</div>
          </div>
        </div>
        <div v-if="(store.currentSelection.categoryId != '%') && (store.currentSelection.feedId != '%')" @click="emitClickEvent('modal','renamefeed')" id="rename" class="category-button">
          <div>
            <BootstrapIcon icon="pencil-fill" color="3b4651" />
            <div class="text">Edit</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drag {
  background-color: transparent;
  color: #fff;
}

.dragArea {
  min-height: 20px;
}

.sidebar-category-sub,
.sidebar-category-feed,
.sidebar-category-top {
  padding: 4px 4px 4px 12px;
}

#refresh.option, #addnew.option {
  background-color: #2b79c2;
}

#mark-all-as-read {
  background-color: #3b4651;
}

.badge.white {
  float: right;
  color: #fff;
  background-color: transparent;
  margin-top: 2px;
}

.glyphicon {
  float: left;
  margin-right: 5px;
  min-width: 13px;
}

.title {
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  display: block;
  padding-right: 25px;
}

.badge-unread {
  float: right;
  position: absolute;
  right: 28px;
  margin-top: -25px;
}

.sidebar-category-top,
.sidebar-category-main {
  margin-left: 12px;
  margin-right: 12px;
  margin-top: 4px;
  border-radius: 4px;
  cursor: pointer;
}

#newunreads.sidebar-category-top {
	background-color: #536f5b;
}

.sidebar-category-feed,
.sidebar-category-top,
.sidebar-category-main {
  background-color: #9f9f9f;
}

.sidebar-category-top.selected,
.sidebar-category-main.selected,
.sidebar-category-feed.selected {
  background-color: #3b4651;
}

p.title {
  color: #111;
  margin-left: 14px;
  margin-top: 10px;
  margin-bottom: 5px;
}

div.option {
  margin-left: 12px;
  padding: 6px;
  color: #fff;
  border-radius: 4px;
  text-indent: 4px;
  margin-bottom: 20px;
  cursor: pointer;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

.sidebar-category-feed.last {
  border-radius: 0px 0px 4px 4px;
}

#refresh.option,
#mark-all-as-read {
  margin-right: 70px;
  min-width: 165px;
}

#addnew.option {
  margin-right: 60px;
  min-width: 165px;
}

#monster {
  background: url('../assets/images/monster.png') 14px 30px no-repeat;
  background-size: 30px 30px;
  height: 90px;
}

#monster p {
  padding: 30px 0px 0px 50px;
  color: #111;
  font-size: 20px;
}

::-webkit-scrollbar {
  width: 6px; /* for vertical scrollbars */
  height: 6px; /* for horizontal scrollbars */
}

::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.1);
}

::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.5);
}

.category-options {
  margin-top: 10px;
  margin-bottom: 20px;
  height: 40px;
  width: 105%;
}

.category-button {
  margin-left: 8%;
  height: 44px;
  color: #111;
  border-radius: 4px;
  width: 42px;
  float: left;
  text-align: center;
}

.category-button .text {
  font-size: 13px;
}

.sidebar-category-feed.error,
.sidebar-category-feed.selected.error {
  background-color: #bf7c74;
}

@media (prefers-color-scheme: dark) {
  .category-button {
    background-color: #464646;
  }

  .option {
    background-color: #535353;
  }

  #mark-all-as-read {
    background-color: #606060;
  }
  p.title {
    color: #fff;
  }
  #monster {
    background: url('../assets/images/monster-dark.png') 14px 30px no-repeat;
    background-size: 30px 30px;
    height: 90px;
  }
  #monster p {
    color: #fff;
  }
  .category-button {
    color: #fff;
    background-color: #2c2c2c;
  }
  .category-options svg {
    fill: #fff;
  }
}
</style>

<script>
import draggable from "vuedraggable";
import store from "../store";
import axios from 'axios';

export default {
  data() {
    return {
      store: store,
      categoriesOrder: [],
      refreshing: false,
      unreadCount: 0,
      readCount: 0,
      starCount: 0,
      hotCount: 0
    };
  },
  components: {
    draggable
  },
  methods: {
    emitClickEvent(eventType, value) {
      this.$emit(eventType, value);
    },
    loadType: function(status) {
      //if user selects current selection or clicks refresh, then do a forceReload by emitting an event to parent
      if (status == this.store.currentSelection.status || status == "refresh") {
        this.$emit('forceReload');
      } else {
        this.store.currentSelection.status = status;
      }
    },
    loadCategory: function(category) {
      this.store.currentSelection.categoryId = category.id;
      this.store.currentSelection.feedId = "%";
    },
    loadFeed: function(feed) {
      this.store.currentSelection.feedId = feed.id;
    },
    loadAll: function() {
      this.store.currentSelection.categoryId = "%";
      this.store.currentSelection.feedId = "%";
    },
    markAll: async function() {
      await axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/articles", {}).then(
        response => {
          if (response.data) {
            //refresh after one second
            setTimeout(function() {
              location.reload();
            }, 1000);
          }
        },
        response => {
          /* eslint-disable no-console */
          console.log("oops something went wrong", response);
          /* eslint-enable no-console */
        }
      );
    },
    refreshFeeds: async function() {
      //show spinner
      this.refreshing = true;
      await axios.get(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/crawl", {}).then(
        response => {
          if (response.data) {
            //refresh after one second
            setTimeout(this.refresh, 2000);
          }
        },
        response => {
          //remove spinner
          this.refreshing = false;
          /* eslint-disable no-console */
          console.log("oops something went wrong", response);
          /* eslint-enable no-console */
        }
      );
    },
    refresh() {
      //remove spinner
      this.refreshing = false;
    },
    updateSortOrder() {
      var orderList = new Array();
      for (let i = 0; i < this.store.categories.length; i++) {
        orderList.push(this.store.categories[i]["id"]);
      }

      //make ajax request to change categories order
      axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/manager/updateorder", { order: orderList }).then(
        response => {
          //get status & status text
          /* eslint-disable no-console */
          console.log(response.status);
          /* eslint-enable no-console */
        },
        response => {
          /* eslint-disable no-console */
          console.log("oops something went wrong", response);
          /* eslint-enable no-console */
        }
      );
    }
  },
  //watch the refreshCategories, when changing, reload the categories
  watch: {
    composedSum: function(val) {
      this.store.composedSum = val;
    }
  },
  computed: {
    orderList() {
      var orderList = new Array();
      this.store.categories.forEach(function(category) {
        orderList.push(category.id);
      });
      // eslint-disable-next-line
      this.categoriesOrder = orderList;
      return this.categoriesOrder;
    }
  }
};
</script>
