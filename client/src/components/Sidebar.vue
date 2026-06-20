<template>
  <div id="monster">
    <p>RSSMonster</p>
  </div>
  <div class="drag">

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
    <div
      v-for="filter in statusFilters"
      :id="filter.status"
      :key="filter.status"
      class="category-top"
      :class="{ selected: $store.data.currentSelection.status === filter.status && $store.data.currentSelection.smartFolderId === null }"
      @click="loadType(filter.status)">
      <span class="glyphicon">
        <BootstrapIcon :icon="filter.icon" :class="filter.iconClass" />
      </span>
      <span class="title">{{ filter.label }}</span>
      <span class="badge-unread">
        <span class="badge">{{ getStatusCount(filter.status) }}</span>
      </span>
    </div>

    <div v-if="$store.data.topTags.length" class="title-box">
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
      <span class="title">{{ tag.name.toLowerCase() }}{{ tag.tagType === 'rule' ? ' (rule-based)' : '' }}</span>
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
          <BootstrapIcon icon="collection-fill" variant="light" />
        </span>
        <span class="title">Load all categories</span>
        <span class="badge-unread">
          <span class="badge white">{{ getStatusCount($store.data.currentSelection.status) }}</span>
        </span>
      </div>

      <div class="title-box">
        <p class="title">Categories</p>
      </div>
      <draggable v-model="$store.data.categories" item-key="id" @end="updateSortOrder">
        <template #item="{element}">
          <div v-bind:class="{ 'selected': ($store.data.currentSelection.categoryId == element.id) && ($store.data.currentSelection.feedId === '%') }" v-bind:id="element.id" class="category-main" v-on:click="loadCategory(element)">
          <div class="category-sub">
            <span class="glyphicon">
              <BootstrapIcon icon="folder-fill" variant="light" />
            </span>
            <span class="title">{{element.name}}</span>
            <span class="badge-unread">
              <span v-if="getItemStatusCount(element) !== null" class="badge white">{{ getItemStatusCount(element) }}</span>
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
                  <span v-if="getItemStatusCount(feed) !== null" class="badge white">{{ getItemStatusCount(feed) }}</span>
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
            <BootstrapIcon icon="plus-circle-fill" color="currentColor" />
            <div class="text">Add</div>
          </div>
        </div>
        <div v-if="($store.data.currentSelection.categoryId === '%') && ($store.data.currentSelection.feedId == '%')">
          <div id="cleanup" class="sidebar-option" @click="$store.data.setShowModal('Cleanup')">
            <BootstrapIcon icon="eraser-fill" color="currentColor" />
            <div class="text">Cleanup</div>
          </div>
          <div @click="logout()" id="logout" class="sidebar-option">
            <BootstrapIcon icon="box-arrow-right" color="currentColor" />
            <div class="text">Logout</div>
          </div>
        </div>
        <div v-if="($store.data.currentSelection.categoryId !== '%') && ($store.data.currentSelection.feedId == '%')" @click="$store.data.setShowModal('DeleteCategory')" class="sidebar-option delete">
          <div>
            <BootstrapIcon icon="trash3-fill" color="currentColor" />
            <div class="text">Delete</div>
          </div>
        </div>
        <div v-if="($store.data.currentSelection.categoryId !== '%') && ($store.data.currentSelection.feedId === '%')" @click="$store.data.setShowModal('RenameCategory')" class="sidebar-option rename">
          <div>
            <BootstrapIcon icon="pencil-fill" color="currentColor" />
            <div class="text">Edit</div>
          </div>
        </div>
        <div v-if="($store.data.currentSelection.categoryId !== '%') && ($store.data.currentSelection.feedId !== '%')" @click="$store.data.setShowModal('DeleteFeed')" class="sidebar-option delete">
          <div>
            <BootstrapIcon icon="trash3-fill" color="currentColor" />
            <div class="text">Delete</div>
          </div>
        </div>
        <div v-if="($store.data.currentSelection.categoryId != '%') && ($store.data.currentSelection.feedId != '%')" @click="$store.data.setShowModal('UpdateFeed')" class="sidebar-option rename">
          <div>
            <BootstrapIcon icon="pencil-fill" color="currentColor" />
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
  color: var(--text-inverted);
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
#manage-users.option {
  background-color: var(--color-primary);
  width: 170px;
}

#mark-as-read {
  background-color: var(--color-selected);
}

.badge.white {
  float: right;
  color: var(--text-inverted);
  background-color: transparent;
  margin-top: 3px;
}

.glyphicon {
  float: left;
  margin-right: 5px;
  min-width: 13px;
}

div.category-feed span.glyphicon img {
    margin-bottom: 2px;
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
	background-color: var(--color-danger);
}

.category-feed,
.category-top,
.category-main,
.tag-item {
  background-color: var(--color-secondary);
  transition: background-color 0.2s ease, transform 0.15s ease, box-shadow 0.2s ease;
}

.category-top.selected,
.category-main.selected,
.category-feed.selected {
  background-color: var(--color-selected);
  box-shadow: var(--shadow-selected);
}

.category-top.selected .glyphicon,
.category-main.selected .glyphicon {
  color: var(--text-inverted);
}

/* Status icon colors */
.icon-unread { color: var(--icon-unread); }
.icon-star { color: var(--icon-star); }
.icon-hot { color: var(--icon-hot); }
.icon-clicked { color: var(--icon-clicked); }
.icon-read { color: var(--icon-read); }

.selected .icon-unread,
.selected .icon-star,
.selected .icon-hot,
.selected .icon-clicked,
.selected .icon-read {
  color: var(--text-inverted);
}

