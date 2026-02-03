// client/src/store/data.js
import { defineStore } from 'pinia';
import { fetchSettings as fetchSettingsAPI } from '../api/settings';
import { fetchSmartFolders as fetchSmartFoldersAPI } from '../api/smartfolders';
import { fetchTopTags as fetchTopTagsAPI } from '../api/tags';
import { fetchOverview as fetchOverviewAPI } from '../api/manager';

const defaultSelection = () => ({
  status: 'unread',
  categoryId: '%',
  feedId: '%',
  search: null,
  sort: 'DESC',
  tag: null,
  smartFolderId: null,
  minAdvertisementScore: 0,
  minSentimentScore: 0,
  minQualityScore: 0,
  viewMode: 'full',
  clusterView: false
});

export const useStore = defineStore('data', {
  state: () => ({
    currentSelection: defaultSelection(),
    categories: [],
    smartFolders: [],
    topTags: [],

    unreadCount: 0,
    readCount: 0,
    starCount: 0,
    hotCount: 0,
    clickedCount: 0,

    unreadsSinceLastUpdate: 0,
    refreshCategories: 0,

    showModal: false,
    chatAssistantOpen: false,
    mobileSearchOpen: false,
    searchQuery: '',

    fatalError: null
  }),

  actions: {
    /* --------------------------------------------------
     * Overview + settings
     * -------------------------------------------------- */

    async fetchSettings() {
      const { data } = await fetchSettingsAPI();
      this.setCurrentSelection(data);
    },

    async fetchOverview({ initial = false, forceUpdate = false } = {}) {
      if (initial) await this.fetchSettings();

      const { data } = await fetchOverviewAPI(this.currentSelection);
      this.updateOverview(data, { initial, forceUpdate });
    },

    updateOverview(
      { unreadCount, readCount, starCount, hotCount, clickedCount, categories },
      { initial = false, forceUpdate = false } = {}
    ) {
      if (initial || forceUpdate) {
        this.unreadCount = unreadCount;
        this.readCount = readCount;
        this.starCount = starCount;
        this.hotCount = hotCount;
        this.clickedCount = clickedCount;
        this.categories = categories;
        this.chatAssistantOpen = false;
        this.unreadsSinceLastUpdate = 0;
        return;
      }

      this.unreadsSinceLastUpdate = unreadCount - this.unreadCount;
    },

    /* --------------------------------------------------
     * Data fetchers
     * -------------------------------------------------- */

    async fetchSmartFolders() {
      const { data } = await fetchSmartFoldersAPI();
      this.smartFolders = data.smartFolders || [];
    },

    async fetchTopTags() {
      const { data } = await fetchTopTagsAPI({
        clusterView: this.currentSelection.clusterView
      });

      this.topTags = data.tags || [];
    },

    /* --------------------------------------------------
     * Selection handling
     * -------------------------------------------------- */

    setCurrentSelection(selection = {}) {
      this.chatAssistantOpen = false;

      const prev = this.currentSelection;

      this.currentSelection = {
        ...prev,
        ...selection,
        clusterView:
          selection.clusterView != null
            ? Boolean(selection.clusterView)
            : Boolean(prev.clusterView)
      };
    },

    setSelectedStatus(status) {
      Object.assign(this.currentSelection, {
        status,
        search: null,
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
      this.currentSelection.sort = sort;
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
      Object.assign(this.currentSelection, {
        categoryId: '%',
        feedId: '%',
        status: 'unread',
        sort: 'DESC',
        tag: null,
        smartFolderId: smartFolder?.id ?? null,
        search: smartFolder
          ? smartFolder.query +
            (smartFolder.limitCount ? ` limit:${smartFolder.limitCount}` : '')
          : null
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

    setClusterView(value) {
      this.currentSelection.clusterView = Boolean(value);
      this.fetchOverview({ forceUpdate: true }).catch(err => {
        if (import.meta.env.DEV) {
          console.warn('Cluster view refresh failed', err);
        }
      });
    },

    /* --------------------------------------------------
     * Counters + UI flags
     * -------------------------------------------------- */

    increaseStarCount() {
      this.starCount++;
    },

    decreaseStarCount() {
      if (this.starCount > 0) this.starCount--;
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
      // Determine how many articles were marked as read (clusters)
      const delta = 1 + (Number(article.clusterCount) || 0);

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

      // Update counts with safety checks
      const catDelta = Math.min(delta, category.unreadCount);
      const feedDelta = Math.min(delta, feed.unreadCount);
      const totalDelta = Math.min(delta, this.unreadCount);

      // Apply updates
      category.unreadCount -= catDelta;
      category.readCount += catDelta;

      // Update feed counts
      feed.unreadCount -= feedDelta;
      feed.readCount += feedDelta;

      // Update global counts
      this.unreadCount -= totalDelta;
      this.readCount += totalDelta;
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

    getUnreadCount: s => s.unreadCount,
    getReadCount: s => s.readCount,
    getStarCount: s => s.starCount,
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