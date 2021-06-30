<template>
  <div class="feeds-inner">
    <div id="monster">
      <p>RSSMonster</p>
    </div>
    <div class="drag">
      <div @click="markAll()" class="option" id="mark-all-as-read">
        <span class="glyphicon">
          <v-icon name="check-square"/>
        </span>Mark all read
      </div>

      <div @click="refreshFeeds()" class="option" id="refresh">
        <span class="glyphicon">
          <v-icon name="sync"/>
        </span>Refresh feeds
        <span v-show="refreshing">
          <v-icon name="spinner" pulse/>
        </span>
      </div>

      <div @click="emitClickEvent('modal','newfeed')" class="option" id="addnew">
        <span class="glyphicon">
          <v-icon name="plus"/>
        </span>Add new feed
      </div>

      <div>
        <p class="title">All feeds</p>
      </div>
      <div
        v-on:click="loadType('unread')"
        v-bind:class="{ 'selected':  store.currentSelection.status === 'unread' }"
        id="unread"
        class="sidebar-category-top"
      >
        <span class="glyphicon">
          <v-icon name="dot-circle" scale="0.8"/>
        </span>
        <span class="title">Unread</span>
        <span class="badge-unread">
          <span class="badge">{{ this.store.unreadCount }}</span>
        </span>
      </div>
      <div
        v-on:click="loadType('star')"
        v-bind:class="{ 'selected':  store.currentSelection.status === 'star' }"
        id="star"
        class="sidebar-category-top"
      >
        <span class="glyphicon">
          <v-icon name="heart" scale="0.8"/>
        </span>
        <span class="title">Favorites</span>
        <span class="badge-unread">
          <span class="badge">{{ this.store.starCount }}</span>
        </span>
      </div>
      <div
        v-on:click="loadType('hot')"
        v-bind:class="{ 'selected':  store.currentSelection.status === 'hot' }"
        id="hot"
        class="sidebar-category-top"
      >
        <span class="glyphicon">
          <v-icon name="fire" scale="0.8"/>
        </span>
        <span class="title">Hot</span>
        <span class="badge-unread">
          <span class="badge">{{ this.store.hotCount }}</span>
        </span>
      </div>
      <div
        v-on:click="loadType('read')"
        v-bind:class="{ 'selected':  store.currentSelection.status === 'read' }"
        id="read"
        class="sidebar-category-top"
      >
        <span class="glyphicon">
          <v-icon name="circle" scale="0.8"/>
        </span>
        <span class="title">Read</span>
        <span class="badge-unread">
          <span class="badge">{{ this.store.readCount }}</span>
        </span>
      </div>

      <div>
        <p class="title">All</p>
      </div>
      <div
        v-on:click="loadAll()"
        v-bind:class="{ 'selected': store.currentSelection.categoryId === '%' }"
        id="all"
        class="sidebar-category-top"
      >
        <span class="glyphicon">
          <v-icon name="star" scale="0.8"/>
        </span>
        <span class="title">Load all categories</span>
        <span class="badge-unread">
          <span
            v-if="store.currentSelection.status === 'unread'"
            class="badge white"
          >{{ unreadCount }}</span>
          <span v-if="store.currentSelection.status === 'read'" class="badge white">{{ readCount }}</span>
          <span v-if="store.currentSelection.status === 'star'" class="badge white">{{ starCount }}</span>
        </span>
      </div>
      <div>
        <p class="title">Categories</p>
      </div>
      <draggable
        :list="this.store.categories"
        class="dragArea"
        v-bind="{group:{ name:'category', pull:'clone', put:false}}"
        @end="updateSortOrder"
      >
        <div
          class="sidebar-category-main"
          v-bind:class="{ 'selected': (store.currentSelection.categoryId == category.id) && (store.currentSelection.feedId === '%') }"
          v-on:click="loadCategory(category)"
          v-bind:id="category.id"
          v-for="(category, index) in this.store.categories"
          :key="index"
        >
          <div class="sidebar-category-sub">
            <span class="glyphicon">
              <v-icon name="folder" scale="0.8"/>
            </span>
            <span class="title">{{category.name}}</span>
            <span class="badge-unread">
              <span
                v-if="store.currentSelection.status === 'unread'"
                class="badge white"
              >{{ category.unreadCount }}</span>
              <span
                v-if="store.currentSelection.status === 'read'"
                class="badge white"
              >{{ category.readCount }}</span>
              <span
                v-if="store.currentSelection.status === 'star'"
                class="badge white"
              >{{ category.starCount }}</span>
            </span>
          </div>
          <div v-if="category.feeds">
            <div
              v-if="store.currentSelection.categoryId == category.id"
              class="sidebar-category-feeds"
            >
              <div
                class="sidebar-category-feed"
                v-on:click.stop="loadFeed(feed)"
                v-bind:class="{ 'selected': store.currentSelection.feedId == feed.id, 'error': feed.errorCount > 10, last : index === (category.feeds.length-1) }"
                v-bind:id="feed.id"
                v-for="(feed, index) in category.feeds"
                :key="index"
              >
                <span class="glyphicon">
                  <v-icon v-if="!feed.favicon" name="rss-square"/>
                  <img v-if="feed.favicon" :src="feed.favicon" width="16" height="16">
                </span>
                <span class="title">{{feed.feedName}}</span>
                <span class="badge-unread">
                  <span
                    v-if="store.currentSelection.status === 'unread'"
                    class="badge white"
                  >{{ feed.unreadCount }}</span>
                  <span
                    v-if="store.currentSelection.status === 'read'"
                    class="badge white"
                  >{{ feed.readCount }}</span>
                  <span
                    v-if="store.currentSelection.status === 'star'"
                    class="badge white"
                  >{{ feed.starCount }}</span>
                  <span
                    v-if="store.currentSelection.status === 'hot'"
                    class="badge white"
                  >{{ feed.hotCount }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </draggable>
      <div>
        <p class="title">Options</p>
      </div>
      <div class="category-options">
        <div @click="emitClickEvent('modal','newcategory')" id="add" class="category-button">
          <div>
            <v-icon name="plus"/>
            <div class="text">Add</div>
          </div>
        </div>
        <div
          v-if="(store.currentSelection.categoryId !== '%') && (store.currentSelection.feedId == '%')"
          @click="emitClickEvent('modal','deletecategory')"
          id="delete"
          class="category-button"
        >
          <div>
            <v-icon name="trash"/>
            <div class="text">Delete</div>
          </div>
        </div>
        <div
          v-if="(store.currentSelection.categoryId !== '%') && (store.currentSelection.feedId === '%')"
          @click="emitClickEvent('modal','renamecategory')"
          id="rename"
          class="category-button"
        >
          <div>
            <v-icon name="pen"/>
            <div class="text">Edit</div>
          </div>
        </div>
        <div
          v-if="(store.currentSelection.categoryId !== '%') && (store.currentSelection.feedId !== '%')"
          @click="emitClickEvent('modal','deletefeed')"
          id="delete"
          class="category-button"
        >
          <div>
            <v-icon name="trash"/>
            <div class="text">Delete</div>
          </div>
        </div>
        <div
          v-if="(store.currentSelection.categoryId != '%') && (store.currentSelection.feedId != '%')"
          @click="emitClickEvent('modal','renamefeed')"
          id="rename"
          class="category-button"
        >
          <div>
            <v-icon name="pen"/>
            <div class="text">Edit</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
div.drag {
  background-color: transparent;
  color: #fff;
}

.dragArea {
  min-height: 20px;
}

div.sidebar-category-sub,
div.sidebar-category-feed,
div.sidebar-category-top {
  padding: 4px 4px 4px 12px;
}

span.badge.white {
  float: right;
  color: #fff;
  background-color: transparent !important;
  margin-top: 3px;
}

sidebar-category-main {
  width: 100%;
}

span.glyphicon {
  float: left;
  margin-right: 5px;
}

span.title {
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  display: block;
  padding-right: 25px;
}

span.badge-unread {
  float: right;
  position: absolute;
  right: 28px;
  margin-top: -23px;
}

div.sidebar-category-top,
div.sidebar-category-main {
  background-color: #696a7b;
  margin-left: 12px;
  margin-right: 12px;
  margin-top: 4px;
  border-radius: 4px;
  cursor: pointer;
}

div.sidebar-category-feed {
  background-color: #696a7b !important;
}

div.sidebar-category-top.selected,
div.sidebar-category-main.selected,
div.sidebar-category-feed.selected {
  background-color: #464f9e !important;
}

p.title {
  color: #aeb1d4;
  margin-left: 14px;
  margin-top: 10px;
  margin-bottom: 5px;
}

div.option {
  margin-left: 12px;
  padding: 6px;
  color: #fff;
  border-radius: 4px;
  text-indent: 10px;
  margin-bottom: 20px;
  cursor: pointer;
}

div#refresh,
div#addnew,
div#mark-all-as-read {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

div#refresh.option,
div#mark-all-as-read {
  margin-right: 70px;
  min-width: 165px;
}

