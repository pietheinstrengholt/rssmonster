<template>
  <div id="monster">
    <p>RSSMonster</p>
  </div>
  <div class="drag">

    <div class="option" v-if="$store.auth.getRole === 'admin'" @click="$store.data.setShowModal('ManageUsers')" id="manage-users">
      <span class="glyphicon">
        <BootstrapIcon icon="people-fill" variant="light" />
      </span>Manage users
    </div>

    <div @click="refreshFeeds()" class="option" id="refresh">
      <span class="glyphicon">
        <BootstrapIcon icon="arrow-down-circle-fill" variant="light" />
      </span>Refresh feeds
      <span v-show="refreshing" class="spin">
        <BootstrapIcon icon="arrow-repeat" variant="light" animation="spin"/>
      </span>
    </div>

    <div class="option" @click="$store.data.setShowModal('NewFeed')" id="addnew">
      <span class="glyphicon">
        <BootstrapIcon icon="plus-square-fill" variant="light" />
      </span>Add new feed
    </div>

    <div @click="markAsRead($store.data.currentSelection)" class="option" id="mark-as-read">
      <span class="glyphicon">
        <BootstrapIcon icon="check-square-fill" variant="light" />
      </span>Mark as read
    </div>

    <div v-if="$store.data.smartFolders.length" class="title-box">
      <p class="title">Smart Folders</p>
    </div>
    <div
      v-for="(smartFolder, index) in $store.data.smartFolders"
      :key="index"
      class="category-top tag-item"
      :class="{ selected: $store.data.currentSelection.smartFolderId === smartFolder.id }"
      @click="selectSmartFolder(smartFolder)">
      <span class="glyphicon">
        <BootstrapIcon icon="tag-fill" variant="light" />
      </span>
      <span class="title">{{ smartFolder.name }}</span>
      <span class="badge-unread">
        <span class="badge">{{ smartFolder.ArticleCount }}</span>
      </span>
    </div>

    <div class="title-box">
      <p class="title">All feeds</p>
    </div>
    <div v-if="($store.data.unreadsSinceLastUpdate > 0)" v-on:click="loadType('refresh')" id="unreadsSinceLastUpdate" class="category-top">
      <span class="glyphicon">
        <BootstrapIcon icon="lightbulb-fill" variant="light" />
      </span>
      <span class="title">Click to refresh!</span>
      <span class="badge-unread">
        <span class="badge">{{ $store.data.unreadsSinceLastUpdate }}</span>
      </span>
    </div>
    <div v-bind:class="{ 'selected': $store.data.currentSelection.status === 'unread' && $store.data.currentSelection.smartFolderId === null }" v-on:click="loadType('unread')" id="unread" class="category-top">
      <span class="glyphicon">
        <BootstrapIcon icon="record-circle-fill" variant="light" />
      </span>
      <span class="title">Unread</span>
      <span class="badge-unread">
        <span class="badge">{{ $store.data.unreadCount }}</span>
      </span>
    </div>
    <div v-bind:class="{ 'selected': $store.data.currentSelection.status === 'star' && $store.data.currentSelection.smartFolderId === null  }" v-on:click="loadType('star')" id="star" class="category-top">
      <span class="glyphicon">
        <BootstrapIcon icon="heart-fill" variant="light" />
      </span>
      <span class="title">Favorites</span>
      <span class="badge-unread">
        <span class="badge">{{ $store.data.starCount }}</span>
      </span>
    </div>
    <div v-bind:class="{ 'selected': $store.data.currentSelection.status === 'hot' && $store.data.currentSelection.smartFolderId === null  }" v-on:click="loadType('hot')" id="hot" class="category-top">
      <span class="glyphicon">
        <BootstrapIcon icon="fire" variant="light" />
      </span>
      <span class="title">Hot</span>
      <span class="badge-unread">
        <span class="badge">{{ $store.data.hotCount }}</span>
      </span>
    </div>
    <div v-bind:class="{ 'selected': $store.data.currentSelection.status === 'clicked' && $store.data.currentSelection.smartFolderId === null  }" v-on:click="loadType('clicked')" id="clicked" class="category-top">
      <span class="glyphicon">
        <BootstrapIcon icon="bookmark-fill" variant="light" />
      </span>
      <span class="title">Clicked</span>
      <span class="badge-unread">
        <span class="badge">{{ $store.data.clickedCount }}</span>
      </span>
    </div>
    <div v-bind:class="{ 'selected': $store.data.currentSelection.status === 'read' && $store.data.currentSelection.smartFolderId === null  }" v-on:click="loadType('read')" id="read" class="category-top">
      <span class="glyphicon">
        <BootstrapIcon icon="check-circle-fill" variant="light" />
      </span>
      <span class="title">Read</span>
      <span class="badge-unread">
        <span class="badge">{{ $store.data.readCount }}</span>
      </span>
    </div>

    <div v-if="topTags.length" class="title-box">
      <p class="title">Top tags</p>
    </div>
    <div
      v-for="(tag, index) in topTagsDisplay"
      :key="index"
      class="category-top tag-item"
      :class="{ selected: $store.data.currentSelection.tag === tag.name }"
      @click="selectTag(tag.name)">
      <span class="glyphicon">
        <BootstrapIcon icon="tag-fill" variant="light" />
      </span>
      <span class="title">{{ tag.name }}</span>
      <span class="badge-unread">
        <span class="badge">{{ tag.count }}</span>
      </span>
    </div>

    <div v-if="$store.data.currentSelection.status != 'hot'">

      <div class="title-box">
        <p class="title">All</p>
      </div>
      <div v-bind:class="{ 'selected': $store.data.currentSelection.categoryId === '%' }" v-on:click="loadAll()" id="all" class="category-top">
        <span class="glyphicon">
          <BootstrapIcon icon="star-fill" variant="light" />
        </span>
        <span class="title">Load all categories</span>
        <span class="badge-unread">
          <span v-if="$store.data.currentSelection.status === 'unread'" class="badge white">{{ $store.data.unreadCount }}</span>
          <span v-if="$store.data.currentSelection.status === 'read'" class="badge white">{{ $store.data.readCount }}</span>
          <span v-if="$store.data.currentSelection.status === 'star'" class="badge white">{{ $store.data.starCount }}</span>
          <span v-if="$store.data.currentSelection.status === 'hot'" class="badge white">{{ $store.data.hotCount }}</span>
          <span v-if="$store.data.currentSelection.status === 'clicked'" class="badge white">{{ $store.data.clickedCount }}</span>
        </span>
      </div>

      <div class="title-box">
        <p class="title">Categories</p>
      </div>
      <draggable v-model="this.$store.data.categories" item-key="id" @end="updateSortOrder">
        <template #item="{element}">
          <div v-bind:class="{ 'selected': ($store.data.currentSelection.categoryId == element.id) && ($store.data.currentSelection.feedId === '%') }" v-bind:id="element.id" class="category-main" v-on:click="loadCategory(element)">
          <div class="category-sub">
            <span class="glyphicon">
              <BootstrapIcon icon="folder-fill" variant="light" />
            </span>
            <span class="title">{{element.name}}</span>
            <span class="badge-unread">
              <span
                v-if="$store.data.currentSelection.status === 'unread'" class="badge white">{{ element.unreadCount }}</span>
              <span
                v-if="$store.data.currentSelection.status === 'read'" class="badge white">{{ element.readCount }}</span>
              <span
                v-if="$store.data.currentSelection.status === 'star'" class="badge white">{{ element.starCount }}</span>
              <span
                v-if="$store.data.currentSelection.status === 'clicked'" class="badge white">{{ element.clickedCount }}</span>
            </span>
          </div>
          <div v-if="element.feeds">
            <div v-if="$store.data.currentSelection.categoryId == element.id" class="category-feeds">
              <div v-for="(feed, index) in element.feeds" v-bind:key="index">
                <div class="category-feed" v-on:click.stop="loadFeed(feed)" v-bind:class="{ 'selected': $store.data.currentSelection.feedId == feed.id, 'error': feed.status == 'error', 'disabled': feed.status == 'disabled', last : index === (element.feeds.length-1) }" v-bind:id="feed.id">
                  <span class="glyphicon">
                    <img v-if="feed.favicon" :src="feed.favicon" width="16" height="16">
                    <BootstrapIcon v-if="!feed.favicon" icon="rss-fill" variant="light" />
                  </span>
                  <span class="title">{{feed.feedName}}</span>
                  <span class="badge-unread">
                  <span v-if="$store.data.currentSelection.status === 'unread'" class="badge white">{{ feed.unreadCount }}</span>
                  <span v-if="$store.data.currentSelection.status === 'read'" class="badge white">{{ feed.readCount }}</span>
                  <span v-if="$store.data.currentSelection.status === 'star'" class="badge white">{{ feed.starCount }}</span>
                  <span v-if="$store.data.currentSelection.status === 'clicked'" class="badge white">{{ feed.clickedCount }}</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        </template>
      </draggable>

      <div class="sidebar-options">
        <div id="add" class="sidebar-option" @click="$store.data.setShowModal('NewCategory')">
          <div>
            <BootstrapIcon icon="plus-circle-fill" color="3b4651" />
            <div class="text">Add</div>
          </div>
        </div>
        <div v-if="($store.data.currentSelection.categoryId === '%') && ($store.data.currentSelection.feedId == '%')">
          <div id="cleanup" class="sidebar-option" @click="$store.data.setShowModal('Cleanup')">
            <BootstrapIcon icon="eraser-fill" color="3b4651" />
            <div class="text">Cleanup</div>
          </div>
          <div @click="logout()" id="logout" class="sidebar-option">
            <BootstrapIcon icon="box-arrow-right" color="3b4651" />
            <div class="text">Logout</div>
          </div>
        </div>
        <div v-if="($store.data.currentSelection.categoryId !== '%') && ($store.data.currentSelection.feedId == '%')" @click="$store.data.setShowModal('DeleteCategory')" id="delete" class="sidebar-option">
          <div>
            <BootstrapIcon icon="trash3-fill" color="3b4651" />
            <div class="text">Delete</div>
          </div>
        </div>
        <div v-if="($store.data.currentSelection.categoryId !== '%') && ($store.data.currentSelection.feedId === '%')" @click="$store.data.setShowModal('RenameCategory')" id="rename" class="sidebar-option">
          <div>
            <BootstrapIcon icon="pencil-fill" color="3b4651" />
            <div class="text">Edit</div>
          </div>
        </div>
        <div v-if="($store.data.currentSelection.categoryId !== '%') && ($store.data.currentSelection.feedId !== '%')" @click="$store.data.setShowModal('DeleteFeed')" id="delete" class="sidebar-option">
          <div>
            <BootstrapIcon icon="trash3-fill" color="3b4651" />
            <div class="text">Delete</div>
          </div>
        </div>
        <div v-if="($store.data.currentSelection.categoryId != '%') && ($store.data.currentSelection.feedId != '%')" @click="$store.data.setShowModal('UpdateFeed')" id="rename" class="sidebar-option">
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

