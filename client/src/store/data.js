// client/src/store/data.js
import { defineStore } from 'pinia';
import { fetchSettings as fetchSettingsAPI } from '../api/settings';
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

const DEFAULT_BRIEFING_SELECTION_PERIOD = '7d';
const COUNT_FIELDS = ['unreadCount', 'readCount', 'favoriteCount'];

// This function compares identifiers consistently across numeric API data and string selections.
const idsMatch = (left, right) => String(left) === String(right);

// This function converts count values to nonnegative finite numbers.
const normalizeCount = value => Math.max(Number(value) || 0, 0);

// This function fills missing feed counters without discarding API fields.
const normalizeFeed = (feed = {}) => ({
  ...feed,
  unreadCount: normalizeCount(feed.unreadCount),
  readCount: normalizeCount(feed.readCount),
  favoriteCount: normalizeCount(feed.favoriteCount),
  errorCount: normalizeCount(feed.errorCount)
});

// This function fills missing category collections and counters without discarding API fields.
const normalizeCategory = (category = {}) => ({
  ...category,
  unreadCount: normalizeCount(category.unreadCount),
  readCount: normalizeCount(category.readCount),
  favoriteCount: normalizeCount(category.favoriteCount),
  feeds: (category.feeds || []).map(normalizeFeed)
});

// This function normalizes every category in an overview response.
const normalizeCategories = categories => (categories || []).map(normalizeCategory);

// This function maps a stored Briefing period to the existing article date filters.
const briefingDateFilter = selectionPeriod => (
  selectionPeriod === '24h' ? '@today' : '@lastweek'
);

// This function builds the existing article-search query for configured Briefing filters.
const briefingSearchQuery = ({
  selectionPeriod,
  includeOnlyUnreadArticles,
  prioritizeHighTrust
}) => [
  'briefing:true',
  includeOnlyUnreadArticles ? 'unread:true' : null,
  briefingDateFilter(selectionPeriod),
  prioritizeHighTrust ? 'sort:trust' : null
].filter(Boolean).join(' ');

const defaultSelection = () => ({
  status: 'unread',
  categoryId: '%',
  feedId: '%',
  search: null,
  tag: null,
  smartFolderId: null,
  minAdvertisementScore: 0,
  minSentimentScore: 0,
  minQualityScore: 0,
  sort: 'desc',
  viewMode: 'full',
  grouping: 'none',
  includeDevelopingEvents: false,
  briefingRevision: 0
});

const normalizeSort = value => {
  const normalized = String(value ?? 'desc').toLowerCase();
  return ['asc', 'desc', 'trust', 'recommended', 'quality', 'attention'].includes(normalized)
    ? normalized
    : 'desc';
};

const removeSortTokens = query => {
  if (!query || !/(^|[\s,])sort:/i.test(query)) return query;

  const cleaned = String(query)
    .split(/([\s,]+)/)
    .filter(part => !/^sort:(desc|asc|trust|recommended|quality|attention)[.,;]*$/i.test(part.trim()))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned || null;
};

const normalizeGrouping = value => {
  const normalized = String(value ?? 'none');
  if (normalized === 'event') return 'event';
  if (normalized === 'topic') return 'topic';
  return 'none';
};

