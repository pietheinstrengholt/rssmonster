<template>
  <div class="feeds-inner">
    <div id="monster">
      <p>RSSMonster</p>
    </div>
    <div class="drag">
      <div>
        <div @click="refreshFeeds()" class="option" id="refresh">
          <span class="glyphicon">
            <v-icon name="sync"/>
          </span>Refresh feeds
          <span v-show="refreshing">
            <v-icon name="spinner" pulse/>
          </span>
        </div>
      </div>
      <div>
        <div @click="emitClickEvent('modal','newfeed')" class="option" id="addnew">
          <span class="glyphicon">
            <v-icon name="plus"/>
          </span>Add new feed
        </div>
      </div>
      <div>
        <p class="title">Current selection</p>
      </div>
      <div
        v-on:click="loadType('unread')"
        v-bind:class="{ 'selected':  $store.data.status === 'unread' }"
        id="unread"
        class="sidebar-category-top"
      >
        <span class="glyphicon">
          <v-icon name="circle" scale="0.8"/>
        </span>
        <span class="title">Unread</span>
        <span class="badge-unread">
          <span class="badge">{{ this.$store.unreadCount }}</span>
        </span>
      </div>
      <div
        v-on:click="loadType('read')"
        v-bind:class="{ 'selected':  $store.data.status === 'read' }"
        id="read"
        class="sidebar-category-top"
      >
        <span class="glyphicon">
          <v-icon name="circle" scale="0.8"/>
        </span>
        <span class="title">Read</span>
        <span class="badge-unread">
          <span class="badge">{{ this.$store.readCount }}</span>
        </span>
      </div>
      <div
        v-on:click="loadType('star')"
        v-bind:class="{ 'selected':  $store.data.status === 'star' }"
        id="star"
        class="sidebar-category-top"
      >
        <span class="glyphicon">
          <v-icon name="heart" scale="0.8"/>
        </span>
        <span class="title">Star</span>
        <span class="badge-unread">
          <span class="badge">{{ this.$store.starCount }}</span>
        </span>
      </div>
      <div>
        <p class="title">All</p>
      </div>
      <div
        v-on:click="loadAll()"
        v-bind:class="{ 'selected':  $store.data.category === null }"
        id="all"
        class="sidebar-category-top"
      >
        <span class="glyphicon">
          <v-icon name="star" scale="0.8"/>
        </span>
        <span class="title">Load all categories</span>
        <span class="badge-unread">
          <span v-if="$store.data.status === 'unread'" class="badge white">{{ unreadCount }}</span>
          <span v-if="$store.data.status === 'read'" class="badge white">{{ readCount }}</span>
          <span v-if="$store.data.status === 'star'" class="badge white">{{ starCount }}</span>
        </span>
      </div>
      <div>
        <p class="title">Categories</p>
      </div>
      <draggable
        :list="this.$store.categories"
        class="dragArea"
        :options="{group:{ name:'category', pull:'clone', put:false}}"
        @end="updateSortOrder"
      >
        <div
          class="sidebar-category-main"
          v-bind:class="{ 'selected': ($store.data.category === category.id) && ($store.data.feed === null) }"
          v-on:click="loadCategory(category)"
          v-bind:id="category.id"
          v-for="(category, index) in this.$store.categories"
          :key="index"
        >
          <div class="sidebar-category-sub">
            <span class="glyphicon">
              <v-icon name="folder" scale="0.8"/>
            </span>
            <span class="title">{{category.name}}</span>
            <span class="badge-unread">
              <span
                v-if="$store.data.status === 'unread'"
                class="badge white"
              >{{ category.unreadCount }}</span>
              <span
                v-if="$store.data.status === 'read'"
                class="badge white"
              >{{ category.readCount }}</span>
              <span
                v-if="$store.data.status === 'star'"
                class="badge white"
              >{{ category.starCount }}</span>
            </span>
          </div>
          <div v-if="category.feeds">
            <div v-if="$store.data.category === category.id" class="sidebar-category-feeds">
              <div
                class="sidebar-category-feed"
                v-on:click.stop="loadFeed(feed)"
                v-bind:class="{ 'selected': $store.data.feed === feed.id }"
                v-bind:id="feed.id"
                v-for="(feed, index) in category.feeds"
                :key="index"
              >
                <span class="glyphicon">
                  <v-icon name="circle"/>
                </span>
                <span class="title">{{feed.feed_name}}</span>
                <span class="badge-unread">
                  <span
                    v-if="$store.data.status === 'unread'"
                    class="badge white"
                  >{{ feed.unreadCount }}</span>
                  <span
                    v-if="$store.data.status === 'read'"
                    class="badge white"
                  >{{ feed.readCount }}</span>
                  <span
                    v-if="$store.data.status === 'star'"
                    class="badge white"
                  >{{ feed.starCount }}</span>
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
          v-if="($store.data.category != null) && ($store.data.feed == null)"
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
          v-if="($store.data.category != null) && ($store.data.feed == null)"
          @click="emitClickEvent('modal','renamecategory')"
          id="rename"
          class="category-button"
        >
          <div>
            <v-icon name="pen"/>
            <div class="text">Name</div>
          </div>
        </div>
        <div
          v-if="($store.data.category != null) && ($store.data.feed != null)"
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
          v-if="($store.data.category != null) && ($store.data.feed != null)"
          @click="emitClickEvent('modal','renamefeed')"
          id="rename"
          class="category-button"
        >
          <div>
            <v-icon name="pen"/>
            <div class="text">Name</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.view-toolbar {
  width: 100%;
  background-color: #31344b;
  display: -webkit-box;
  display: -webkit-flex;
  display: -ms-flexbox;
  display: flex;
  height: 41px;
  border-bottom: 1px solid transparent;
  border-color: #dcdee0;
  position: absolute;
  color: #fff;
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

a#rssmonster.view-button {
  background: url(../assets/monster.svg) 10px 10px no-repeat;
  background-size: 20px 20px;
  max-width: 40px;
  min-width: 40px;
}

