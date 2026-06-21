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

    <div v-if="refreshProgress.visible" class="refresh-progress-panel">
      <div class="refresh-progress-header">
        <strong>Live refresh</strong>
        <span>{{ refreshProgress.currentFeedLabel }}</span>
      </div>
      <div class="refresh-progress-bar">
        <div class="refresh-progress-fill" :style="{ width: `${refreshProgress.progressPercent}%` }"></div>
      </div>
      <div class="refresh-progress-stats">
        <span>Processed: {{ refreshProgress.processedFeeds }}/{{ refreshProgress.totalFeeds }}</span>
        <span>New: {{ refreshProgress.newArticles }}</span>
        <span>Errors: {{ refreshProgress.errors }}</span>
      </div>
      <ul class="refresh-progress-logs">
        <li v-for="(line, index) in refreshProgress.logs" :key="`${line}-${index}`">{{ line }}</li>
      </ul>
    </div>

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

.refresh-progress-panel {
  margin: 0px 12px 20px;
  padding: 10px;
  border-radius: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.refresh-progress-header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  margin-bottom: 8px;
}

.refresh-progress-bar {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: var(--scrollbar-track);
  overflow: hidden;
}

.refresh-progress-fill {
  height: 100%;
  background: var(--button-main);
  transition: width 0.25s ease;
}

.refresh-progress-stats {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 11px;
  margin-top: 8px;
}

.refresh-progress-logs {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  max-height: 120px;
  overflow-y: auto;
  font-size: 11px;
  color: var(--text-muted);
}

.refresh-progress-logs li {
  margin-bottom: 4px;
}

@media (prefers-color-scheme: dark) {
  #monster p {
    color: var(--text-inverted);
  }
}
</style>

<script setup>
import { computed, getCurrentInstance, onBeforeMount, onBeforeUnmount, reactive, ref } from 'vue';
import draggable from 'vuedraggable';
import Cookies from 'js-cookie';
import { setAuthToken } from '../api/client';
import { markAllAsRead } from '../api/articles';
import { triggerCrawl } from '../api/crawl';
import { openFeedRefreshEvents, startFeedRefresh } from '../api/feeds';
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
const refreshEventSource = ref(null);
const refreshProgress = reactive({
  visible: false,
  currentFeedLabel: 'Waiting to start...',
  progressPercent: 0,
  totalFeeds: 0,
  processedFeeds: 0,
  newArticles: 0,
  errors: 0,
  logs: []
});

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

