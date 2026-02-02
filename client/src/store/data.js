import { defineStore } from 'pinia';
import axios from 'axios';

export const useStore = defineStore('data', {
  state: () => ({
    currentSelection: {
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
    },
    categories: [],
    smartFolders: [],
    unreadCount: 0,
    readCount: 0,
    starCount: 0,
    hotCount: 0,
    clickedCount: 0,
    showModal: false,
    unreadsSinceLastUpdate: 0,
    refreshCategories: 0,
    chatAssistantOpen: false,
    mobileSearchOpen: false,
    searchQuery: '',
    token: null,
    topTags: []
  }),
  actions: {
    setCategories(categories) {
      this.categories = categories;
    },
    // Update store state based on overview payload
    updateOverview(payload, { initial = false, forceUpdate = false } = {}) {
      const { unreadCount, readCount, starCount, hotCount, clickedCount, categories } = payload;
      // update counts in store
      if (initial || forceUpdate) {
        this.setUnreadCount(unreadCount);
        this.setReadCount(readCount);
        this.setStarCount(starCount);
        this.setHotCount(hotCount);
        this.setClickedCount(clickedCount);
        this.setCategories(categories);
        this.setChatAssistantOpen(false);
      } else {
        // calculate unreads since last update
        this.setUnreadsSinceLastUpdate(unreadCount - this.unreadCount);
      }
    },
    async fetchOverview(initial, token, { forceUpdate = false } = {}) {
      console.log("Fetching overview data from server...");
      // Store token for later use
      if (token) {
        this.token = token;
      }
      // Fetch overview data from server
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const response = await axios.get(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/manager/overview");
      // Update store with fetched data
      this.updateOverview(response.data, { initial, forceUpdate });
      return { response };
    },
    async fetchSmartFolders() {
      try {
        const response = await axios.get(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/smartfolders");
        this.smartFolders = response.data.smartFolders || [];
      } catch (error) {
        console.error("Error fetching smart folders", error);
      }
    },
    async fetchTopTags() {
      try {
        const clusterView = this.currentSelection.clusterView;
        const response = await axios.get(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/tags", {
          params: {
            clusterView: clusterView
          }
        });
        this.topTags = response.data.tags || [];
      } catch (error) {
        console.error("Error fetching top tags", error);
      }
    },
    setCurrentSelection(selection) {
      this.setChatAssistantOpen(false);
      const prev = this.currentSelection || {};
      this.currentSelection = {
        ...prev,
        ...(selection || {}),
        // Keep a boolean value even if the server doesn't send it
        clusterView: (selection && selection.clusterView != null)
          ? Boolean(selection.clusterView)
          : Boolean(prev.clusterView)
      };
    },
    setUnreadCount(count) {
      this.unreadCount = count;
    },
    setReadCount(count) {
      this.readCount = count;
    },
    setStarCount(count) {
      this.starCount = count;
    },
    setHotCount(count) {
      this.hotCount = count;
    },
    setClickedCount(count) {
      this.clickedCount = count;
    },
    setShowModal(show) {
      this.showModal = show;
    },
    setUnreadsSinceLastUpdate(count) {  
      this.unreadsSinceLastUpdate = count;
    },
    setCurrentSmartFolderId(smartFolderId, query) {
      this.setChatAssistantOpen(false);
      this.currentSelection.smartFolderId = smartFolderId;
      this.currentSelection.search = query || null;
    },
    increaseStarCount() {
      this.starCount++;
    },
    decreaseStarCount() {
      if (this.starCount > 0) {
        this.starCount--;
      }
    },
    increaseReadCount(article) {
      const delta = 1 + (Number(article.clusterCount) || 0);

      // find category and feed
      const categoryIndex = this.categories.findIndex(
        category => category.id === article.feed.categoryId
      );
      if (categoryIndex === -1) return;

      const feedIndex = this.categories[categoryIndex].feeds.findIndex(
        feed => feed.id === article.feedId
      );
      if (feedIndex === -1) return;

      const category = this.categories[categoryIndex];
      const feed = category.feeds[feedIndex];

      // category counts
      const catDelta = Math.min(delta, category.unreadCount);
      category.unreadCount -= catDelta;
      category.readCount += catDelta;

      // feed counts
      const feedDelta = Math.min(delta, feed.unreadCount);
      feed.unreadCount -= feedDelta;
      feed.readCount += feedDelta;

      // global counts
      const totalDelta = Math.min(delta, this.unreadCount);
      this.unreadCount -= totalDelta;
      this.readCount += totalDelta;
    },
    increaseRefreshCategories() {
      this.refreshCategories++;
    },
    setSelectedStatus(status) {
      this.setChatAssistantOpen(false);
      this.currentSelection.status = status;
      this.currentSelection.search = null;
      this.currentSelection.smartFolderId = null;
    },
    setSelectedCategoryId(categoryId) {
      this.setChatAssistantOpen(false);
      this.currentSelection.categoryId = String(categoryId);
      this.currentSelection.tag = null;
    },
    setSelectedFeedId(feedId) {
      this.setChatAssistantOpen(false);
      this.currentSelection.feedId = String(feedId);
      this.currentSelection.tag = null;
    },
    setSelectedSearch(search) {
      this.setChatAssistantOpen(false);
      this.currentSelection.search = search;
      this.currentSelection.tag = null;
    },
    setSelectedSort(sort) {
      this.setChatAssistantOpen(false);
      this.currentSelection.sort = sort;
    },
    setTag(tag) {
      this.setChatAssistantOpen(false);
      this.currentSelection.tag = tag;
      this.currentSelection.categoryId = '%';
      this.currentSelection.feedId = '%';
      this.currentSelection.search = null;
      this.currentSelection.smartFolderId = null;
    },
    setSmartFolder(smartFolder) {
      // set defaults, unless overridden by search
      console.log("Setting smart folder:", smartFolder);
      this.currentSelection.categoryId = '%'; 
      this.currentSelection.feedId = '%';
      this.currentSelection.status = 'unread';
      this.currentSelection.sort = 'DESC';
      this.setChatAssistantOpen(false);
      this.currentSelection.tag = null;
      if (smartFolder) {
        this.currentSelection.smartFolderId = smartFolder.id;
        this.currentSelection.search = smartFolder.query + (smartFolder.limitCount ? ` limit:${smartFolder.limitCount}` : ''); // e.g., "tag:ai unread:true limit:50"
      } else {
        this.currentSelection.smartFolderId = null;
        this.currentSelection.search = null;
      }
    },
    setMinAdvertisementScore(value) {
      this.currentSelection.minAdvertisementScore = value;
    },
    setMinSentimentScore(value) {
      this.currentSelection.minSentimentScore = value;
    },
    setMinQualityScore(value) {
      this.currentSelection.minQualityScore = value;
    },
    setViewMode(value) {
      this.setChatAssistantOpen(false);
      this.currentSelection.viewMode = value;
    },
    setChatAssistantOpen(value) {
      this.chatAssistantOpen = value;
    },
    setMobileSearchOpen(value) {
      this.mobileSearchOpen = value;
    },
    setSearchQuery(query) {
      console.log("Setting search query to:", query);
      this.setChatAssistantOpen(false);
      this.searchQuery = query;
      console.log("Search query set to:", this.searchQuery);
    },
    setClusterView(value) {
      this.currentSelection.clusterView = value;
      // Trigger overview refresh when cluster view changes
      if (this.token) {
        this.fetchOverview(false, this.token, { forceUpdate: true }).catch(err => {
          console.error('Error refreshing overview after cluster view change:', err);
        });
      }
    }
  },
  getters: {
    getSelectedStatus: (data) => data.currentSelection.status,
    getSelectedCategoryId: (data) => data.currentSelection.categoryId,
    getSelectedFeedId: (data) => data.currentSelection.feedId,
    getSelectedSmartFolderId: (data) => data.currentSelection.smartFolderId,
    getSelectedSearch: (data) => data.currentSelection.search,
    getSelectedSort: (data) => data.currentSelection.sort,
    getCategories: (data) => data.categories,
    getCurrentSelection: (data) => data.currentSelection,
    getCategories: (data) => data.categories,
    getUnreadCount: (data) => data.unreadCount,
    getReadCount: (data) => data.readCount,
    getStarCount: (data) => data.starCount,
    getHotCount: (data) => data.hotCount,
    getClickedCount: (data) => data.clickedCount,
    getShowModal: (data) => data.showModal,
    getunreadsSinceLastUpdate: (data) => {
      const n = Number(data.unreadsSinceLastUpdate);
      if (!Number.isFinite(n)) return 0;
      // Always positive; if 15 -> 15, if -15 -> 15, if 0 -> 0
      return Math.trunc(Math.abs(n));
    },
    getMinAdvertisementScore: (data) => data.currentSelection.minAdvertisementScore,
    getMinSentimentScore: (data) => data.currentSelection.minSentimentScore,
    getMinQualityScore: (data) => data.currentSelection.minQualityScore,
    getViewMode: (data) => data.currentSelection.viewMode,
    getClusterView: (data) => data.currentSelection.clusterView,
    getChatAssistantOpen: (data) => data.chatAssistantOpen,
    getTopTags: (data) => data.topTags,
    getSelectedCategory: (state) => {
      const { categoryId } = state.currentSelection;

      // Guard clauses
      if (!categoryId || categoryId === '%') return null;

      const catId = Number(categoryId);
      if (!Number.isFinite(catId)) return null;

      return state.categories.find(category => category.id === catId) || null;
    },
    getSelectedFeedDetails: (state) => {
      const { categoryId, feedId } = state.currentSelection;

      // Guard clauses
      if (!categoryId || !feedId) return null;
      if (categoryId === '%' || feedId === '%') return null;

      const catId = Number(categoryId);
      const fId = Number(feedId);

      if (!Number.isFinite(catId) || !Number.isFinite(fId)) return null;

      // Find category
      const category = state.categories.find(c => c.id === catId);
      if (!category || !Array.isArray(category.feeds)) return null;

      // Find feed
      const feed = category.feeds.find(f => f.id === fId);
      if (!feed) return null;

      // Optional: return combined info
      return {
        feed
      };
    }
  }
});

export default useStore