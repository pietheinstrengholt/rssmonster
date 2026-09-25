<template>
  <div class="sidebar-brand">
    <p>RSSMonster</p>
  </div>

  <div class="sidebar-scroll">
    <div class="sidebar-primary-actions">
      <SidebarActionButton
        icon="plus-square-fill"
        label="Add new feed"
        variant="sidebar-button sidebar-button-add-feed"
        @select="uiStore.setShowModal('NewFeed')"
      />

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

    <template v-for="section in uiStore.sidebarSectionOrder" :key="section">
      <section v-if="section === 'pinned' && (pinnedCategories.length || pinnedFeeds.length)" class="sidebar-section" aria-label="Pinned">
        <SidebarSectionTitle title="Pinned" icon="pin-angle-fill" />
        <SidebarCategoryGroup
          v-for="category in pinnedCategories"
          :key="`pinned-category-${category.id}`"
          :category="category"
          :selected-category-id="selectionStore.currentSelection.categoryId"
          :selected-feed-id="selectionStore.currentSelection.feedId"
          :count="getItemStatusCount(category)"
          :count-resolver="getItemStatusCount"
          shortcut
          @select-category="loadCategory"
        />
        <SidebarFeedItem
          v-for="feed in pinnedFeeds"
          :key="`pinned-feed-${feed.id}`"
          :feed="feed"
          :selected="selectionStore.currentSelection.feedId == feed.id"
          :count="getItemStatusCount(feed)"
          :show-feed-favicons="uiStore.sidebarSettings.showFeedFavicons"
          shortcut
          @select="loadFeed"
        />
      </section>

      <div v-if="section === 'smart-folders' && visibleSmartFolders.length" class="sidebar-section sidebar-smart-folders">
        <SidebarSectionTitle title="Smart Folders" />

        <SidebarNavItem
          v-for="smartFolder in visibleSmartFolders"
          :key="smartFolder.id"
          icon="folder-fill"
          :title="smartFolder.name"
          :count="smartFolder.ArticleCount"
          :selected="selectionStore.currentSelection.smartFolderId === smartFolder.id"
          row-class="sidebar-tag-item"
          @select="selectSmartFolder(smartFolder)"
        />
      </div>

      <div v-if="section === 'all-feeds'" class="sidebar-section sidebar-status-filters">
        <SidebarSectionTitle title="All feeds" />

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

      <div v-if="section === 'top-tags' && topTagsDisplay.length" class="sidebar-section sidebar-tags">
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

      <div v-if="section === 'categories'" class="sidebar-section sidebar-categories">
        <div class="sidebar-category-heading">
          <SidebarSectionTitle title="Categories" />
          <button
            type="button"
            class="sidebar-category-settings"
            aria-label="Sidebar configuration settings"
            title="Sidebar configuration settings"
            aria-haspopup="dialog"
            @click="uiStore.setShowModal('SidebarConfiguration')"
          >
            <BootstrapIcon class="sidebar-category-settings-icon" icon="sliders2" context="control" decorative />
          </button>
          <button
            v-if="isManualOrder && (visibleCategories.length > 1 || categoryReordering)"
            type="button"
            class="sidebar-category-reorder-button"
            :aria-pressed="categoryReordering"
            :disabled="categoryReorderLoading"
            @click="toggleCategoryReordering"
          >
            <BootstrapIcon :icon="categoryReordering ? 'check-lg' : 'grip-vertical'" context="control" aria-hidden="true" />
            {{ categoryReorderLoading ? 'Loading...' : categoryReordering ? 'Done' : 'Reorder' }}
          </button>
        </div>

        <SidebarNavItem
          v-if="isCountVisible(overviewStore[selectedCountField]) || visibleCategories.length || inactiveFeeds.length"
          icon="collection-fill"
          title="All categories"
          :count="getItemStatusCount(overviewStore)"
          :selected="selectionStore.currentSelection.categoryId === '%'"
          badge-class="sidebar-count-white"
          row-class="sidebar-all-categories-item"
          @select="loadAll"
        />

        <div v-if="!isManualOrder || !categoryReordering" class="sidebar-category-list">
          <SidebarCategoryGroup
            v-for="category in visibleCategories"
            :key="category.id"
            :category="category"
            :selected-category-id="selectionStore.currentSelection.categoryId"
            :selected-feed-id="selectionStore.currentSelection.feedId"
            :count="getItemStatusCount(category)"
            :count-resolver="getItemStatusCount"
            :show-feed-favicons="uiStore.sidebarSettings.showFeedFavicons"
            @select-category="loadCategory"
            @select-feed="loadFeed"
          />
        </div>

        <component
          :is="categoryReorderComponent"
          v-else
          class="sidebar-category-reorder-list"
          :model-value="visibleCategories"
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
              :show-feed-favicons="uiStore.sidebarSettings.showFeedFavicons"
              @select-category="loadCategory"
              @select-feed="loadFeed"
            />
          </template>
        </component>

        <SidebarCategoryGroup
          v-if="inactiveFeeds.length"
          :category="inactiveCategory"
          :selected-category-id="selectionStore.currentSelection.categoryId"
          :selected-feed-id="selectionStore.currentSelection.feedId"
          :count-resolver="getItemStatusCount"
          :show-feed-favicons="uiStore.sidebarSettings.showFeedFavicons"
          collapsible
          :expanded="inactiveFeedsExpanded"
          @toggle-expansion="inactiveFeedsExpanded = !inactiveFeedsExpanded"
          @select-feed="loadFeed"
        />
      </div>
    </template>

    <div class="sidebar-section">
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
            @select="uiStore.setShowModal('UpdateCategory')"
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
        >RSSMonster v2.3.0</a>
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
  align-items: center;
  display: flex;
  justify-content: space-between;
  padding-top: var(--space-3);
  padding-bottom: var(--space-1);
  padding-right: var(--space-3);
}

