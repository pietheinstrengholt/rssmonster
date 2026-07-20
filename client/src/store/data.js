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

const DEFAULT_BRIEFING_DATE_FILTER = '@lastweek';

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
  grouping: 'none'
});

const normalizeSort = value => {
  const normalized = String(value ?? 'desc').toLowerCase();
  return ['asc', 'desc', 'recommended', 'quality', 'attention'].includes(normalized)
    ? normalized
    : 'desc';
};

const removeSortTokens = query => {
  if (!query || !/(^|[\s,])sort:/i.test(query)) return query;

  const cleaned = String(query)
    .split(/([\s,]+)/)
    .filter(part => !/^sort:(desc|asc|recommended|quality|attention)[.,;]*$/i.test(part.trim()))
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

    briefingCount: null,
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

    fatalError: null
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
      if (initial) await this.fetchSettings();

      const { data } = await fetchOverviewLiteAPI();
      this.updateOverviewStructure(data, { initial, forceUpdate });

      void fetchOverviewCountsAPI(this.currentSelection)
        .then(({ data: countsData }) => {
          this.updateOverviewCounts(countsData, { initial, forceUpdate });
        })
        .catch(err => {
          if (import.meta.env.DEV) {
            console.warn('Overview counts refresh failed', err);
          }
        });
    },

    updateOverview(
      { briefingCount, unreadCount, readCount, favoriteCount, hotCount, clickedCount, categories },
      { initial = false, forceUpdate = false } = {}
    ) {
      const previousUnreadCount = this.unreadCount;

      this.briefingCount = briefingCount ?? this.briefingCount;
      this.unreadCount = unreadCount;
      this.readCount = readCount;
      this.favoriteCount = favoriteCount;
      this.hotCount = hotCount;
      this.clickedCount = clickedCount;
      this.categories = categories;
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
      this.categories = categories;
      this.chatAssistantOpen = false;

      if (initial || forceUpdate) {
        this.unreadsSinceLastUpdate = 0;
      }
    },

    updateOverviewCounts(
      { briefingCount, unreadCount, readCount, favoriteCount, hotCount, clickedCount, categories },
      { initial = false, forceUpdate = false } = {}
    ) {
      const previousUnreadCount = this.unreadCount;

      this.briefingCount = briefingCount ?? this.briefingCount;
      this.unreadCount = unreadCount;
      this.readCount = readCount;
      this.favoriteCount = favoriteCount;
      this.hotCount = hotCount;
      this.clickedCount = clickedCount;
      this.categories = categories;
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
      const { data } = await fetchSmartFoldersAPI();
      this.smartFolders = (data.smartFolders || []).map(folder => ({
        ...folder,
        ArticleCount: folder.ArticleCount ?? 0
      }));

      void fetchSmartFolderCountsAPI()
        .then(({ data: countsData }) => {
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
            : normalizeGrouping(prev.grouping)
      };
    },

    setSelectedStatus(status) {
      Object.assign(this.currentSelection, {
        status,
        search: status === 'briefing' ? `briefing:true ${DEFAULT_BRIEFING_DATE_FILTER}` : null,
        smartFolderId: null
      });

      this.chatAssistantOpen = false;
    },

    setSelectedCategoryId(categoryId) {
      Object.assign(this.currentSelection, {
        categoryId: String(categoryId),
        tag: null,
        search: null,
        smartFolderId: null
      });

      this.chatAssistantOpen = false;
    },

    setSelectedFeedId(feedId) {
      Object.assign(this.currentSelection, {
        feedId: String(feedId),
        tag: null,
        search: null,
        smartFolderId: null
      });

      this.chatAssistantOpen = false;
    },

    setSelectedSearch(search) {
      Object.assign(this.currentSelection, {
        search,
        tag: null
      });

      this.chatAssistantOpen = false;
    },

    setSelectedSort(sort) {
      Object.assign(this.currentSelection, {
        sort: normalizeSort(sort),
        search: removeSortTokens(this.currentSelection.search)
      });
      this.chatAssistantOpen = false;
    },

    setTag(tag) {
      Object.assign(this.currentSelection, {
        tag,
        categoryId: '%',
        feedId: '%',
        search: null,
        smartFolderId: null
      });

      this.chatAssistantOpen = false;
    },

    setSmartFolder(smartFolder) {
      const search = smartFolder
        ? smartFolder.query +
          (smartFolder.limitCount ? ` limit:${smartFolder.limitCount}` : '')
        : null;

      Object.assign(this.currentSelection, {
        categoryId: '%',
        feedId: '%',
        status: 'unread',
        sort: 'desc',
        tag: null,
        smartFolderId: smartFolder?.id ?? null,
        search
      });

      this.chatAssistantOpen = false;
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
      this.currentSelection.viewMode = value;
      this.chatAssistantOpen = false;
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

    increaseFavoriteCount() {
      this.favoriteCount++;
    },

    decreaseFavoriteCount() {
      if (this.favoriteCount > 0) this.favoriteCount--;
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
        ? state.categories.find(c => c.id === id) || null
        : null;
    },

    getSelectedFeedDetails: state => {
      const catId = Number(state.currentSelection.categoryId);
      const feedId = Number(state.currentSelection.feedId);
      if (!Number.isFinite(catId) || !Number.isFinite(feedId)) return null;

      const category = state.categories.find(c => c.id === catId);
      const feed = category?.feeds?.find(f => f.id === feedId);

      return feed ? { feed } : null;
    }
  }
});

export default useStore;