p.title {
  color: var(--text-primary);
  margin-left: 14px;
  margin-top: 10px;
  margin-bottom: 5px;
}

div.option {
  margin-left: 12px;
  padding: 6px;
  color: var(--text-inverted);
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
  background: url('../assets/images/monster.png') 14px 14px no-repeat;
  background-size: 60px 60px;
  height: 90px;
}

#monster p {
  padding: 27px 0px 8px 78px;
  color: var(--text-primary);
  font-size: 26px;
  font-weight: 400;
}

::-webkit-scrollbar {
  width: 6px; /* for vertical scrollbars */
  height: 6px; /* for horizontal scrollbars */
}

::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}

::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
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
  color: var(--text-primary);
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
  background-color: var(--color-error);
}

.category-feed.disabled {
  background-color: var(--color-disabled);
}

.category-feed.disabled .title {
  color: var(--text-disabled);
}

.category-feed.selected.disabled {
  background-color: var(--bg-selected-dark);
}

.category-feed.selected.disabled .title {
  color: var(--color-disabled);
}

@media (prefers-color-scheme: dark) {
  .option {
    background-color: var(--bg-option-dark);
  }

  #mark-as-read {
    background-color: var(--bg-selected-dark);
  }
  p.title {
    color: var(--text-inverted);
  }
  #monster p {
    color: var(--text-inverted);
  }
  .sidebar-option {
    color: var(--text-inverted);
    background-color: var(--bg-sidebar-option-dark);
  }
  .sidebar-options svg {
    fill: var(--text-inverted);
  }
}
</style>

<script setup>
import { computed, getCurrentInstance, onBeforeMount, ref } from 'vue';
import draggable from "vuedraggable";
import { setAuthToken } from '../api/client';
import Cookies from 'js-cookie';
import { markAllAsRead } from '../api/articles';
import { triggerCrawl } from '../api/crawl';
import { updateCategoryOrder } from '../api/manager';

const emit = defineEmits(['forceReload']);
const instance = getCurrentInstance();
let store;
const refreshing = ref(false);
const statusFilters = [
  { status: 'unread', label: 'Unread', icon: 'record-circle-fill', iconClass: 'icon-unread' },
  { status: 'star', label: 'Favorites', icon: 'heart-fill', iconClass: 'icon-star' },
  { status: 'hot', label: 'Hot', icon: 'fire', iconClass: 'icon-hot' },
  { status: 'clicked', label: 'Clicked', icon: 'bookmark-fill', iconClass: 'icon-clicked' },
  { status: 'read', label: 'Read', icon: 'check-circle-fill', iconClass: 'icon-read' }
];

const orderList = computed(() => store.data.categories.map(category => category.id));
const topTagsDisplay = computed(() => store.data.topTags.slice(0, 5));

onBeforeMount(() => {
  store = instance.proxy.$store;
  Promise.allSettled([
    store.data.fetchTopTags(),
    store.data.fetchSmartFolders()
  ]).catch(() => {});
});

// This function returns the count for a selected article status.
function getStatusCount(status) {
  return store.data[`${status}Count`];
}

// This function returns an item's count for the selected article status.
function getItemStatusCount(item) {
  const status = store.data.currentSelection.status;
  const count = item[`${status}Count`];
  return count === undefined ? null : count;
}

// This function clears the current authentication session.
function logout() {
  setAuthToken(null);
  store.auth.setToken(null);
  store.auth.setRole(null);
  Cookies.remove('token');
  location.reload();
}

// This function changes the selected article status.
function loadType(status) {
  console.log('%cLoading type:', 'color: red;', status);
  if (status === 'refresh') {
    store.data.setSmartFolder(null);
    emit('forceReload');
  } else if (status !== store.data.getSelectedStatus) {
    store.data.setSelectedStatus(status);
  } else if (store.data.currentSelection.smartFolderId !== null) {
    store.data.setSelectedStatus(status);
  }
}

// This function selects a category and clears the selected feed.
function loadCategory(category) {
  store.data.setSelectedCategoryId(category.id);
  store.data.setSelectedFeedId('%');
}

// This function selects a feed.
function loadFeed(feed) {
  store.data.setSelectedFeedId(feed.id);
}

// This function selects all categories and feeds.
function loadAll() {
  store.data.setSelectedCategoryId('%');
  store.data.setSelectedFeedId('%');
}

// This function marks articles in the current selection as read.
async function markAsRead(currentSelection) {
  try {
    await markAllAsRead(currentSelection);
    setTimeout(() => location.reload(), 1000);
  } catch (error) {
    console.log('oops something went wrong', error);
  }
}

// This function starts a feed refresh and displays its progress.
async function refreshFeeds() {
  refreshing.value = true;
  try {
    await triggerCrawl();
    setTimeout(refresh, 2000);
  } catch (error) {
    refreshing.value = false;
    console.log('oops something went wrong', error);
  }
}

// This function stops the refresh progress indicator.
function refresh() {
  refreshing.value = false;
}

// This function toggles a tag selection.
function selectTag(tagName) {
  store.data.setTag(store.data.currentSelection.tag === tagName ? '' : tagName);
}

// This function selects a smart folder.
function selectSmartFolder(smartFolder) {
  if (store.data.currentSelection.smartFolderId !== smartFolder.id) {
    store.data.setSmartFolder(smartFolder);
  }
}

// This function saves the current category order.
function updateSortOrder() {
  updateCategoryOrder(orderList.value)
    .then(response => console.log(response.status))
    .catch(error => console.log('oops something went wrong', error));
}

defineExpose({ updateSortOrder });
</script>