.sidebar-category-heading :deep(.sidebar-section-title) {
  margin-top: 0;
  margin-bottom: 0;
}

.sidebar-category-settings {
  align-items: center;
  background: var(--color-transparent);
  border: 0;
  border-radius: var(--radius-compact);
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  font: inherit;
  font-size: 12px;
  margin-left: auto;
  margin-right: var(--space-1);
  padding: var(--space-0-5) var(--space-1);
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
  padding: var(--space-0-5) var(--space-1);
}

.sidebar-category-settings:hover,
.sidebar-category-reorder-button:hover,
.sidebar-category-reorder-button[aria-pressed='true'] {
  background: var(--surface-hover);
  color: var(--text-primary);
}

.sidebar-category-settings:focus-visible,
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
import SidebarFeedItem from './SidebarFeedItem.vue';
import SidebarNavItem from './SidebarNavItem.vue';
import SidebarSectionTitle from './SidebarSectionTitle.vue';
import FeedRefreshProgress from '../shared/FeedRefreshProgress.vue';
import { formatCount } from './formatCount.js';
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
    SidebarFeedItem,
    SidebarNavItem,
    SidebarSectionTitle
  },
  emits: ['forceReload', 'logout'],
  // This initializes component-owned sidebar activity state.
  data() {
    return {
      categoryReorderComponent: null,
      categoryReordering: false,
      inactiveFeedsExpanded: false,
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
      return this.overviewStore.topTags.filter(tag => this.isCountVisible(tag.count)).slice(0, 5);
    },
    selectedCountField() {
      return `${this.selectionStore.currentSelection.status}Count`;
    },
    visibleSmartFolders() {
      return this.overviewStore.smartFolders.filter(folder => this.isCountVisible(folder.ArticleCount));
    },
    inactiveFeeds() {
      if (!this.uiStore.sidebarSettings.automaticallyHideInactiveFeeds) return [];
      const cutoff = Date.now() - this.uiStore.sidebarSettings.inactiveFeedDays * 86400000;
      return this.overviewStore.categories.flatMap(category => category.feeds || []).filter(feed => {
        const date = feed.lastArticleReceivedAt || feed.createdAt;
        return date && new Date(date).getTime() <= cutoff;
      });
    },
    inactiveCategory() {
      return { id: 'inactive-feeds', name: 'Inactive feeds', feeds: this.sortCategoryItems(this.inactiveFeeds) };
    },
    effectiveSortOrder() {
      const settings = this.uiStore.sidebarSettings;
      return settings.sortByCurrentSelection ? 'selectedCount' : settings.sortOrder || 'manual';
    },
    isManualOrder() {
      return this.effectiveSortOrder === 'manual';
    },
    sortedCategories() {
      return this.sortCategoryItems(this.overviewStore.categories, true).map(category => ({
        ...category,
        feeds: this.sortCategoryItems(category.feeds || [])
      }));
    },
    pinnedCategories() {
      return this.sortedCategories.filter(category => category.pinned);
    },
    pinnedFeeds() {
      return this.sortedCategories.flatMap(category => category.feeds).filter(feed => feed.pinned);
    },
    visibleCategories() {
      if (!this.uiStore.sidebarSettings.hideZeroCountItems && !this.uiStore.sidebarSettings.automaticallyHideInactiveFeeds) {
        return this.sortedCategories;
      }
      const inactiveIds = new Set(this.inactiveFeeds.map(feed => feed.id));
      return this.sortedCategories.map(category => ({
        ...category,
        feeds: (category.feeds || []).filter(feed => !inactiveIds.has(feed.id) && this.isCountVisible(feed[this.selectedCountField]))
      })).filter(category => this.uiStore.sidebarSettings.automaticallyHideInactiveFeeds
        ? category.feeds.length > 0
        : this.isCountVisible(category[this.selectedCountField]) || category.feeds.length);
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
  watch: {
    isManualOrder(manual) {
      if (!manual) this.categoryReordering = false;
    }
  },
  methods: {
    // Sort copies for display so automatic sorting never overwrites the saved manual order.
    sortCategoryItems(items, categories = false) {
      if (this.isManualOrder) return items;
      const order = this.effectiveSortOrder;
      const activity = feed => new Date(feed.lastArticleReceivedAt || 0).getTime() || 0;
      return items.map(item => {
        let value;
        if (order === 'name') value = (categories ? item.name : item.feedName) || '';
        else if (order === 'selectedCount') value = Number(item[this.selectedCountField] || 0);
        else if (order === 'totalCount') value = Number(item.unreadCount || 0) + Number(item.readCount || 0);
        else if (order === 'personalInterests') value = categories
          ? (item.feeds || []).reduce((sum, feed) => sum + Number(feed.sourceAffinity ?? 0), 0)
          : item.sourceAffinity == null ? null : Number(item.sourceAffinity);
        else value = categories
          ? (item.feeds || []).reduce((latest, feed) => Math.max(latest, activity(feed)), 0)
          : activity(item);
        return { item, value };
      }).sort((a, b) => order === 'name'
        ? a.value.localeCompare(b.value, undefined, { sensitivity: 'base', numeric: true })
        : order === 'personalInterests' && !categories && (a.value == null || b.value == null)
          ? (a.value == null) - (b.value == null)
        : b.value - a.value
      ).map(entry => entry.item);
    },

    // Unknown counts remain visible until they can be resolved.
    isCountVisible(count) {
      return !this.uiStore.sidebarSettings.hideZeroCountItems || count == null || Number(count) !== 0;
    },

    // This function loads drag-and-drop support only when category reordering is requested.
    async toggleCategoryReordering() {
      if (!this.isManualOrder) return;
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

      this.categoryReordering = this.isManualOrder;
    },
    // This returns the count for a selected article status.
    getStatusCount(status) {
      return this.overviewStore[`${status}Count`];
    },

    // This includes the total only when it adds information to the selected count.
    getItemStatusCount(item) {
      const status = this.selectionStore.currentSelection.status;
      const count = item[`${status}Count`];
      if (count === undefined) return null;
      const total = Number(item.unreadCount || 0) + Number(item.readCount || 0);
      const { showTotalCount, declutterCounts } = this.uiStore.sidebarSettings;
      if (!showTotalCount || (declutterCounts && (total <= 0 || total === Number(count)))) {
        return formatCount(count);
      }
      return `${formatCount(count)}/${formatCount(total)}`;
    },

    // This function delegates explicit logout to the root coordinated session reset.
    logout() {
      this.$emit('logout');
    },

    // This function changes the selected article status.
    loadType(status) {
      if (status !== this.selectionStore.currentSelection.status) {
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
      if (!this.isManualOrder) return;
      // Reorder visible slots without moving or dropping hidden categories and feeds.
      if (this.uiStore.sidebarSettings.hideZeroCountItems || this.uiStore.sidebarSettings.automaticallyHideInactiveFeeds) {
        const visibleIds = new Set(categories.map(category => category.id));
        let index = 0;
        categories = this.overviewStore.categories.map(category =>
          visibleIds.has(category.id) ? categories[index++] : category
        );
      }
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
