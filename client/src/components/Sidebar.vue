<template>
  <div id="monster">
    <p>RSSMonster</p>
  </div>

  <div class="drag">
    <SidebarActionButton
      icon="arrow-down-circle-fill"
      label="Refresh feeds"
      variant="option refresh"
      :loading="refreshing"
      @select="refreshFeeds"
    />

    <SidebarActionButton
      icon="plus-square-fill"
      label="Add new feed"
      variant="option addnew"
      @select="$store.data.setShowModal('NewFeed')"
    />

    <SidebarActionButton
      icon="check-square-fill"
      label="Mark as read"
      variant="option mark-as-read"
      :loading="markingAsRead"
      @select="markAsRead($store.data.currentSelection)"
    />

    <SidebarSectionTitle
      v-if="$store.data.smartFolders.length"
      title="Smart Folders"
    />

    <SidebarNavItem
      v-for="smartFolder in $store.data.smartFolders"
      :key="smartFolder.id"
      icon="tag-fill"
      :title="smartFolder.name"
      :count="smartFolder.ArticleCount"
      :selected="$store.data.currentSelection.smartFolderId === smartFolder.id"
      row-class="tag-item"
      @select="selectSmartFolder(smartFolder)"
    />

    <SidebarSectionTitle title="All feeds" />

    <SidebarNavItem
      v-if="$store.data.unreadsSinceLastUpdate > 0"
      icon="lightbulb-fill"
      title="Click to refresh!"
      :count="$store.data.unreadsSinceLastUpdate"
      row-class="refresh-alert"
      @select="loadType('refresh')"
    />

    <SidebarNavItem
      v-for="filter in statusFilters"
      :key="filter.status"
      :icon="filter.icon"
      :icon-class="filter.iconClass"
      :title="filter.label"
      :count="getStatusCount(filter.status)"
      :selected="$store.data.currentSelection.status === filter.status && $store.data.currentSelection.smartFolderId === null"
      row-class="status-item"
      @select="loadType(filter.status)"
    />

    <SidebarSectionTitle
      v-if="$store.data.topTags.length"
      title="Top tags"
    />

    <SidebarNavItem
      v-for="tag in topTagsDisplay"
      :key="tag.name"
      icon="tag-fill"
      :title="`${tag.name.toLowerCase()}${tag.tagType === 'rule' ? ' (rule-based)' : ''}`"
      :count="tag.count"
      :selected="$store.data.currentSelection.tag === tag.name"
      row-class="tag-item"
      @select="selectTag(tag.name)"
    />

    <div v-if="$store.data.currentSelection.status != 'hot'">
      <SidebarSectionTitle title="All" />

      <SidebarNavItem
        icon="collection-fill"
        title="Load all categories"
        :count="getStatusCount($store.data.currentSelection.status)"
        :selected="$store.data.currentSelection.categoryId === '%'"
        badge-class="white"
        row-class="all-categories"
        @select="loadAll"
      />

      <SidebarSectionTitle title="Categories" />

      <draggable v-model="$store.data.categories" item-key="id" @end="updateSortOrder">
        <template #item="{ element }">
          <SidebarCategoryGroup
            :category="element"
            :selected-category-id="$store.data.currentSelection.categoryId"
            :selected-feed-id="$store.data.currentSelection.feedId"
            :count="getItemStatusCount(element)"
            :count-resolver="getItemStatusCount"
            @select-category="loadCategory"
            @select-feed="loadFeed"
          />
        </template>
      </draggable>

      <div class="sidebar-options">
        <SidebarActionButton
          icon="plus-circle-fill"
          label="Add"
          variant="sidebar-option"
          @select="$store.data.setShowModal('NewCategory')"
        />

        <template v-if="$store.data.currentSelection.categoryId === '%' && $store.data.currentSelection.feedId == '%'">
          <SidebarActionButton
            icon="eraser-fill"
            label="Cleanup"
            variant="sidebar-option"
            @select="$store.data.setShowModal('Cleanup')"
          />

          <SidebarActionButton
            icon="box-arrow-right"
            label="Logout"
            variant="sidebar-option"
            @select="logout"
          />
        </template>

        <SidebarActionButton
          v-if="$store.data.currentSelection.categoryId !== '%' && $store.data.currentSelection.feedId == '%'"
          icon="trash3-fill"
          label="Delete"
          variant="sidebar-option delete"
          @select="$store.data.setShowModal('DeleteCategory')"
        />

        <SidebarActionButton
          v-if="$store.data.currentSelection.categoryId !== '%' && $store.data.currentSelection.feedId === '%'"
          icon="pencil-fill"
          label="Edit"
          variant="sidebar-option rename"
          @select="$store.data.setShowModal('RenameCategory')"
        />

        <SidebarActionButton
          v-if="$store.data.currentSelection.categoryId !== '%' && $store.data.currentSelection.feedId !== '%'"
          icon="trash3-fill"
          label="Delete"
          variant="sidebar-option delete"
          @select="$store.data.setShowModal('DeleteFeed')"
        />

        <SidebarActionButton
          v-if="$store.data.currentSelection.categoryId != '%' && $store.data.currentSelection.feedId != '%'"
          icon="pencil-fill"
          label="Edit"
          variant="sidebar-option rename"
          @select="$store.data.setShowModal('UpdateFeed')"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.drag {
  background-color: transparent;
  color: var(--text-inverted);
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
  width: 6px;
  height: 6px;
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

@media (prefers-color-scheme: dark) {
  #monster p {
    color: var(--text-inverted);
  }
}
</style>

<script setup>
import { computed, getCurrentInstance, onBeforeMount, ref } from 'vue';
import draggable from 'vuedraggable';
import Cookies from 'js-cookie';
import { setAuthToken } from '../api/client';
import { markAllAsRead } from '../api/articles';
import { triggerCrawl } from '../api/crawl';
import { updateCategoryOrder } from '../api/manager';
import SidebarActionButton from './sidebar/SidebarActionButton.vue';
import SidebarCategoryGroup from './sidebar/SidebarCategoryGroup.vue';
import SidebarNavItem from './sidebar/SidebarNavItem.vue';
import SidebarSectionTitle from './sidebar/SidebarSectionTitle.vue';

const emit = defineEmits(['forceReload']);
const instance = getCurrentInstance();
// This proxy resolves the global store when it is used, after Vue has installed it.
const store = new Proxy({}, {
  get(_, property) {
    return instance.proxy.$store?.[property];
  }
});
const refreshing = ref(false);
const markingAsRead = ref(false);

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
  markingAsRead.value = true;

  try {
    await markAllAsRead(currentSelection);
    emit('forceReload');
    markingAsRead.value = false;
  } catch (error) {
    markingAsRead.value = false;
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