.sidebar-category-feed.last {
  border-radius: 0px 0px 4px 4px;
}

div#refresh.option {
  background-color: #6f79d3;
}

div#mark-all-as-read {
  background-color: #464f9e;
}

div#addnew.option {
  background-color: #51556a;
  margin-right: 60px;
  min-width: 165px;
}

div#monster {
  background: url(../assets/monster.svg) 14px 30px no-repeat;
  background-size: 30px 30px;
  height: 90px;
}

div#monster p {
  padding: 30px 0px 0px 50px;
  color: #fff;
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

div.category-options {
  margin-bottom: 20px;
  height: 40px;
  width: 105%;
}

div.category-button {
  margin-left: 12px;
  height: 44px;
  color: #fff;
  border-radius: 4px;
  width: 42px;
  float: left;
  text-align: center;
}

div.category-button#add {
  background-color: #6f79d3;
}

div.category-button#delete {
  background-color: #6f79d3;
}

div.category-button#rename {
  background-color: #6f79d3;
}

div.category-button div.text {
  font-size: 12px;
  margin-top: 3px;
}

.sidebar-category-feed.error,
.sidebar-category-feed.selected.error {
  background-color: #bf7c74 !important;
}
</style>

<script>
import draggable from "vuedraggable";
import store from "../store";

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
      this.store.currentSelection.status = status;
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
    markAll: function() {
      this.$http.post("api/articles", {}).then(
        response => {
          if (response.body) {
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
    refreshFeeds: function() {
      //show spinner
      this.refreshing = true;
      this.$http.get("api/crawl", {}).then(
        response => {
          if (response.body) {
            //refresh after one second
            setTimeout(this.refresh, 1000);
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
      this.$http.post("api/manager/updateorder", { order: orderList }).then(
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
