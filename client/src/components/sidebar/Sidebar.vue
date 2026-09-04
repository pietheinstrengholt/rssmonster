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
        :key="filter.value"
        :icon="filter.icon"
        :icon-class="filter.iconClass"
        :title="filter.sidebarLabel || filter.label"
        :count="getStatusCount(filter.value)"
        :selected="selectionStore.currentSelection.status === filter.value && selectionStore.currentSelection.smartFolderId === null"
        row-class="sidebar-status-item"
        @select="loadType(filter.value)"
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
        >RSSMonster v2.2.0</a>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sidebar-scroll {
  background-color: var(--color-transparent);
  color: var(--text-primary);
  margin-left: var(--space-2);
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
  gap: var(--space-2);
  justify-content: space-between;
  margin: var(--space-2) var(--space-3);
}

.sidebar-resource-error button {
  background: var(--color-transparent);
  border: 0;
  color: var(--color-link);
  padding: 0;
}

.sidebar-category-heading {
  align-items: flex-end;
  display: flex;
  justify-content: space-between;
  padding-right: var(--space-3);
}

.sidebar-category-reorder-button {
  align-items: center;
  background: var(--color-transparent);
  border: 0;
  border-radius: var(--radius-compact);
  color: var(--text-secondary);
  display: inline-flex;
  font-size: 12px;
  gap: var(--space-1);
  margin-bottom: var(--space-1);
  padding: var(--space-0-5) var(--space-1);
}

.sidebar-category-reorder-button:hover,
.sidebar-category-reorder-button[aria-pressed='true'] {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.sidebar-category-reorder-button:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.sidebar-category-reorder-button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.sidebar-brand p {
  padding: 27px 0px 8px 78px;
  color: var(--sidebar-brand-text);
  font-size: 26px;
  font-weight: 600;
}

.sidebar-management-actions {
  margin: 0;
  width: 100%;
}

.sidebar-footer-actions {
  margin: var(--space-3) 0 var(--space-5);
  width: 100%;
}

.sidebar-divider {
  height: 1px;
  margin: 0 var(--space-3) var(--space-3);
  background-color: var(--border-subtle);
}

.sidebar-version-divider {
  margin-top: var(--space-1);
}

.sidebar-version {
  display: block;
  margin: 0 var(--space-3);
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
  margin: 0 var(--space-3) var(--space-5);
}

</style>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { useOverviewStore } from '../../store/overview.js';
import { useUiStore } from '../../store/ui.js';
import { useAuthStore } from '../../store/auth.js';
import { useFeedRefreshStore } from '../../store/feedRefresh.js';
import { markRaw } from 'vue';
import { markAllAsRead } from '../../api/articles';
import { updateCategoryOrder } from '../../api/manager';
import SidebarActionButton from './SidebarActionButton.vue';
import SidebarCategoryGroup from './SidebarCategoryGroup.vue';
import SidebarNavItem from './SidebarNavItem.vue';
import SidebarSectionTitle from './SidebarSectionTitle.vue';
import FeedRefreshProgress from '../shared/FeedRefreshProgress.vue';
import { formatTagName } from '../../utils/tags';
import { notifyActionError } from '../../services/actionNotifications.js';
import {
  SIDEBAR_STATUS_OPTIONS,
  getArticleStatusOption,
  getAvailableArticleOptions
} from '../../config/articleSelectionOptions.js';

export default {
  components: {
    FeedRefreshProgress,
    SidebarActionButton,
    SidebarCategoryGroup,
    SidebarNavItem,
    SidebarSectionTitle
  },
  emits: ['forceReload', 'logout'],
  // This initializes component-owned sidebar activity state.
  data() {
    return {
      categoryReorderComponent: null,
      categoryReordering: false,
      categoryReorderLoading: false,
      markingAsRead: false,
      statusFilters: SIDEBAR_STATUS_OPTIONS
    };
  },
  computed: {
    ...mapStores(useSelectionStore, useOverviewStore, useUiStore, useAuthStore, useFeedRefreshStore),
    // This exposes application-owned feed-refresh activity to the sidebar action.
    refreshing() {
      return this.feedRefreshStore.running;
    },
    // This exposes application-owned feed-refresh progress to the sidebar panel.
    refreshProgress() {
      return this.feedRefreshStore.progress;
    },
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
      const statusOption = getArticleStatusOption(this.selectionStore.currentSelection.status);
      const label = statusOption?.sidebarLabel || statusOption?.label;
      return label ? `Top tags in ${label}` : 'Top tags';
    },
    // This hides the Daily briefing filter when AI features are disabled.
    visibleStatusFilters() {
      return getAvailableArticleOptions(this.statusFilters, {
        aiEnabled: this.selectionStore.currentSelection.AIEnabled
      });
    }
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
        if (
          currentSelection.smartFolderId !== null &&
          currentSelection.smartFolderId !== undefined
        ) {
          await this.overviewStore.fetchSmartFolderCounts();
        }
        this.$emit('forceReload');
      } catch (error) {
        console.error('Error marking the current selection as read:', error);
        notifyActionError('Could not mark these articles as read. Please try again.', error);
      } finally {
        this.markingAsRead = false;
      }
    },

    // This function delegates feed-refresh application behavior to its domain store.
    refreshFeeds() {
      return this.feedRefreshStore.startRefresh();
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