a#title.view-button {
  text-align: left;
  margin-left: 10px;
  max-width: 90px;
}

a#unread.view-button,
a#star.view-button,
a#read.view-button {
  border-left: 1px solid transparent;
  border-color: #dcdee0;
  cursor: pointer;
}

.feeds-droppable {
  background-color: #eff1f3;
  position: absolute;
  top: 41px;
  bottom: 0;
  left: 0;
  right: 0;
  overflow-y: auto;
  overflow-x: hidden;
  -webkit-overflow-scrolling: touch;
}

.normal {
  background-color: grey;
}

.drag {
  background-color: #eff1f3;
  width: 100%;
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
  margin-top: -2px;
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

div.drag {
  background-color: transparent;
  color: #fff;
  margin-top: 10px;
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
div#addnew {
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
}

div#refresh.option {
  background-color: #6f79d3;
  margin-right: 70px;
  min-width: 155px;
}

div#addnew.option {
  background-color: #51556a;
  margin-right: 60px;
  min-width: 155px;
}

div#monster {
  background: url(../assets/monster.svg) 14px 30px no-repeat;
  background-size: 30px 30px;
  height: 100px;
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
</style>

<script>
import draggable from "vuedraggable";

export default {
  data() {
    return {
      categoriesOrder: [],
      refreshing: false,
      unreadCount: 0,
      readCount: 0,
      starCount: 0
    };
  },
  store: {
    data: "data",
    categories: "categories"
  },
  components: {
    draggable
  },
  beforeCreate() {
    //get an overview with the count for all feeds
    this.$http
      .get("manager/overview")
      .then(response => {
        return response.json();
      })
      .then(data => {
        //update the store counts
        this.$store.unreadCount = data.unreadCount;
        this.$store.readCount = data.readCount;
        this.$store.starCount = data.starCount;

        //update the categories in the store
        this.$store.categories = data.categories;
      });
  },
  methods: {
    emitClickEvent(eventType, value) {
      this.$emit(eventType, value);
    },
    loadType: function(status) {
      this.$store.data.status = status;
    },
    loadCategory: function(category) {
      this.$store.data.category = category.id;
      this.$store.data.feed = null;
    },
    loadFeed: function(feed) {
      this.$store.data.feed = feed.id;
    },
    loadAll: function() {
      this.$store.data.category = null;
      this.$store.data.feed = null;
    },
    refreshFeeds: function() {
      //show spinner
      this.refreshing = true;
      this.$http.get("crawl", {}).then(
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
      //increase refresh which triggers watcher to refresh the Home
      this.$store.data.refresh++;
      //remove spinner
      this.refreshing = false;
    },
    updateSortOrder() {
      var orderList = new Array();
      for (let i = 0; i < this.$store.categories.length; i++) {
        orderList.push(this.$store.categories[i]["id"]);
      }

      //make ajax request to change categories order
      this.$http.post("manager/updateorder", { order: orderList }).then(
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
      this.$store.composedSum = val;
    }
  },
  computed: {
    orderList() {
      var orderList = new Array();
      this.$store.categories.forEach(function(category) {
        orderList.push(category.id);
      });
      // eslint-disable-next-line
      this.categoriesOrder = orderList;
      return this.categoriesOrder;
    }
  }
};
</script>
