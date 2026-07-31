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

      <div v-if="refreshProgress.visible" class="sidebar-refresh-progress-panel">
        <div class="sidebar-refresh-progress-header">
          <strong>Live refresh</strong>
          <span>{{ refreshProgress.currentFeedLabel }}</span>
        </div>
        <div class="sidebar-refresh-progress-bar">
          <div class="sidebar-refresh-progress-fill" :style="{ width: `${refreshProgress.progressPercent}%` }"></div>
        </div>
        <div class="sidebar-refresh-progress-stats">
          <span>Processed: {{ refreshProgress.processedFeeds }}/{{ refreshProgress.totalFeeds }}</span>
          <span>New: {{ refreshProgress.newArticles }}</span>
          <span>Errors: {{ refreshProgress.errors }}</span>
        </div>
        <ul class="sidebar-refresh-progress-logs">
          <li v-for="(line, index) in refreshProgress.logs" :key="`${line}-${index}`">{{ line }}</li>
        </ul>
      </div>

      <SidebarActionButton
        icon="plus-square-fill"
        label="Add new feed"
        variant="sidebar-button sidebar-button-add-feed"
        @select="$store.data.setShowModal('NewFeed')"
      />

      <SidebarActionButton
        icon="check-square-fill"
        label="Mark as read"
        variant="sidebar-button sidebar-button-mark-read"
        :loading="markingAsRead"
        @select="markAsRead($store.data.currentSelection)"
      />
    </div>

    <div v-if="$store.data.smartFolders.length" class="sidebar-section sidebar-smart-folders">
      <SidebarSectionTitle title="Smart Folders" />

      <SidebarNavItem
        v-for="smartFolder in $store.data.smartFolders"
        :key="smartFolder.id"
        icon="folder-fill"
        :title="smartFolder.name"
        :count="smartFolder.ArticleCount"
        :selected="$store.data.currentSelection.smartFolderId === smartFolder.id"
        row-class="sidebar-tag-item"
        @select="selectSmartFolder(smartFolder)"
      />
    </div>

    <div class="sidebar-section sidebar-status-filters">
      <SidebarSectionTitle title="All feeds" />

      <SidebarNavItem
        v-if="$store.data.unreadsSinceLastUpdate > 0"
        icon="lightbulb-fill"
        title="Click to refresh!"
        :count="$store.data.unreadsSinceLastUpdate"
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
        :selected="$store.data.currentSelection.status === filter.status && $store.data.currentSelection.smartFolderId === null"
        row-class="sidebar-status-item"
        @select="loadType(filter.status)"
      />
    </div>

    <div v-if="$store.data.topTags.length" class="sidebar-section sidebar-tags">
      <SidebarSectionTitle title="Top tags" />

      <SidebarNavItem
        v-for="tag in topTagsDisplay"
        :key="tag.name"
        icon="tag-fill"
        :title="`${formatTagName(tag.name)}`"
        :count="tag.count"
        :selected="$store.data.currentSelection.tag === tag.name"
        row-class="sidebar-tag-item"
        @select="selectTag(tag.name)"
      />
    </div>

    <div v-if="$store.data.currentSelection.status != 'hot'" class="sidebar-section sidebar-categories">
      <SidebarSectionTitle title="All" />

      <SidebarNavItem
        icon="collection-fill"
        title="Load all categories"
        :count="getStatusCount($store.data.currentSelection.status)"
        :selected="$store.data.currentSelection.categoryId === '%'"
        badge-class="sidebar-count-white"
        row-class="sidebar-all-categories-item"
        @select="loadAll"
      />

      <SidebarSectionTitle title="Categories" />

      <draggable
        :model-value="$store.data.categories"
        item-key="id"
        @update:model-value="applyCategoryOrder"
      >
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

      <div class="sidebar-footer-actions">
        <div class="sidebar-divider"></div>

        <div class="sidebar-management-actions">
          <SidebarActionButton
            icon="plus-circle-fill"
            label="Add category"
            variant="sidebar-button sidebar-bottom-action-button sidebar-add-button"
            @select="$store.data.setShowModal('NewCategory')"
          />

          <SidebarActionButton
            v-if="$store.data.currentSelection.categoryId !== '%' && $store.data.currentSelection.feedId == '%'"
            icon="trash3-fill"
            label="Delete category"
            variant="sidebar-button sidebar-bottom-action-button sidebar-delete-button"
            @select="$store.data.setShowModal('DeleteCategory')"
          />

          <SidebarActionButton
            v-if="$store.data.currentSelection.categoryId !== '%' && $store.data.currentSelection.feedId === '%'"
            icon="pencil-fill"
            label="Edit category"
            variant="sidebar-button sidebar-bottom-action-button sidebar-edit-button"
            @select="$store.data.setShowModal('RenameCategory')"
          />

          <SidebarActionButton
            v-if="$store.data.currentSelection.categoryId !== '%' && $store.data.currentSelection.feedId !== '%'"
            icon="trash3-fill"
            label="Delete feed"
            variant="sidebar-button sidebar-bottom-action-button sidebar-delete-button"
            @select="$store.data.setShowModal('DeleteFeed')"
          />

          <SidebarActionButton
            v-if="$store.data.currentSelection.categoryId != '%' && $store.data.currentSelection.feedId != '%'"
            icon="pencil-fill"
            label="Edit feed"
            variant="sidebar-button sidebar-bottom-action-button sidebar-edit-button"
            @select="$store.data.setShowModal('UpdateFeed')"
          />

          <template v-if="$store.data.currentSelection.categoryId === '%' && $store.data.currentSelection.feedId == '%'">
            <SidebarActionButton
              icon="trash"
              label="Cleanup articles"
              variant="sidebar-button sidebar-bottom-action-button sidebar-cleanup-button"
              @select="$store.data.setShowModal('Cleanup')"
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
        >RSSMonster v1.0.0</a>
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
  background-color: transparent;
  background-image: url('../assets/images/monster-ui-64.webp');
  background-image: image-set(
    url('../assets/images/monster-ui-64.webp') 1x,
    url('../assets/images/monster-ui-128.webp') 2x
  );
  background-position: 14px 14px;
  background-repeat: no-repeat;
  background-size: 60px 60px;
  height: 90px;
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
  margin: 0px 12px 20px;
  padding: 10px;
  border-radius: 8px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.sidebar-refresh-progress-header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 12px;
  margin-bottom: 8px;
}