onBeforeUnmount(() => {
  closeRefreshEventSource();
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
  if (refreshing.value) return;

  refreshing.value = true;

  resetRefreshProgress();
  refreshProgress.visible = true;
  appendRefreshLog('Starting refresh...');

  try {
    const response = await startFeedRefresh();
    const jobId = response?.data?.jobId;

    if (!jobId) {
      throw new Error('Missing refresh job id');
    }

    openRefreshEventStream(jobId);
  } catch (error) {
    appendRefreshLog('Live refresh unavailable. Falling back to standard refresh.');
    await fallbackRefresh(error);
  }
}

// This function stops the refresh progress indicator.
function refresh() {
  refreshing.value = false;
}

function resetRefreshProgress() {
  refreshProgress.currentFeedLabel = 'Waiting to start...';
  refreshProgress.progressPercent = 0;
  refreshProgress.totalFeeds = 0;
  refreshProgress.processedFeeds = 0;
  refreshProgress.newArticles = 0;
  refreshProgress.errors = 0;
  refreshProgress.logs = [];
}

function appendRefreshLog(message) {
  const timestamp = new Date().toLocaleTimeString();
  refreshProgress.logs.unshift(`${timestamp} - ${message}`);
  refreshProgress.logs = refreshProgress.logs.slice(0, 8);
}

function updateProgressFromEvent(payload) {
  if (!payload || typeof payload !== 'object') return;

  const totalFeeds = Number(payload.totalFeeds || 0);
  const processedFeeds = Number(payload.processedFeeds || payload.currentFeed || 0);

  refreshProgress.totalFeeds = totalFeeds;
  refreshProgress.processedFeeds = processedFeeds;
  refreshProgress.newArticles = Number(payload.newArticles || 0);
  refreshProgress.errors = Number(payload.errors || 0);

  if (payload.feedName) {
    const currentFeed = Number(payload.currentFeed || processedFeeds || 0);
    refreshProgress.currentFeedLabel = `${payload.feedName} (${currentFeed}/${totalFeeds || '?'})`;
  } else if (totalFeeds > 0) {
    refreshProgress.currentFeedLabel = `${processedFeeds}/${totalFeeds} feeds`;
  }

  if (totalFeeds > 0) {
    refreshProgress.progressPercent = Math.min(100, Math.round((processedFeeds / totalFeeds) * 100));
  }
}

function openRefreshEventStream(jobId) {
  closeRefreshEventSource();

  const token = store.auth?.getToken || Cookies.get('token') || null;
  const eventSource = openFeedRefreshEvents(jobId, token);
  refreshEventSource.value = eventSource;

  const handleEvent = (event) => {
    try {
      const payload = JSON.parse(event.data || '{}');
      updateProgressFromEvent(payload);

      switch (event.type) {
        case 'refresh_started':
          appendRefreshLog(`Refresh started for ${payload.totalFeeds || 0} feeds.`);
          break;
        case 'feed_started':
          appendRefreshLog(`Started: ${payload.feedName || payload.feedId}`);
          break;
        case 'feed_parsed':
          appendRefreshLog(`Parsed ${payload.entries || 0} entries from ${payload.feedName || payload.feedId}.`);
          break;
        case 'articles_inserted_updated':
          appendRefreshLog(`Articles for ${payload.feedName || payload.feedId}: +${payload.feedNewArticles || 0} new, ${payload.feedUpdatedArticles || 0} updated.`);
          break;
        case 'feed_error':
          appendRefreshLog(`Error in ${payload.feedName || payload.feedId}: ${payload.message || 'unknown error'}`);
          break;
        case 'feed_completed':
          appendRefreshLog(`Completed: ${payload.feedName || payload.feedId}`);
          break;
        case 'done':
          appendRefreshLog('Refresh completed.');
          finishRefreshStream(true);
          break;
        case 'error':
          appendRefreshLog(payload.message || 'Refresh failed.');
          finishRefreshStream(false);
          break;
        default:
          break;
      }
    } catch (error) {
      appendRefreshLog('Received invalid progress payload.');
      console.log('Invalid SSE payload', error);
    }
  };

  eventSource.onopen = () => {
    appendRefreshLog('Live connection established.');
  };

  eventSource.onerror = () => {
    appendRefreshLog('Live updates disconnected.');
    // Do not trigger legacy crawl here because the job is already running.
    finishRefreshStream(false);
  };

  eventSource.onmessage = handleEvent;
  [
    'refresh_started',
    'feed_started',
    'feed_parsed',
    'articles_inserted_updated',
    'feed_error',
    'feed_completed',
    'done',
    'error',
    'progress'
  ].forEach(type => {
    eventSource.addEventListener(type, handleEvent);
  });
}

async function fallbackRefresh(error) {
  try {
    await triggerCrawl();
    setTimeout(() => {
      appendRefreshLog('Standard refresh completed.');
      refresh();
      refreshProgress.visible = false;
    }, 2000);
  } catch (fallbackError) {
    refreshing.value = false;
    refreshProgress.visible = false;
    console.log('oops something went wrong', fallbackError || error);
  }
}

function finishRefreshStream(success) {
  closeRefreshEventSource();

  setTimeout(() => {
    refreshing.value = false;
    refreshProgress.visible = false;
    if (success) {
      emit('forceReload');
    }
  }, 500);
}

function closeRefreshEventSource() {
  if (refreshEventSource.value) {
    refreshEventSource.value.close();
    refreshEventSource.value = null;
  }
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
