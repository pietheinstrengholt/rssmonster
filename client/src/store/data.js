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
      minAdvertisementScore: 100,
      minSentimentScore: 100,
      minQualityScore: 100,
      viewMode: 'full'
    },
    categories: [],
    unreadCount: 0,
    readCount: 0,
    starCount: 0,
    hotCount: 0,
    clickedCount: 0,
    showModal: false,
    unreadsSinceLastUpdate: 0,
    refreshCategories: 0,
    chatAssistantOpen: false
  }),
  actions: {
    setCategories(categories) {
      this.categories = categories;
    },
    // Update store state based on overview payload
    updateOverview(payload, { initial = false } = {}) {
      const { unreadCount, readCount, starCount, hotCount, clickedCount, categories } = payload;
      // update counts in store
      if (initial) {
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
    async fetchOverview(initial, token) {
      // Fetch overview data from server
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const response = await axios.get(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/manager/overview");
      // Update store with fetched data
      this.updateOverview(response.data, { initial });
      return { response };
    },
    setCurrentSelection(selection) {
      this.currentSelection = selection;
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
    increaseStarCount() {
      this.starCount++;
    },
    decreaseStarCount() {
      if (this.starCount > 0) {
        this.starCount--;
      }
    },
    increaseReadCount(article) {
      //find the category and feed index
      var categoryIndex = this.categories.findIndex(category => category.id === article.feed.categoryId);
      var feedIndex = this.categories[categoryIndex].feeds.findIndex(feed => feed.id === article.feedId);
      //increase the read count and decrease the unread count
      //avoid having any negative numbers
      if (this.categories[categoryIndex].unreadCount > 0) {
        this.categories[categoryIndex].unreadCount = this.categories[categoryIndex].unreadCount - 1;
        this.categories[categoryIndex].readCount = this.categories[categoryIndex].readCount + 1;
      }
      //avoid having any negative numbers
      if (this.categories[categoryIndex].feeds[feedIndex].unreadCount > 0) {
        this.categories[categoryIndex].feeds[feedIndex].unreadCount = this.categories[categoryIndex].feeds[feedIndex].unreadCount - 1;
        this.categories[categoryIndex].feeds[feedIndex].readCount = this.categories[categoryIndex].feeds[feedIndex].readCount + 1;
      }
      //increase total counts
      if (this.unreadCount > 0) {
        this.readCount = this.readCount + 1;
        this.unreadCount = this.unreadCount - 1;
      }
    },
    increaseRefreshCategories() {
      this.refreshCategories++;
    },
    setSelectedStatus(status) {
      this.currentSelection.status = status;
      this.currentSelection.tag = null;
    },
    setSelectedCategoryId(categoryId) {
      this.currentSelection.categoryId = String(categoryId);
      this.currentSelection.tag = null;
    },
    setSelectedFeedId(feedId) {
      this.currentSelection.feedId = String(feedId);
      this.currentSelection.tag = null;
    },
    setSelectedSearch(search) {
      this.currentSelection.search = search;
      this.currentSelection.tag = null;
    },
    setSelectedSort(sort) {
      this.currentSelection.sort = sort;
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
      this.currentSelection.viewMode = value;
    },
    setChatAssistantOpen(value) {
      this.chatAssistantOpen = value;
    }
  },
  getters: {
    getSelectedStatus: (data) => {
      return data.currentSelection.status;
    },
    getSelectedCategoryId: (data) => {
      return data.currentSelection.categoryId;
    },
    getSelectedFeedId: (data) => {
      return data.currentSelection.feedId;
    },
    getSelectedSearch: (data) => {
      return data.currentSelection.search;
    },
    getSelectedSort: (data) => {
      return data.currentSelection.sort;
    },
    getCategories: (data) => {
      return data.categories;
    },
    getCurrentSelection: (data) => {
      return data.currentSelection;
    },
    getCategories: (data) => {
      return data.categories;
    },
    getUnreadCount: (data) => {
      return data.unreadCount;
    },
    getReadCount: (data) => {
      return data.readCount;
    },
    getStarCount: (data) => {
      return data.starCount;
    },
    getHotCount: (data) => {
      return data.hotCount;
    },
    getClickedCount: (data) => {
      return data.clickedCount;
    },
    getShowModal: (data) => {
      return data.showModal;
    },
    getunreadsSinceLastUpdate: (data) => {
      return data.unreadsSinceLastUpdate;
    },
    getMinAdvertisementScore: (data) => {
      return data.currentSelection.minAdvertisementScore;
    },
    getMinSentimentScore: (data) => {
      return data.currentSelection.minSentimentScore;
    },
    getMinQualityScore: (data) => {
      return data.currentSelection.minQualityScore;
    },
    getViewMode: (data) => {
      return data.currentSelection.viewMode;
    },
    getChatAssistantOpen: (data) => {
      return data.chatAssistantOpen;
    }
  }
});

export default useStore