.sidebar-refresh-progress-bar {
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: var(--scrollbar-track);
  overflow: hidden;
}

.sidebar-refresh-progress-fill {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.25s ease;
}

.sidebar-refresh-progress-stats {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 11px;
  margin-top: 8px;
}

.sidebar-refresh-progress-logs {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  max-height: 120px;
  overflow-y: auto;
  font-size: 11px;
  color: var(--text-muted);
}

.sidebar-refresh-progress-logs li {
  margin-bottom: 4px;
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
import { formatTagName } from '../utils/tags';
import { notifyActionError } from '../services/actionNotifications.js';

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
    draggable,
    SidebarActionButton,
    SidebarCategoryGroup,
    SidebarNavItem,
    SidebarSectionTitle
  },
  emits: ['forceReload'],
  // This initializes sidebar activity, refresh progress, and SSE cleanup state.
  data() {
    return {
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
    // This returns category IDs in their current drag order.
    orderList() {
      return this.$store.data.categories.map(category => category.id);
    },
    // This limits the sidebar to the five most frequent tags.
    topTagsDisplay() {
      return this.$store.data.topTags.slice(0, 5);
    },
    // This hides the Daily briefing filter when AI features are disabled.
    visibleStatusFilters() {
      return this.statusFilters.filter(
        filter => filter.status !== 'briefing' || this.$store.data.currentSelection.AIEnabled
      );
    }
  },
  // This loads supplemental sidebar navigation before the component mounts.
  beforeMount() {
    Promise.allSettled([
      this.$store.data.fetchTopTags(),
      this.$store.data.fetchSmartFolders()
    ]).catch(() => {});
  },
  // This closes live refresh resources and prevents delayed state updates after unmount.
  beforeUnmount() {
    this.closeRefreshEventSource();
    clearTimeout(this.refreshCompletionTimer);
    clearTimeout(this.fallbackRefreshTimer);
  },
  methods: {
    // This returns the count for a selected article status.
    getStatusCount(status) {
      return this.$store.data[`${status}Count`];
    },

    // This function returns an item's count for the selected article status.
    getItemStatusCount(item) {
      const status = this.$store.data.currentSelection.status;
      const count = item[`${status}Count`];
      return count === undefined ? null : count;
    },

    // This function clears the current authentication session.
    logout() {
      setAuthToken(null);
      this.$store.auth.setToken(null);
      this.$store.auth.setRole(null);
      Cookies.remove('token');
      location.reload();
    },

    // This function changes the selected article status.
    loadType(status) {
      console.log('%cLoading type:', 'color: red;', status);

      if (status === 'refresh') {
        this.$store.data.setSmartFolder(null);
        this.$emit('forceReload');
      } else if (status !== this.$store.data.currentSelection.status) {
        this.$store.data.setSelectedStatus(status);
      } else if (this.$store.data.currentSelection.smartFolderId !== null) {
        this.$store.data.setSelectedStatus(status);
      }
    },

    // This function selects a category and clears the selected feed.
    loadCategory(category) {
      this.$store.data.selectCategory(category.id);
    },

    // This function selects a feed.
    loadFeed(feed) {
      this.$store.data.selectFeed(feed.id, feed.categoryId);
    },

    // This function selects all categories and feeds.
    loadAll() {
      this.$store.data.selectCategory('%');
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
      this.$store.data.setTag(this.$store.data.currentSelection.tag === tagName ? '' : tagName);
    },

    // This function selects a smart folder.
    selectSmartFolder(smartFolder) {
      if (this.$store.data.currentSelection.smartFolderId !== smartFolder.id) {
        this.$store.data.setSmartFolder(smartFolder);
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
      this.$store.data.applyCategoryOrder(categories);
      this.updateSortOrder();
    },
    // This formats stored tag names for user-visible sidebar labels.
    formatTagName(tagName) {
      return formatTagName(tagName);
    }
  }
};
</script>
