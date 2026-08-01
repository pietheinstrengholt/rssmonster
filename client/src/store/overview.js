import { defineStore } from 'pinia';
import {
  fetchSmartFolders as fetchSmartFoldersAPI,
  fetchSmartFolderCounts as fetchSmartFolderCountsAPI
} from '../api/smartfolders';
import { fetchTopTags as fetchTopTagsAPI } from '../api/tags';
import {
  fetchOverview as fetchOverviewAPI,
  fetchOverviewLite as fetchOverviewLiteAPI,
  fetchOverviewCounts as fetchOverviewCountsAPI
} from '../api/manager';
import { normalizeResourceError } from './resourceState.js';
import { useSelectionStore } from './selection.js';
import { useUiStore } from './ui.js';

const COUNT_FIELDS = [
  'briefingCount',
  'unreadCount',
  'readCount',
  'favoriteCount',
  'hotCount',
  'clickedCount'
];
const OVERVIEW_COUNT_FIELDS = [...COUNT_FIELDS];

// This function compares identifiers consistently across numeric API data and string selections.
const idsMatch = (left, right) => String(left) === String(right);

// This function converts count values to nonnegative finite numbers.
const normalizeCount = value => Math.max(Number(value) || 0, 0);

// This function fills missing feed counters without discarding API fields.
const normalizeFeed = (feed = {}) => ({
  ...feed,
  briefingCount: normalizeCount(feed.briefingCount),
  unreadCount: normalizeCount(feed.unreadCount),
  readCount: normalizeCount(feed.readCount),
  favoriteCount: normalizeCount(feed.favoriteCount),
  hotCount: normalizeCount(feed.hotCount),
  clickedCount: normalizeCount(feed.clickedCount),
  errorCount: normalizeCount(feed.errorCount)
});

// This function fills missing category collections and counters without discarding API fields.
const normalizeCategory = (category = {}) => ({
  ...category,
  briefingCount: normalizeCount(category.briefingCount),
  unreadCount: normalizeCount(category.unreadCount),
  readCount: normalizeCount(category.readCount),
  favoriteCount: normalizeCount(category.favoriteCount),
  hotCount: normalizeCount(category.hotCount),
  clickedCount: normalizeCount(category.clickedCount),
  feeds: (category.feeds || []).map(normalizeFeed)
});

// This function normalizes every category in an overview response.
const normalizeCategories = categories => (categories || []).map(normalizeCategory);

// This function merges count-free structure onto the last authoritative category and feed counts.
const mergeOverviewStructure = (categories, existingCategories) => {
  const categoryCounts = new Map(
    existingCategories.map(category => [String(category.id), category])
  );
  const feedCounts = new Map(
    existingCategories.flatMap(category =>
      (category.feeds || []).map(feed => [String(feed.id), feed])
    )
  );

  return (categories || []).map(category => {
    const existingCategory = categoryCounts.get(String(category.id));
    const mergedCategory = { ...category };
    for (const field of OVERVIEW_COUNT_FIELDS) {
      mergedCategory[field] = normalizeCount(existingCategory?.[field]);
    }
    mergedCategory.feeds = (category.feeds || []).map(feed => {
      const existingFeed = feedCounts.get(String(feed.id));
      const mergedFeed = { ...feed };
      for (const field of OVERVIEW_COUNT_FIELDS) {
        mergedFeed[field] = normalizeCount(existingFeed?.[field]);
      }
      return mergedFeed;
    });
    return normalizeCategory(mergedCategory);
  });
};

// This function creates navigation, counter, and resource state for one user session.
const initialOverviewState = () => ({
  categories: [],
  smartFolders: [],
  topTags: [],
  briefingCount: 0,
  unreadCount: 0,
  readCount: 0,
  favoriteCount: 0,
  hotCount: 0,
  clickedCount: 0,
  unreadsSinceLastUpdate: 0,
  overviewStructureStatus: 'idle',
  overviewStructureError: null,
  overviewStructureRequestId: 0,
  overviewCountsStatus: 'idle',
  overviewCountsError: null,
  overviewCountsRequestId: 0,
  smartFoldersStatus: 'idle',
  smartFoldersError: null,
  smartFoldersRequestId: 0,
  smartFolderCountsStatus: 'idle',
  smartFolderCountsError: null,
  smartFolderCountsRequestId: 0,
  topTagsStatus: 'idle',
  topTagsError: null,
  topTagsRequestId: 0,
  topTagsScopeStatus: null
});

