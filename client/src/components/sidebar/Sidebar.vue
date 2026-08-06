<template>
  <div class="sidebar-brand">
    <p>RSSMonster</p>
  </div>

  <div class="sidebar-scroll">
    <div class="sidebar-primary-actions">
      <SidebarActionButton
        icon="arrow-repeat"
        label="Refresh feeds"
        variant="sidebar-button sidebar-button-refresh"
        :loading="refreshing"
        @select="refreshFeeds"
      />

      <FeedRefreshProgress
        v-if="refreshProgress.visible"
        class="sidebar-refresh-progress-panel"
        :progress="refreshProgress"
      />

      <SidebarActionButton
        icon="plus-square-fill"
        label="Add new feed"
        variant="sidebar-button sidebar-button-add-feed"
        @select="uiStore.setShowModal('NewFeed')"
      />

      <SidebarActionButton
        icon="check-square-fill"
        label="Mark as read"
        variant="sidebar-button sidebar-button-mark-read"
        :loading="markingAsRead"
        @select="markAsRead(selectionStore.currentSelection)"
      />
    </div>

    <div
      v-if="overviewStore.overviewCountsStatus === 'error'"
      class="sidebar-resource-error"
      role="status"
    >
      <span>Counts could not refresh.</span>
      <button type="button" @click="overviewStore.refreshOverviewCounts()">Retry</button>
    </div>

    <div
      v-if="overviewStore.smartFoldersStatus === 'error'"
      class="sidebar-resource-error"
      role="status"
    >
      <span>Smart Folders could not refresh.</span>
      <button type="button" @click="overviewStore.fetchSmartFolders()">Retry</button>
    </div>

    <div
      v-else-if="overviewStore.smartFolderCountsStatus === 'error'"
      class="sidebar-resource-error"
      role="status"
    >
      <span>Smart Folder counts may be outdated.</span>
      <button type="button" @click="overviewStore.fetchSmartFolderCounts()">Retry</button>
    </div>

    <div
      v-if="overviewStore.topTagsStatus === 'error'"
      class="sidebar-resource-error"
      role="status"
    >
      <span>Top tags could not refresh.</span>
      <button type="button" @click="overviewStore.fetchTopTags()">Retry</button>
    </div>

    <div v-if="overviewStore.smartFolders.length" class="sidebar-section sidebar-smart-folders">
      <SidebarSectionTitle title="Smart Folders" />

      <SidebarNavItem
        v-for="smartFolder in overviewStore.smartFolders"
        :key="smartFolder.id"
        icon="folder-fill"
        :title="smartFolder.name"
        :count="smartFolder.ArticleCount"
        :selected="selectionStore.currentSelection.smartFolderId === smartFolder.id"
        row-class="sidebar-tag-item"
        @select="selectSmartFolder(smartFolder)"
      />
    </div>

    <div class="sidebar-section sidebar-status-filters">
      <SidebarSectionTitle title="All feeds" />

      <SidebarNavItem
        v-if="overviewStore.unreadsSinceLastUpdate > 0"
        icon="lightbulb-fill"
        title="Click to refresh!"
        :count="overviewStore.unreadsSinceLastUpdate"
        row-class="sidebar-refresh-alert"
        @select="loadType('refresh')"
      />

      <SidebarNavItem
        v-for="filter in visibleStatusFilters"
        :key="filter.status"
        :icon="filter.icon"
        :icon-class="filter.iconClass"
        :title="filter.label"
        :count="getStatusCount(filter.status)"
        :selected="selectionStore.currentSelection.status === filter.status && selectionStore.currentSelection.smartFolderId === null"
        row-class="sidebar-status-item"
        @select="loadType(filter.status)"
      />
    </div>

    <div v-if="overviewStore.topTags.length" class="sidebar-section sidebar-tags">
      <SidebarSectionTitle :title="topTagsTitle" />

      <SidebarNavItem
        v-for="tag in topTagsDisplay"
        :key="tag.name"
        icon="tag-fill"
        :title="`${formatTagName(tag.name)}`"
        :count="tag.count"
        :selected="selectionStore.currentSelection.tag === tag.name"
        row-class="sidebar-tag-item"
        @select="selectTag(tag.name)"
      />
    </div>

    <div class="sidebar-section sidebar-categories">
      <SidebarSectionTitle title="All" />

      <SidebarNavItem
        icon="collection-fill"
        title="Load all categories"
        :count="getStatusCount(selectionStore.currentSelection.status)"
        :selected="selectionStore.currentSelection.categoryId === '%'"
        badge-class="sidebar-count-white"
        row-class="sidebar-all-categories-item"
        @select="loadAll"
      />

      <div class="sidebar-category-heading">
        <SidebarSectionTitle title="Categories" />
        <button
          v-if="overviewStore.categories.length > 1 || categoryReordering"
          type="button"
          class="sidebar-category-reorder-button"
          :aria-pressed="categoryReordering"
          :disabled="categoryReorderLoading"
          @click="toggleCategoryReordering"
        >
          <BootstrapIcon :icon="categoryReordering ? 'check-lg' : 'grip-vertical'" aria-hidden="true" />
          {{ categoryReorderLoading ? 'Loading...' : categoryReordering ? 'Done' : 'Reorder' }}
        </button>
      </div>

      <div v-if="!categoryReordering" class="sidebar-category-list">
        <SidebarCategoryGroup
          v-for="category in overviewStore.categories"
          :key="category.id"
          :category="category"
          :selected-category-id="selectionStore.currentSelection.categoryId"
          :selected-feed-id="selectionStore.currentSelection.feedId"
          :count="getItemStatusCount(category)"
          :count-resolver="getItemStatusCount"
          @select-category="loadCategory"
          @select-feed="loadFeed"
        />
      </div>

      <component
        :is="categoryReorderComponent"
        v-else
        class="sidebar-category-reorder-list"
        :model-value="overviewStore.categories"
        item-key="id"
        @update:model-value="applyCategoryOrder"
      >
        <template #item="{ element }">
          <SidebarCategoryGroup
            :category="element"
            :selected-category-id="selectionStore.currentSelection.categoryId"
            :selected-feed-id="selectionStore.currentSelection.feedId"
            :count="getItemStatusCount(element)"
            :count-resolver="getItemStatusCount"
            @select-category="loadCategory"
            @select-feed="loadFeed"
          />
        </template>
      </component>

      <div class="sidebar-footer-actions">
        <div class="sidebar-divider"></div>

        <div class="sidebar-management-actions">
          <SidebarActionButton
            icon="plus-circle-fill"
            label="Add category"
            variant="sidebar-button sidebar-bottom-action-button sidebar-add-button"
            @select="uiStore.setShowModal('NewCategory')"
          />

          <SidebarActionButton
            v-if="selectionStore.currentSelection.categoryId !== '%' && selectionStore.currentSelection.feedId == '%'"
            icon="trash3-fill"
            label="Delete category"
            variant="sidebar-button sidebar-bottom-action-button sidebar-delete-button"
            @select="uiStore.setShowModal('DeleteCategory')"
          />

          <SidebarActionButton
            v-if="selectionStore.currentSelection.categoryId !== '%' && selectionStore.currentSelection.feedId === '%'"
            icon="pencil-fill"
            label="Edit category"
            variant="sidebar-button sidebar-bottom-action-button sidebar-edit-button"
            @select="uiStore.setShowModal('RenameCategory')"
          />

          <SidebarActionButton
            v-if="selectionStore.currentSelection.categoryId !== '%' && selectionStore.currentSelection.feedId !== '%'"
            icon="trash3-fill"
            label="Delete feed"
            variant="sidebar-button sidebar-bottom-action-button sidebar-delete-button"
            @select="uiStore.setShowModal('DeleteFeed')"
          />

          <SidebarActionButton
            v-if="selectionStore.currentSelection.categoryId != '%' && selectionStore.currentSelection.feedId != '%'"
            icon="pencil-fill"
            label="Edit feed"
            variant="sidebar-button sidebar-bottom-action-button sidebar-edit-button"
            @select="uiStore.setShowModal('UpdateFeed')"
          />

          <template v-if="selectionStore.currentSelection.categoryId === '%' && selectionStore.currentSelection.feedId == '%'">
            <SidebarActionButton
              icon="trash"
              label="Cleanup articles"
              variant="sidebar-button sidebar-bottom-action-button sidebar-cleanup-button"
              @select="uiStore.setShowModal('Cleanup')"
            />

            <SidebarActionButton
              icon="box-arrow-right"
              label="Logout"
              variant="sidebar-button sidebar-bottom-action-button sidebar-logout-button"
              @select="logout"
            />
          </template>
        </div>

        <div class="sidebar-divider sidebar-version-divider"></div>

        <a
          class="sidebar-version"
          href="https://github.com/pietheinstrengholt/rssmonster/"
          target="_blank"
          rel="noopener noreferrer"
        >RSSMonster v2.0.0</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar-scroll {
  background-color: var(--color-transparent);
  color: var(--text-primary);
  margin-left: 8px;
  width: 250px;
}