export const useStore = defineStore('data', {
  state: () => ({
    currentSelection: defaultSelection(),
    categories: [],
    smartFolders: [],
    topTags: [],

    briefingCount: 0,
    briefingSelectionPeriod: DEFAULT_BRIEFING_SELECTION_PERIOD,
    briefingIncludeOnlyUnreadArticles: false,
    briefingPrioritizeHighTrust: false,
    includeDevelopingEvents: false,
    unreadCount: 0,
    readCount: 0,
    favoriteCount: 0,
    hotCount: 0,
    clickedCount: 0,

    unreadsSinceLastUpdate: 0,
    refreshCategories: 0,

    showModal: false,
    chatAssistantOpen: false,
    mobileSearchOpen: false,
    searchQuery: '',
    themeMode: null,

    fatalError: null,
    overviewRequestId: 0,
    smartFolderRequestId: 0
  }),

  actions: {
    /* --------------------------------------------------
     * Overview + settings
     * -------------------------------------------------- */

    async fetchSettings() {
      const { data } = await fetchSettingsAPI();
      this.themeMode = data.themeMode;
      this.setCurrentSelection(data);
    },

    // This function records the user's selected color theme mode.
    setThemeMode(themeMode) {
      this.themeMode = themeMode;
    },

    async fetchOverview({ initial = false, forceUpdate = false } = {}) {
      if (initial) await this.fetchSettings();

      const { data } = await fetchOverviewAPI(this.currentSelection);
      this.updateOverview(data, { initial, forceUpdate });
    },

    async fetchOverviewSplit({ initial = false, forceUpdate = false } = {}) {
      const requestId = ++this.overviewRequestId;

      if (initial) await this.fetchSettings();
      if (requestId !== this.overviewRequestId) return;

      const { data } = await fetchOverviewLiteAPI();
      if (requestId !== this.overviewRequestId) return;

      this.updateOverviewStructure(data, { initial, forceUpdate });

      void fetchOverviewCountsAPI(this.currentSelection)
        .then(({ data: countsData }) => {
          if (requestId !== this.overviewRequestId) return;
          this.updateOverviewCounts(countsData, { initial, forceUpdate });
        })
        .catch(err => {
          if (import.meta.env.DEV) {
            console.warn('Overview counts refresh failed', err);
          }
        });
    },

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
      this.setBriefingFilters({
        selectionPeriod: briefingSelectionPeriod ?? this.briefingSelectionPeriod,
        includeOnlyUnreadArticles: briefingIncludeOnlyUnreadArticles
          ?? this.briefingIncludeOnlyUnreadArticles,
        prioritizeHighTrust: briefingPrioritizeHighTrust
          ?? this.briefingPrioritizeHighTrust
      });
      this.unreadCount = unreadCount;
      this.readCount = readCount;
      this.favoriteCount = favoriteCount;
      this.hotCount = hotCount;
      this.clickedCount = clickedCount;
      this.categories = normalizeCategories(categories);
      this.chatAssistantOpen = false;

      if (initial || forceUpdate) {
        this.unreadsSinceLastUpdate = 0;
        return;
      }

      this.unreadsSinceLastUpdate = unreadCount - previousUnreadCount;
    },

    updateOverviewStructure(
      { categories },
      { initial = false, forceUpdate = false } = {}
    ) {
      this.categories = normalizeCategories(categories);
      this.chatAssistantOpen = false;

      if (initial || forceUpdate) {
        this.unreadsSinceLastUpdate = 0;
      }
    },

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

      this.briefingCount = briefingCount ?? this.briefingCount;
      this.setBriefingFilters({
        selectionPeriod: briefingSelectionPeriod ?? this.briefingSelectionPeriod,
        includeOnlyUnreadArticles: briefingIncludeOnlyUnreadArticles
          ?? this.briefingIncludeOnlyUnreadArticles,
        prioritizeHighTrust: briefingPrioritizeHighTrust
          ?? this.briefingPrioritizeHighTrust
      });
      this.unreadCount = unreadCount;
      this.readCount = readCount;
      this.favoriteCount = favoriteCount;
      this.hotCount = hotCount;
      this.clickedCount = clickedCount;
      this.categories = normalizeCategories(categories);
      this.chatAssistantOpen = false;

      if (initial || forceUpdate) {
        this.unreadsSinceLastUpdate = 0;
        return;
      }

      this.unreadsSinceLastUpdate = unreadCount - previousUnreadCount;
    },

    /* --------------------------------------------------
     * Data fetchers
     * -------------------------------------------------- */

    async fetchSmartFolders() {
      const requestId = ++this.smartFolderRequestId;
      const { data } = await fetchSmartFoldersAPI();
      if (requestId !== this.smartFolderRequestId) return;

      this.smartFolders = (data.smartFolders || []).map(folder => ({
        ...folder,
        ArticleCount: folder.ArticleCount ?? 0
      }));

      void fetchSmartFolderCountsAPI()
        .then(({ data: countsData }) => {
          if (requestId !== this.smartFolderRequestId) return;

          const countMap = new Map(
            (countsData.smartFolders || []).map(folder => [folder.id, folder.ArticleCount ?? 0])
          );

          this.smartFolders = this.smartFolders.map(folder => ({
            ...folder,
            ArticleCount: countMap.get(folder.id) ?? folder.ArticleCount ?? 0
          }));
        })
        .catch(err => {
          if (import.meta.env.DEV) {
            console.warn('Smart folder counts refresh failed', err);
          }
        });
    },

    async fetchTopTags() {
      const { data } = await fetchTopTagsAPI({
        grouping: this.currentSelection.grouping
      });

      this.topTags = data.tags || [];
    },

    setCurrentSelection(selection = {}) {
      this.chatAssistantOpen = false;

      const prev = this.currentSelection;
      const includeDevelopingEvents = selection.includeDevelopingEvents != null
        ? Boolean(selection.includeDevelopingEvents)
        : Boolean(prev.includeDevelopingEvents);
      this.includeDevelopingEvents = includeDevelopingEvents;
      this.currentSelection = {
        ...prev,
        ...selection,
        sort:
          selection.sort != null
            ? normalizeSort(selection.sort)
            : normalizeSort(prev.sort),
        grouping:
          selection.grouping != null
            ? normalizeGrouping(selection.grouping)
            : normalizeGrouping(prev.grouping),
        includeDevelopingEvents
      };
    },

    // This function applies selection and related UI changes as one coherent Pinia transition.
    applySelection(selection, { closeChat = true } = {}) {
      this.$patch({
        currentSelection: {
          ...this.currentSelection,
          ...selection
        },
        ...(closeChat ? { chatAssistantOpen: false } : {})
      });
    },

    setSelectedStatus(status) {
      this.applySelection({
        status,
        search: status === 'briefing'
          ? briefingSearchQuery({
            selectionPeriod: this.briefingSelectionPeriod,
            includeOnlyUnreadArticles: this.briefingIncludeOnlyUnreadArticles,
            prioritizeHighTrust: this.briefingPrioritizeHighTrust
          })
          : null,
        smartFolderId: null
      });
    },

    // This function applies configured Briefing filters to future and active selections.
    setBriefingFilters({
      selectionPeriod,
      includeOnlyUnreadArticles,
      prioritizeHighTrust
    }) {
      const normalizedPeriod = selectionPeriod === '24h'
        ? '24h'
        : DEFAULT_BRIEFING_SELECTION_PERIOD;
      this.briefingSelectionPeriod = normalizedPeriod;
      this.briefingIncludeOnlyUnreadArticles = Boolean(includeOnlyUnreadArticles);
      this.briefingPrioritizeHighTrust = Boolean(prioritizeHighTrust);

      if (this.currentSelection.status !== 'briefing') return;

      const search = briefingSearchQuery({
        selectionPeriod: normalizedPeriod,
        includeOnlyUnreadArticles: this.briefingIncludeOnlyUnreadArticles,
        prioritizeHighTrust: this.briefingPrioritizeHighTrust
      });
      if (this.currentSelection.search !== search) {
        this.currentSelection.search = search;
      }
    },

    // This function applies only a Briefing period while preserving the unread preference.
    setBriefingSelectionPeriod(selectionPeriod) {
      this.setBriefingFilters({
        selectionPeriod,
        includeOnlyUnreadArticles: this.briefingIncludeOnlyUnreadArticles,
        prioritizeHighTrust: this.briefingPrioritizeHighTrust
      });
    },

    // This function invalidates the active Briefing list after non-query preferences change.
    refreshBriefingSelection() {
      if (this.currentSelection.status !== 'briefing') return;
      this.currentSelection.briefingRevision = Number(
        this.currentSelection.briefingRevision || 0
      ) + 1;
    },

    // This function refreshes sidebar counts after Briefing preferences change.
    async refreshOverviewCounts() {
      try {
        const { data } = await fetchOverviewCountsAPI(this.currentSelection);
        this.updateOverviewCounts(data, { forceUpdate: true });
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('Overview counts refresh failed', err);
        }
      }
    },

    // This function selects a category, clears its feed, and removes competing filters atomically.
    selectCategory(categoryId) {
      this.applySelection({
        categoryId: String(categoryId),
        feedId: '%',
        tag: null,
        search: null,
        smartFolderId: null
      });
    },

    // This compatibility action delegates category selection to the atomic contract.
    setSelectedCategoryId(categoryId) {
      this.selectCategory(categoryId);
    },

    // This function selects a feed and optional parent category in one coherent transition.
    selectFeed(feedId, categoryId = this.currentSelection.categoryId) {
      this.applySelection({
        categoryId: String(categoryId),
        feedId: String(feedId),
        tag: null,
        search: null,
        smartFolderId: null
      });
    },

    // This compatibility action preserves the selected category while selecting a feed.
    setSelectedFeedId(feedId) {
      this.selectFeed(feedId);
    },

    setSelectedSearch(search) {
      this.applySelection({
        search,
        tag: null
      });
    },

    setSelectedSort(sort) {
      this.applySelection({
        sort: normalizeSort(sort),
        search: removeSortTokens(this.currentSelection.search)
      });
    },

    setTag(tag) {
      this.applySelection({
        tag,
        categoryId: '%',
        feedId: '%',
        search: null,
        smartFolderId: null
      });
    },

    setSmartFolder(smartFolder) {
      const search = smartFolder
        ? smartFolder.query +
          (smartFolder.limitCount ? ` limit:${smartFolder.limitCount}` : '')
        : null;

      this.applySelection({
        categoryId: '%',
        feedId: '%',
        status: 'unread',
        sort: 'desc',
        tag: null,
        smartFolderId: smartFolder?.id ?? null,
        search
      });
    },

    /* --------------------------------------------------
     * Score / view toggles
     * -------------------------------------------------- */

    setMinAdvertisementScore(v) {
      this.currentSelection.minAdvertisementScore = v;
    },

    setMinSentimentScore(v) {
      this.currentSelection.minSentimentScore = v;
    },

    setMinQualityScore(v) {
      this.currentSelection.minQualityScore = v;
    },

    setViewMode(value) {
      this.applySelection({ viewMode: value });
    },

    setGrouping(value) {
      this.currentSelection.grouping = normalizeGrouping(value);
      this.fetchOverviewSplit({ forceUpdate: true }).catch(err => {
        if (import.meta.env.DEV) {
          console.warn('Grouping refresh failed', err);
        }
      });
    },

    /* --------------------------------------------------
     * Counters + UI flags
     * -------------------------------------------------- */

    // This function reconciles one favorite transition across global, category, and feed counts.
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

    increaseRefreshCategories() {
      this.refreshCategories++;
    },

    setShowModal(v) {
      this.showModal = v;
    },

    setChatAssistantOpen(v) {
      this.chatAssistantOpen = v;
    },

    setMobileSearchOpen(v) {
      this.mobileSearchOpen = v;
    },

    setSearchQuery(q) {
      this.searchQuery = q;
    },

    /* --------------------------------------------------
     * Category + feed reconciliation
     * -------------------------------------------------- */

    // This function adds a normalized category returned by the API.
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

    // This function updates a stored category's API-backed display fields.
    updateCategory(categoryId, category = {}) {
      const stored = this.categories.find(item => idsMatch(item.id, categoryId));
      if (!stored) return false;

      if (category.name !== undefined) stored.name = category.name;
      if (category.iconName !== undefined) stored.iconName = category.iconName;
      return true;
    },

    // This function removes a category and reconciles its contribution to global counts.
    removeCategory(categoryId) {
      const index = this.categories.findIndex(item => idsMatch(item.id, categoryId));
      if (index === -1) return false;

      const [removed] = this.categories.splice(index, 1);
      for (const field of COUNT_FIELDS) {
        this[field] = normalizeCount(this[field] - normalizeCount(removed[field]));
      }
      return true;
    },

    // This function applies either an ordered category list or an ordered list of category IDs.
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

    // This function adds a normalized feed to an existing category.
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

    // This function updates or atomically moves a stored feed using an API response.
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

    // This function moves a feed and its counters between existing categories atomically.
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

    // This function removes a feed and reconciles category and global counts.
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

    /* --------------------------------------------------
     * Article read handling
     * -------------------------------------------------- */

    increaseReadCount(article) {
      // Find category and feed to update their counts
      const category = this.categories.find(
        c => c.id === article.feed.categoryId
      );
      if (!category) {
        console.warn('[increaseReadCount] Category not found for categoryId:', article.feed.categoryId);
        return;
      }

      const feed = category.feeds?.find(f => f.id === article.feedId);
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

    decreaseReadCount(article) {
      // Find category and feed to update their counts
      const category = this.categories.find(
        c => c.id === article.feed.categoryId
      );
      if (!category) {
        console.warn('[decreaseReadCount] Category not found for categoryId:', article.feed.categoryId);
        return;
      }

      const feed = category.feeds?.find(f => f.id === article.feedId);
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
    },

    /* --------------------------------------------------
     * Error handling
     * -------------------------------------------------- */

    setFatalError(error) {
      this.fatalError = error;
    },
    clearFatalError() {
      this.fatalError = null;
    }
  },

  getters: {
    getCurrentSelection: s => s.currentSelection,
    getCategories: s => s.categories,

    getBriefingCount: s => s.briefingCount,
    getUnreadCount: s => s.unreadCount,
    getReadCount: s => s.readCount,
    getFavoriteCount: s => s.favoriteCount,
    getHotCount: s => s.hotCount,
    getClickedCount: s => s.clickedCount,

    getTopTags: s => s.topTags,
    getChatAssistantOpen: s => s.chatAssistantOpen,
    getShowModal: s => s.showModal,

    getUnreadsSinceLastUpdate: s =>
      Math.trunc(Math.abs(Number(s.unreadsSinceLastUpdate) || 0)),

    getSelectedCategory: state => {
      const id = Number(state.currentSelection.categoryId);
      return Number.isFinite(id)
        ? state.categories.find(c => idsMatch(c.id, id)) || null
        : null;
    },

    getSelectedFeedDetails: state => {
      const catId = Number(state.currentSelection.categoryId);
      const feedId = Number(state.currentSelection.feedId);
      if (!Number.isFinite(catId) || !Number.isFinite(feedId)) return null;

      const category = state.categories.find(c => idsMatch(c.id, catId));
      const feed = category?.feeds?.find(f => idsMatch(f.id, feedId));

      return feed ? { feed } : null;
    }
  }
});

export default useStore;