.category-sub,
.category-feed,
.category-top {
  padding: 4px 4px 4px 12px;
}

#refresh.option, 
#addnew.option,
#manage-users.option,
#mark-as-read {
  background-color: #2b79c2;
  width: 170px;
}

#mark-as-read {
  background-color: #3b4651;
}

.badge.white {
  float: right;
  color: #fff;
  background-color: transparent;
  margin-top: 3px;
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

.category-top,
.category-main {
  margin-left: 12px;
  margin-right: 12px;
  margin-top: 4px;
  border-radius: 4px;
  cursor: pointer;
}

#unreadsSinceLastUpdate.category-top {
	background-color: #DB2B39;
}

.category-feed,
.category-top,
.category-main {
  background-color: #9f9f9f;
}

.category-top.selected,
.category-main.selected,
.category-feed.selected {
  background-color: #3b4651;
}

.tag-item {
  background-color: #8b8b8b;
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

.category-feed.last {
  border-radius: 0px 0px 4px 4px;
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

.sidebar-options {
  margin-top: 10px;
  margin-bottom: 20px;
  height: 40px;
  width: 105%;
}

.sidebar-option {
  margin-left: 8%;
  height: 44px;
  color: #111;
  border-radius: 4px;
  width: 42px;
  float: left;
  text-align: center;
  cursor: pointer;
}

.sidebar-option .text {
  font-size: 13px;
}

.category-feed.error,
.category-feed.selected.error {
  background-color: #bf7c74;
}

.category-feed.disabled {
  background-color: #b0b0b0;
}

.category-feed.disabled .title {
  color: #d3d3d3;
}

.category-feed.selected.disabled {
  background-color: #606060;
}

.category-feed.selected.disabled .title {
  color: #b0b0b0;
}

@media (prefers-color-scheme: dark) {
  .sidebar-option {
    background-color: #464646;
  }

  .option {
    background-color: #535353;
  }

  #mark-as-read {
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
  .sidebar-option {
    color: #fff;
    background-color: #2c2c2c;
  }
  .sidebar-options svg {
    fill: #fff;
  }
}
</style>

<script>
import draggable from "vuedraggable";
import axios from 'axios';
import Cookies from 'js-cookie';

export default {
  emits: ['forceReload'],
  data() {
    return {
      categoriesOrder: [],
      refreshing: false,
      unreadCount: 0,
      readCount: 0,
      starCount: 0,
      hotCount: 0,
      topTags: []
    };
  },
  async created() {
    axios.defaults.headers.common['Authorization'] = `Bearer ${this.$store.auth.token}`;
    this.fetchTopTags();
    await this.$store.data.fetchSmartFolders();
  },
  components: {
    draggable
  },
  methods: {
    logout() {
      //remove token from store which triggers App.vue to show login
      this.$store.auth.setToken(null);
      this.$store.auth.setRole(null);
      // Remove cookie to complete logout
      Cookies.remove('token');
    },
    emitClickEvent(eventType, value) {
      this.$emit(eventType, value);
    },
    loadType: function(status) {
      //if user selects current selection or clicks refresh, then do a forceReload by emitting an event to parent
      if (status == "refresh") {
        this.$store.data.setSmartFolder(null);
        this.$emit('forceReload');
      } else if (status !== this.$store.data.getSelectedStatus) {
        this.$store.data.setSelectedStatus(status);
      } else if (status === this.$store.data.getSelectedStatus && this.$store.data.currentSelection.smartFolderId !== null) {
        this.$store.data.setSelectedStatus(status);
      }
    },
    loadCategory: function(category) {
      this.$store.data.setSelectedCategoryId(category.id);
      this.$store.data.setSelectedFeedId("%");
    },
    loadFeed: function(feed) {
      this.$store.data.setSelectedFeedId(feed.id);
    },
    loadAll: function() {
      this.$store.data.setSelectedCategoryId("%");
      this.$store.data.setSelectedFeedId("%");
    },
    markAsRead: async function(currentSelection) {
      await axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/articles/markasread", currentSelection).then(
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
    selectTag(tagName) {
      if (this.$store.data.currentSelection.tag === tagName) {
        //tag is already selected, so deselect
        this.$store.data.setTag('');
      } else {
        this.$store.data.setTag(tagName);
      }
    },
    selectSmartFolder(smartFolder) {
      if (this.$store.data.currentSelection.smartFolderId !== smartFolder.id) {
        this.$store.data.setSmartFolder(smartFolder);
      }
    },
    async fetchTopTags() {
      try {
        const response = await axios.get(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/tags");
        this.topTags = response.data.tags || [];
      } catch (error) {
        console.error("Error fetching top tags", error);
      }
    },
    updateSortOrder() {
      var orderList = new Array();
      for (let i = 0; i < this.$store.data.categories.length; i++) {
        orderList.push(this.$store.data.categories[i]["id"]);
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
  computed: {
    orderList() {
      var orderList = new Array();
      this.$store.data.categories.forEach(function(category) {
        orderList.push(category.id);
      });
      // eslint-disable-next-line
      this.categoriesOrder = orderList;
      return this.categoriesOrder;
    },
    topTagsDisplay() {
      return this.topTags.slice(0, 5);
    }
  }
};
</script>