.sidebar-brand {
  background-color: var(--color-transparent);
  background-image: url('../../assets/images/monster-ui-64.webp');
  background-image: image-set(
    url('../../assets/images/monster-ui-64.webp') 1x,
    url('../../assets/images/monster-ui-128.webp') 2x
  );
  background-position: 14px 14px;
  background-repeat: no-repeat;
  background-size: 60px 60px;
  height: 90px;
}

.sidebar-resource-error {
  align-items: center;
  color: var(--text-secondary);
  display: flex;
  font-size: 12px;
  gap: 8px;
  justify-content: space-between;
  margin: 8px 12px;
}

.sidebar-resource-error button {
  background: var(--color-transparent);
  border: 0;
  color: var(--accent-color);
  padding: 0;
}

.sidebar-category-heading {
  align-items: flex-end;
  display: flex;
  justify-content: space-between;
  padding-right: 12px;
}

.sidebar-category-reorder-button {
  align-items: center;
  background: var(--color-transparent);
  border: 0;
  border-radius: 6px;
  color: var(--text-secondary);
  display: inline-flex;
  font-size: 12px;
  gap: 4px;
  margin-bottom: 3px;
  padding: 3px 5px;
}

.sidebar-category-reorder-button:hover,
.sidebar-category-reorder-button[aria-pressed='true'] {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.sidebar-category-reorder-button:focus-visible {
  outline: 2px solid var(--accent-color);
  outline-offset: 2px;
}

.sidebar-category-reorder-button:disabled {
  cursor: wait;
  opacity: 0.65;
}

:global(:root[data-theme='dark']) .sidebar-resource-error {
  color: var(--text-secondary);
}

:global(:root[data-theme='dark']) .sidebar-category-reorder-button {
  color: var(--text-secondary);
}

:global(:root[data-theme='dark']) .sidebar-category-reorder-button:hover,
:global(:root[data-theme='dark']) .sidebar-category-reorder-button[aria-pressed='true'] {
  background: var(--bg-hover);
  color: var(--text-inverted);
}

.sidebar-brand p {
  padding: 27px 0px 8px 78px;
  color: var(--text-primary);
  font-size: 26px;
  font-weight: 600;
}

.sidebar-management-actions {
  margin: 0;
  width: 100%;
}

.sidebar-footer-actions {
  margin: 12px 0 20px;
  width: 100%;
}

.sidebar-divider {
  height: 1px;
  margin: 0 12px 12px;
  background-color: var(--border-subtle);
}

.sidebar-version-divider {
  margin-top: 4px;
}

.sidebar-version {
  display: block;
  margin: 0 12px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.4;
  text-align: center;
  text-decoration: none;
}

.sidebar-version:hover {
  text-decoration: underline;
}

.sidebar-refresh-progress-panel {
  margin: 0 12px 20px;
}

:global(:root[data-theme='dark']) {
  .sidebar-brand p {
    color: var(--text-inverted);
  }

  div.sidebar-item.sidebar-status-item.selected span.sidebar-item-title, div.sidebar-item.sidebar-all-categories-item.selected span.sidebar-item-title, div.sidebar-item.sidebar-tag-item.selected span.sidebar-item-title, .sidebar-feed.selected span.sidebar-item-title {
    color: var(--sidebar-selected-text-dark) !important;
  }

}
</style>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { useOverviewStore } from '../../store/overview.js';
import { useUiStore } from '../../store/ui.js';
import { useAuthStore } from '../../store/auth.js';
import { markRaw } from 'vue';
import { markAllAsRead } from '../../api/articles';
import { triggerCrawl } from '../../api/crawl';
import { openFeedRefreshEvents, startFeedRefresh } from '../../api/feeds';
import { updateCategoryOrder } from '../../api/manager';
import SidebarActionButton from './SidebarActionButton.vue';
import SidebarCategoryGroup from './SidebarCategoryGroup.vue';
import SidebarNavItem from './SidebarNavItem.vue';
import SidebarSectionTitle from './SidebarSectionTitle.vue';
import FeedRefreshProgress from '../shared/FeedRefreshProgress.vue';
import { formatTagName } from '../../utils/tags';
import { notifyActionError } from '../../services/actionNotifications.js';

const statusFilters = [
  { status: 'briefing', label: 'Daily briefing', icon: 'sunrise-fill', iconClass: 'icon-briefing' },
  { status: 'unread', label: 'Unread', icon: 'record-circle-fill', iconClass: 'icon-unread' },
  { status: 'read', label: 'Read', icon: 'circle-fill', iconClass: 'icon-read' },
  { status: 'favorite', label: 'Favorites', icon: 'bookmark-fill', iconClass: 'icon-star' },
  { status: 'hot', label: 'Hot', icon: 'fire', iconClass: 'icon-hot' },
  { status: 'clicked', label: 'Clicked', icon: 'arrow-up-right-square-fill', iconClass: 'icon-clicked' }
];

export default {
  components: {
    FeedRefreshProgress,
    SidebarActionButton,
    SidebarCategoryGroup,
    SidebarNavItem,
    SidebarSectionTitle
  },
  emits: ['forceReload', 'logout'],
  // This initializes sidebar activity, refresh progress, and SSE cleanup state.
  data() {
    return {
      categoryReorderComponent: null,
      categoryReordering: false,
      categoryReorderLoading: false,
      refreshing: false,
      markingAsRead: false,
      refreshEventSource: null,
      refreshEventListeners: [],
      refreshStreamGeneration: 0,
      refreshCompletionTimer: null,
      fallbackRefreshTimer: null,
      statusFilters,
      refreshProgress: {
        visible: false,
        currentFeedLabel: 'Waiting to start...',
        progressPercent: 0,
        totalFeeds: 0,
        processedFeeds: 0,
        newArticles: 0,
        errors: 0,
        logs: []
      }
    };
  },
  computed: {
    ...mapStores(useSelectionStore, useOverviewStore, useUiStore, useAuthStore),
    // This returns category IDs in their current drag order.
    orderList() {
      return this.overviewStore.categories.map(category => category.id);
    },
    // This limits the sidebar to the five most frequent tags.
    topTagsDisplay() {
      return this.overviewStore.topTags.slice(0, 5);
    },
    // This labels Top Tags with the article collection represented by their counts.
    topTagsTitle() {
      const labels = {
        briefing: 'Daily briefing',
        unread: 'Unread',
        read: 'Read',
        favorite: 'Favorites',
        hot: 'Hot',
        clicked: 'Clicked'
      };
      const label = labels[this.selectionStore.currentSelection.status];
      return label ? `Top tags in ${label}` : 'Top tags';
    },
    // This hides the Daily briefing filter when AI features are disabled.
    visibleStatusFilters() {
      return this.statusFilters.filter(
        filter => filter.status !== 'briefing' || this.selectionStore.currentSelection.AIEnabled
      );
    }
  },
  watch: {
    refreshProgress: {
      // This publishes every live crawl update for the mobile empty-state progress panel.
      handler(progress) {
        this.uiStore.setFeedRefreshProgress?.(progress);
      },
      deep: true,
      immediate: true
    }
  },
  // This loads supplemental sidebar navigation before the component mounts.
  beforeMount() {
    void this.overviewStore.fetchSmartFolders();
  },
  // This closes live refresh resources and prevents delayed state updates after unmount.
  beforeUnmount() {
    this.closeRefreshEventSource();
    clearTimeout(this.refreshCompletionTimer);
    clearTimeout(this.fallbackRefreshTimer);
  },
  methods: {
    // This function loads drag-and-drop support only when category reordering is requested.
    async toggleCategoryReordering() {
      if (this.categoryReordering) {
        this.categoryReordering = false;
        return;
      }

      if (this.categoryReorderLoading) return;

      if (!this.categoryReorderComponent) {
        this.categoryReorderLoading = true;

        try {
          const { default: draggable } = await import('vuedraggable');
          this.categoryReorderComponent = markRaw(draggable);
        } catch (error) {
          console.error('Error loading category reordering:', error);
          notifyActionError('Could not enable category reordering. Please try again.', error);
          return;
        } finally {
          this.categoryReorderLoading = false;
        }
      }

      this.categoryReordering = true;
    },
    // This returns the count for a selected article status.
    getStatusCount(status) {
      return this.overviewStore[`${status}Count`];
    },

    // This function returns an item's count for the selected article status.
    getItemStatusCount(item) {
      const status = this.selectionStore.currentSelection.status;
      const count = item[`${status}Count`];
      return count === undefined ? null : count;
    },

    // This function delegates explicit logout to the root coordinated session reset.
    logout() {
      this.$emit('logout');
    },

    // This function changes the selected article status.
    loadType(status) {
      console.log('%cLoading type:', 'color: red;', status);

      if (status === 'refresh') {
        this.selectionStore.setSmartFolder(null);
        this.$emit('forceReload');
      } else if (status !== this.selectionStore.currentSelection.status) {
        this.selectionStore.setSelectedStatus(status);
      } else if (this.selectionStore.currentSelection.smartFolderId !== null) {
        this.selectionStore.setSelectedStatus(status);
      }
    },

    // This function selects a category and clears the selected feed.
    loadCategory(category) {
      this.selectionStore.selectCategory(category.id);
    },

    // This function selects a feed.
    loadFeed(feed) {
      this.selectionStore.selectFeed(feed.id, feed.categoryId);
    },

    // This function selects all categories and feeds.
    loadAll() {
      this.selectionStore.selectCategory('%');
    },

    // This function marks articles in the current selection as read.
    async markAsRead(currentSelection) {
      this.markingAsRead = true;

      try {
        await markAllAsRead(currentSelection);
        this.$emit('forceReload');
        this.markingAsRead = false;
      } catch (error) {
        this.markingAsRead = false;
        console.error('Error marking the current selection as read:', error);
        notifyActionError('Could not mark these articles as read. Please try again.', error);
      }
    },

    // This function starts a feed refresh and displays its progress.
    async refreshFeeds() {
      if (this.refreshing) return;

      this.refreshing = true;

      this.resetRefreshProgress();
      this.refreshProgress.visible = true;
      this.appendRefreshLog('Starting refresh...');

      try {
        const response = await startFeedRefresh();
        const jobId = response?.data?.jobId;
        const reused = Boolean(response?.data?.reused);

        if (!jobId) {
          throw new Error('Missing refresh job id');
        }

        if (reused) {
          this.appendRefreshLog('Resuming live updates for an already running refresh job.');
        }

        this.openRefreshEventStream(jobId);
      } catch (error) {
        this.appendRefreshLog('Live refresh unavailable. Falling back to standard refresh.');
        await this.fallbackRefresh(error);
      }
    },

    // This function stops the refresh progress indicator.
    refresh() {
      this.refreshing = false;
    },

    // This function clears the prior job's displayed refresh metrics.
    resetRefreshProgress() {
      this.refreshProgress.currentFeedLabel = 'Waiting to start...';
      this.refreshProgress.progressPercent = 0;
      this.refreshProgress.totalFeeds = 0;
      this.refreshProgress.processedFeeds = 0;
      this.refreshProgress.newArticles = 0;
      this.refreshProgress.errors = 0;
      this.refreshProgress.logs = [];
    },

    // This function adds one timestamped status line to the bounded progress log.
    appendRefreshLog(message) {
      const timestamp = new Date().toLocaleTimeString();
      this.refreshProgress.logs.unshift(`${timestamp} - ${message}`);
      this.refreshProgress.logs = this.refreshProgress.logs.slice(0, 8);
    },

    // This function applies a server progress event to the visible refresh metrics.
    updateProgressFromEvent(payload) {
      if (!payload || typeof payload !== 'object') return;

      const totalFeeds = Number(payload.totalFeeds || 0);
      const processedFeeds = Number(payload.processedFeeds || payload.currentFeed || 0);

      this.refreshProgress.totalFeeds = totalFeeds;
      this.refreshProgress.processedFeeds = processedFeeds;
      this.refreshProgress.newArticles = Number(payload.newArticles || 0);
      this.refreshProgress.errors = Number(payload.errors || 0);

      if (payload.feedName) {
        const currentFeed = Number(payload.currentFeed || processedFeeds || 0);
        this.refreshProgress.currentFeedLabel = `${payload.feedName} (${currentFeed}/${totalFeeds || '?'})`;
      } else if (totalFeeds > 0) {
        this.refreshProgress.currentFeedLabel = `${processedFeeds}/${totalFeeds} feeds`;
      }

      if (totalFeeds > 0) {
        this.refreshProgress.progressPercent = Math.min(100, Math.round((processedFeeds / totalFeeds) * 100));
      }
    },

    // This function connects the authenticated progress stream for the owned refresh job.
    openRefreshEventStream(jobId) {
      this.closeRefreshEventSource();

      const eventSource = openFeedRefreshEvents(jobId);
      this.refreshEventSource = eventSource;
      const streamGeneration = this.refreshStreamGeneration;

      // This handler applies each named refresh event and closes terminal streams.
      const handleEvent = event => {
        if (this.refreshStreamGeneration !== streamGeneration) return;

        try {
          const payload = JSON.parse(event.data || '{}');
          this.updateProgressFromEvent(payload);

          switch (event.type) {
            case 'refresh_started':
              this.appendRefreshLog(`Refresh started for ${payload.totalFeeds || 0} feeds.`);
              break;
            case 'feed_started':
              this.appendRefreshLog(`Started: ${payload.feedName || payload.feedId}`);
              break;
            case 'feed_parsed':
              this.appendRefreshLog(`Parsed ${payload.entries || 0} entries from ${payload.feedName || payload.feedId}.`);
              break;
            case 'articles_inserted_updated':
              this.appendRefreshLog(`Articles for ${payload.feedName || payload.feedId}: +${payload.feedNewArticles || 0} new, ${payload.feedUpdatedArticles || 0} updated.`);
              break;
            case 'feed_error':
              this.appendRefreshLog(`Error in ${payload.feedName || payload.feedId}: ${payload.message || 'unknown error'}`);
              break;
            case 'feed_completed':
              this.appendRefreshLog(`Completed: ${payload.feedName || payload.feedId}`);
              break;
            case 'done':
              this.appendRefreshLog('Refresh completed.');
              this.finishRefreshStream(true);
              break;
            case 'error':
              this.appendRefreshLog(payload.message || 'Refresh failed.');
              this.finishRefreshStream(false);
              break;
            default:
              break;
          }
        } catch (error) {
          this.appendRefreshLog('Received invalid progress payload.');
          console.log('Invalid SSE payload', error);
        }
      };

      // This handler reports when the active stream establishes a connection.
      eventSource.onopen = () => {
        if (this.refreshStreamGeneration === streamGeneration) {
          this.appendRefreshLog('Live connection established.');
        }
      };

      // This handler closes a disconnected stream without starting a duplicate crawl.
      eventSource.onerror = () => {
        if (this.refreshStreamGeneration !== streamGeneration) return;
        this.appendRefreshLog('Live updates disconnected.');
        // Do not trigger legacy crawl here because the job is already running.
        this.finishRefreshStream(false);
      };

      // This operation retains every listener registration for explicit teardown.
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
        this.refreshEventListeners.push({ type, handler: handleEvent });
      });
    },

    // This function falls back to the legacy refresh endpoint when live startup fails.
    async fallbackRefresh(error) {
      try {
        await triggerCrawl();
        // This callback leaves fallback progress visible long enough to read.
        this.fallbackRefreshTimer = setTimeout(() => {
          this.appendRefreshLog('Standard refresh completed.');
          this.refresh();
          this.refreshProgress.visible = false;
          this.fallbackRefreshTimer = null;
        }, 2000);
      } catch (fallbackError) {
        this.refreshing = false;
        this.refreshProgress.visible = false;
        const refreshError = fallbackError || error;
        console.error('Error refreshing feeds after stream fallback:', refreshError);
        notifyActionError('Could not refresh feeds. Please try again.', refreshError);
      }
    },

    // This function closes a terminal stream and refreshes article data after success.
    finishRefreshStream(success) {
      this.closeRefreshEventSource();

      // This callback briefly preserves the terminal progress state before hiding it.
      this.refreshCompletionTimer = setTimeout(() => {
        this.refreshing = false;
        this.refreshProgress.visible = false;
        this.refreshCompletionTimer = null;
        if (success) {
          this.$emit('forceReload');
        }
      }, 500);
    },

    // This function releases the current stream request and cancels reconnects.
    closeRefreshEventSource() {
      if (!this.refreshEventSource) return;

      const eventSource = this.refreshEventSource;
      // This operation unregisters every named callback from the active stream.
      this.refreshEventListeners.forEach(({ type, handler }) => {
        eventSource.removeEventListener?.(type, handler);
      });
      this.refreshEventListeners = [];
      eventSource.onopen = null;
      eventSource.onerror = null;
      eventSource.close();
      this.refreshEventSource = null;
      this.refreshStreamGeneration += 1;
    },

    // This function toggles a tag selection.
    selectTag(tagName) {
      this.selectionStore.setTag(this.selectionStore.currentSelection.tag === tagName ? '' : tagName);
    },

    // This function selects a smart folder.
    selectSmartFolder(smartFolder) {
      if (this.selectionStore.currentSelection.smartFolderId !== smartFolder.id) {
        this.selectionStore.setSmartFolder(smartFolder);
      }
    },

    // This function saves the current category order.
    updateSortOrder() {
      updateCategoryOrder(this.orderList)
        .then(response => console.log(response.status))
        .catch(error => {
          console.error('Error saving category order:', error);
          notifyActionError('Could not save the category order. Please try again.', error);
        });
    },

    // This function reconciles a drag result through the store before persisting its ID order.
    applyCategoryOrder(categories) {
      this.overviewStore.applyCategoryOrder(categories);
      this.updateSortOrder();
    },
    // This formats stored tag names for user-visible sidebar labels.
    formatTagName(tagName) {
      return formatTagName(tagName);
    }
  }
};
</script>