export const useOverviewStore = defineStore('overview', {
  // This state owns overview structure, navigation metadata, and article counters.
  state: initialOverviewState,

  getters: {
    // This getter exposes a display-safe magnitude for newly discovered unread articles.
    normalizedUnreadsSinceLastUpdate: state =>
      Math.trunc(Math.abs(Number(state.unreadsSinceLastUpdate) || 0)),

    // This getter resolves the selected category from selection-owned navigation state.
    selectedCategory(state) {
      const id = Number(useSelectionStore().currentSelection.categoryId);
      return Number.isFinite(id)
        ? state.categories.find(category => idsMatch(category.id, id)) || null
        : null;
    },

    // This getter resolves the selected feed from selection-owned navigation state.
    selectedFeedDetails(state) {
      const selection = useSelectionStore().currentSelection;
      const categoryId = Number(selection.categoryId);
      const feedId = Number(selection.feedId);
      if (!Number.isFinite(categoryId) || !Number.isFinite(feedId)) return null;

      const category = state.categories.find(item => idsMatch(item.id, categoryId));
      const feed = category?.feeds?.find(item => idsMatch(item.id, feedId));
      return feed ? { feed } : null;
    }
  },

  actions: {
    // This action makes every overview resource request from the previous session obsolete.
    invalidateSessionRequests() {
      this.overviewStructureRequestId++;
      this.overviewCountsRequestId++;
      this.smartFoldersRequestId++;
      this.smartFolderCountsRequestId++;
      this.topTagsRequestId++;
    },

    // This action clears user overview data and resource state while retaining invalidation generations.
    resetSessionState() {
      const requestIds = {
        overviewStructureRequestId: this.overviewStructureRequestId,
        overviewCountsRequestId: this.overviewCountsRequestId,
        smartFoldersRequestId: this.smartFoldersRequestId,
        smartFolderCountsRequestId: this.smartFolderCountsRequestId,
        topTagsRequestId: this.topTagsRequestId
      };
      this.$patch({
        ...initialOverviewState(),
        ...requestIds
      });
    },

    // This action fetches a full overview for the current normalized selection.
    async fetchOverview({ initial = false, forceUpdate = false } = {}) {
      const structureRequestId = ++this.overviewStructureRequestId;
      const countsRequestId = ++this.overviewCountsRequestId;
      const topTagsRequestId = this.topTagsRequestId;
      const selectionStore = useSelectionStore();
      this.overviewStructureStatus = 'loading';
      this.overviewStructureError = null;
      this.overviewCountsStatus = 'loading';
      this.overviewCountsError = null;

      try {
        if (initial) {
          await selectionStore.fetchSettings();
          if (structureRequestId !== this.overviewStructureRequestId) return false;
          if (topTagsRequestId === this.topTagsRequestId) {
            void this.fetchTopTags();
          }
        }
        const { data } = await fetchOverviewAPI(selectionStore.currentSelection);

        if (structureRequestId === this.overviewStructureRequestId) {
          this.updateOverviewStructure(data, { initial, forceUpdate });
          this.overviewStructureStatus = 'success';
        }
        if (countsRequestId === this.overviewCountsRequestId) {
          this.updateOverviewCounts(data, { initial, forceUpdate });
          this.overviewCountsStatus = 'success';
        }
      } catch (error) {
        if (structureRequestId === this.overviewStructureRequestId) {
          this.overviewStructureStatus = 'error';
          this.overviewStructureError = normalizeResourceError(error);
        }
        if (countsRequestId === this.overviewCountsRequestId) {
          this.overviewCountsStatus = 'error';
          this.overviewCountsError = normalizeResourceError(error);
        }
        throw error;
      }
    },

    // This action publishes overview structure before protected background counter updates.
    async fetchOverviewSplit({ initial = false, forceUpdate = false } = {}) {
      const requestId = ++this.overviewStructureRequestId;
      ++this.overviewCountsRequestId;
      const topTagsRequestId = this.topTagsRequestId;
      const selectionStore = useSelectionStore();
      this.overviewStructureStatus = 'loading';
      this.overviewStructureError = null;
      this.overviewCountsStatus = 'idle';
      this.overviewCountsError = null;

      try {
        if (initial) {
          await selectionStore.fetchSettings();
          if (requestId !== this.overviewStructureRequestId) return false;
          if (topTagsRequestId === this.topTagsRequestId) {
            void this.fetchTopTags();
          }
        }
        if (requestId !== this.overviewStructureRequestId) return false;

        const { data } = await fetchOverviewLiteAPI();
        if (requestId !== this.overviewStructureRequestId) return false;

        this.updateOverviewStructure(data, { initial, forceUpdate });
        this.overviewStructureStatus = 'success';
        void this.fetchOverviewCounts({ initial, forceUpdate });
        return true;
      } catch (error) {
        if (requestId === this.overviewStructureRequestId) {
          this.overviewStructureStatus = 'error';
          this.overviewStructureError = normalizeResourceError(error);
        }
        throw error;
      }
    },

    // This action replaces overview structure and counters from one complete response.
    updateOverview(
      {
        briefingCount,
        briefingSelectionPeriod,
        briefingIncludeOnlyUnreadArticles,
        briefingPrioritizeHighTrust,
        unreadCount,
        readCount,
        favoriteCount,
        hotCount,
        clickedCount,
        categories
      },
      { initial = false, forceUpdate = false } = {}
    ) {
      const previousUnreadCount = this.unreadCount;

      this.briefingCount = briefingCount ?? this.briefingCount;
      useSelectionStore().setBriefingFilters({
        selectionPeriod: briefingSelectionPeriod
          ?? useSelectionStore().briefingSelectionPeriod,
        includeOnlyUnreadArticles: briefingIncludeOnlyUnreadArticles
          ?? useSelectionStore().briefingIncludeOnlyUnreadArticles,
        prioritizeHighTrust: briefingPrioritizeHighTrust
          ?? useSelectionStore().briefingPrioritizeHighTrust
      });
      this.unreadCount = unreadCount;
      this.readCount = readCount;
      this.favoriteCount = favoriteCount;
      this.hotCount = hotCount;
      this.clickedCount = clickedCount;
      this.categories = normalizeCategories(categories);
      useUiStore().setChatAssistantOpen(false);

      if (initial || forceUpdate) {
        this.unreadsSinceLastUpdate = 0;
        return;
      }

      this.unreadsSinceLastUpdate = unreadCount - previousUnreadCount;
    },

    // This action replaces overview structure without disturbing existing counters.
    updateOverviewStructure(
      { categories },
      { initial = false, forceUpdate = false } = {}
    ) {
      this.categories = mergeOverviewStructure(categories, this.categories);
      useUiStore().setChatAssistantOpen(false);

      if (initial || forceUpdate) {
        this.unreadsSinceLastUpdate = 0;
      }
    },

    // This action replaces protected overview counters and their normalized category snapshot.
    updateOverviewCounts(
      {
        briefingCount,
        briefingSelectionPeriod,
        briefingIncludeOnlyUnreadArticles,
        briefingPrioritizeHighTrust,
        unreadCount,
        readCount,
        favoriteCount,
        hotCount,
        clickedCount,
        categories
      },
      { initial = false, forceUpdate = false } = {}
    ) {
      const previousUnreadCount = this.unreadCount;
      const selectionStore = useSelectionStore();

      this.briefingCount = briefingCount ?? this.briefingCount;
      selectionStore.setBriefingFilters({
        selectionPeriod: briefingSelectionPeriod ?? selectionStore.briefingSelectionPeriod,
        includeOnlyUnreadArticles: briefingIncludeOnlyUnreadArticles
          ?? selectionStore.briefingIncludeOnlyUnreadArticles,
        prioritizeHighTrust: briefingPrioritizeHighTrust
          ?? selectionStore.briefingPrioritizeHighTrust
      });
      this.unreadCount = unreadCount;
      this.readCount = readCount;
      this.favoriteCount = favoriteCount;
      this.hotCount = hotCount;
      this.clickedCount = clickedCount;
      this.categories = normalizeCategories(categories);
      useUiStore().setChatAssistantOpen(false);

      if (initial || forceUpdate) {
        this.unreadsSinceLastUpdate = 0;
        return;
      }

      this.unreadsSinceLastUpdate = unreadCount - previousUnreadCount;
    },

    // This action fetches smart-folder structure with request-ordered background counts.
    async fetchSmartFolders() {
      const requestId = ++this.smartFoldersRequestId;
      ++this.smartFolderCountsRequestId;
      this.smartFoldersStatus = 'loading';
      this.smartFoldersError = null;
      this.smartFolderCountsStatus = 'idle';
      this.smartFolderCountsError = null;

      try {
        const { data } = await fetchSmartFoldersAPI();
        if (requestId !== this.smartFoldersRequestId) return false;

        this.smartFolders = (data.smartFolders || []).map(folder => ({
          ...folder,
          ArticleCount: folder.ArticleCount ?? 0
        }));
        this.smartFoldersStatus = 'success';
        void this.fetchSmartFolderCounts();
        return true;
      } catch (error) {
        if (requestId === this.smartFoldersRequestId) {
          this.smartFoldersStatus = 'error';
          this.smartFoldersError = normalizeResourceError(error);
        }
        throw error;
      }
    },

    // This action refreshes Smart Folder counts without hiding cached folders.
    async fetchSmartFolderCounts() {
      const requestId = ++this.smartFolderCountsRequestId;
      this.smartFolderCountsStatus = 'loading';
      this.smartFolderCountsError = null;

      try {
        const { data } = await fetchSmartFolderCountsAPI();
        if (requestId !== this.smartFolderCountsRequestId) return false;

        const countMap = new Map(
          (data.smartFolders || []).map(folder => [folder.id, folder.ArticleCount ?? 0])
        );
        this.smartFolders = this.smartFolders.map(folder => ({
            ...folder,
            ArticleCount: countMap.get(folder.id) ?? folder.ArticleCount ?? 0
        }));
        this.smartFolderCountsStatus = 'success';
        return true;
      } catch (error) {
        if (requestId === this.smartFolderCountsRequestId) {
          this.smartFolderCountsStatus = 'error';
          this.smartFolderCountsError = normalizeResourceError(error);
        }
        return false;
      }
    },

    // This action fetches top tags for the active selection grouping.
    async fetchTopTags() {
      const requestId = ++this.topTagsRequestId;
      this.topTagsStatus = 'loading';
      this.topTagsError = null;
      const selection = useSelectionStore().currentSelection;

      if (this.topTagsScopeStatus !== selection.status) {
        this.topTags = [];
        this.topTagsScopeStatus = selection.status;
      }

      if (!['briefing', 'unread', 'read', 'favorite', 'hot', 'clicked'].includes(selection.status)) {
        this.topTags = [];
        this.topTagsStatus = 'success';
        return true;
      }

      try {
        const { data } = await fetchTopTagsAPI({
          grouping: selection.grouping,
          status: selection.status
        });
        if (requestId !== this.topTagsRequestId) return false;

        this.topTags = data.tags || [];
        this.topTagsStatus = 'success';
        return true;
      } catch (error) {
        if (requestId === this.topTagsRequestId) {
          this.topTagsStatus = 'error';
          this.topTagsError = normalizeResourceError(error);
        }
        return false;
      }
    },

    // This action retries sidebar counts through the resource-owned status contract.
    async refreshOverviewCounts() {
      return this.fetchOverviewCounts({ forceUpdate: true });
    },

    // This action refreshes overview counts while preserving the last successful snapshot.
    async fetchOverviewCounts({ initial = false, forceUpdate = false } = {}) {
      const requestId = ++this.overviewCountsRequestId;
      const selectionStore = useSelectionStore();
      this.overviewCountsStatus = 'loading';
      this.overviewCountsError = null;

      try {
        const { data } = await fetchOverviewCountsAPI(selectionStore.currentSelection);
        if (requestId !== this.overviewCountsRequestId) return false;

        this.updateOverviewCounts(data, { initial, forceUpdate });
        this.overviewCountsStatus = 'success';
        return true;
      } catch (error) {
        if (requestId === this.overviewCountsRequestId) {
          this.overviewCountsStatus = 'error';
          this.overviewCountsError = normalizeResourceError(error);
        }
        return false;
      }
    },

    // This action reconciles one favorite transition across global, category, and feed counts.
    applyFavoriteDelta({ categoryId, feedId, delta }) {
      const safeDelta = Number(delta) || 0;
      if (!safeDelta) return;

      this.favoriteCount = normalizeCount(this.favoriteCount + safeDelta);
      const category = this.categories.find(item => idsMatch(item.id, categoryId));
      if (!category) return;

      category.favoriteCount = normalizeCount(category.favoriteCount + safeDelta);
      const feed = category.feeds.find(item => idsMatch(item.id, feedId));
      if (feed) {
        feed.favoriteCount = normalizeCount(feed.favoriteCount + safeDelta);
      }
    },

    // This compatibility action changes only the global favorite total.
    increaseFavoriteCount() {
      this.favoriteCount = normalizeCount(this.favoriteCount + 1);
    },

    // This compatibility action changes only the global favorite total.
    decreaseFavoriteCount() {
      this.favoriteCount = normalizeCount(this.favoriteCount - 1);
    },

    // This action adds a normalized category returned by the API.
    addCategory(category) {
      const normalized = normalizeCategory(category);
      const existingIndex = this.categories.findIndex(item => idsMatch(item.id, normalized.id));
      if (existingIndex === -1) {
        this.categories.push(normalized);
      } else {
        this.categories.splice(existingIndex, 1, normalized);
      }
      return normalized;
    },

    // This action updates a stored category's API-backed display fields.
    updateCategory(categoryId, category = {}) {
      const stored = this.categories.find(item => idsMatch(item.id, categoryId));
      if (!stored) return false;

      if (category.name !== undefined) stored.name = category.name;
      if (category.iconName !== undefined) stored.iconName = category.iconName;
      return true;
    },

    // This action removes a category and reconciles its contribution to global counts.
    removeCategory(categoryId) {
      const index = this.categories.findIndex(item => idsMatch(item.id, categoryId));
      if (index === -1) return false;

      const [removed] = this.categories.splice(index, 1);
      for (const field of COUNT_FIELDS) {
        this[field] = normalizeCount(this[field] - normalizeCount(removed[field]));
      }
      return true;
    },

    // This action applies either an ordered category list or an ordered list of category IDs.
    applyCategoryOrder(order = []) {
      const orderedIds = order.map(item => (
        typeof item === 'object' && item !== null ? item.id : item
      ));
      const ordered = orderedIds
        .map(id => this.categories.find(category => idsMatch(category.id, id)))
        .filter(Boolean);
      const includedIds = new Set(ordered.map(category => String(category.id)));
      this.categories = [
        ...ordered,
        ...this.categories.filter(category => !includedIds.has(String(category.id)))
      ];
    },

    // This action adds a normalized feed to an existing category.
    addFeed(categoryId, feed) {
      const category = this.categories.find(item => idsMatch(item.id, categoryId));
      if (!category) return false;

      const normalized = normalizeFeed({ ...feed, categoryId: feed?.categoryId ?? category.id });
      const existingIndex = category.feeds.findIndex(item => idsMatch(item.id, normalized.id));
      if (existingIndex === -1) {
        category.feeds.push(normalized);
      } else {
        category.feeds.splice(existingIndex, 1, normalized);
      }
      return true;
    },

    // This action updates or atomically moves a stored feed using an API response.
    updateFeed(feed) {
      const sourceCategory = this.categories.find(category =>
        category.feeds.some(item => idsMatch(item.id, feed?.id))
      );
      const storedFeed = sourceCategory?.feeds.find(item => idsMatch(item.id, feed?.id));
      if (!sourceCategory || !storedFeed) return false;

      const destinationCategory = this.categories.find(category =>
        idsMatch(category.id, feed.categoryId ?? sourceCategory.id)
      );
      if (!destinationCategory) return false;

      if (!idsMatch(sourceCategory.id, destinationCategory.id)) {
        return this.moveFeed(feed.id, destinationCategory.id, feed);
      }

      Object.assign(storedFeed, normalizeFeed({ ...storedFeed, ...feed }));
      return true;
    },

    // This action moves a feed and its counters between existing categories atomically.
    moveFeed(feedId, destinationCategoryId, updates = {}) {
      const sourceCategory = this.categories.find(category =>
        category.feeds.some(item => idsMatch(item.id, feedId))
      );
      const storedFeed = sourceCategory?.feeds.find(item => idsMatch(item.id, feedId));
      const destinationCategory = this.categories.find(category =>
        idsMatch(category.id, destinationCategoryId)
      );
      if (!sourceCategory || !storedFeed || !destinationCategory) return false;

      const updatedFeed = normalizeFeed({
        ...storedFeed,
        ...updates,
        categoryId: updates.categoryId ?? destinationCategory.id
      });
      if (idsMatch(sourceCategory.id, destinationCategory.id)) {
        Object.assign(storedFeed, updatedFeed);
        return true;
      }

      for (const field of COUNT_FIELDS) {
        sourceCategory[field] = normalizeCount(sourceCategory[field] - updatedFeed[field]);
        destinationCategory[field] = normalizeCount(destinationCategory[field] + updatedFeed[field]);
      }
      sourceCategory.feeds = sourceCategory.feeds.filter(item => !idsMatch(item.id, updatedFeed.id));
      destinationCategory.feeds.push(updatedFeed);
      return true;
    },

    // This action removes a feed and reconciles category and global counts.
    removeFeed(feedId) {
      const category = this.categories.find(item =>
        item.feeds.some(feed => idsMatch(feed.id, feedId))
      );
      if (!category) return false;

      const feedIndex = category.feeds.findIndex(feed => idsMatch(feed.id, feedId));
      const [removed] = category.feeds.splice(feedIndex, 1);
      for (const field of COUNT_FIELDS) {
        const count = normalizeCount(removed[field]);
        category[field] = normalizeCount(category[field] - count);
        this[field] = normalizeCount(this[field] - count);
      }
      return true;
    },

    // This action reconciles an unread-to-read transition across owned counters.
    increaseReadCount(article) {
      const category = this.categories.find(
        item => item.id === article.feed.categoryId
      );
      if (!category) {
        console.warn('[increaseReadCount] Category not found for categoryId:', article.feed.categoryId);
        return;
      }

      const feed = category.feeds?.find(item => item.id === article.feedId);
      if (!feed) {
        console.warn('[increaseReadCount] Feed not found for feedId:', article.feedId);
        return;
      }

      if (category.unreadCount > 0) {
        category.unreadCount--;
        category.readCount++;
      }
      if (feed.unreadCount > 0) {
        feed.unreadCount--;
        feed.readCount++;
      }
      if (this.unreadCount > 0) {
        this.unreadCount--;
        this.readCount++;
      }
    },

    // This action reconciles a read-to-unread transition across owned counters.
    decreaseReadCount(article) {
      const category = this.categories.find(
        item => item.id === article.feed.categoryId
      );
      if (!category) {
        console.warn('[decreaseReadCount] Category not found for categoryId:', article.feed.categoryId);
        return;
      }

      const feed = category.feeds?.find(item => item.id === article.feedId);
      if (!feed) {
        console.warn('[decreaseReadCount] Feed not found for feedId:', article.feedId);
        return;
      }

      if (category.readCount > 0) {
        category.readCount--;
        category.unreadCount++;
      }
      if (feed.readCount > 0) {
        feed.readCount--;
        feed.unreadCount++;
      }
      if (this.readCount > 0) {
        this.readCount--;
        this.unreadCount++;
      }
    }
  }
});
