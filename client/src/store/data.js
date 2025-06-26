import { defineStore } from 'pinia';

export const useStore = defineStore('data', {
  state: () => ({
    currentSelection: {
        status: 'unread',
        categoryId: '%',
        feedId: '%',
        search: null,
        sort: 'DESC'
    },
    filter: 'full',
    categories: [],
    unreadCount: 0,
    readCount: 0,
    starCount: 0,
    hotCount: 0,
    showModal: false,
    newUnreads: 0,
    refreshCategories: 0
  }),
  actions: {
    setCategories(categories) {
      this.categories = categories;
    },
    setCurrentSelection(selection) {
      this.currentSelection = selection;
    },
    setFilter(filter) {
      this.filter = filter;
    },
    setCategories(categories) {
      this.categories = categories;
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
    setShowModal(show) {
      this.showModal = show;
    },
    setNewUnreads(count) {  
      this.newUnreads = count;
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
    }
  },
  getters: {
    getCategories() {
      return this.categories
    },
    getCurrentSelection() {
      return this.currentSelection
    },
    getFilter() {
      return this.filter
    },
    getCategories() {
      return this.categories
    },
    getUnreadCount() {
      return this.unreadCount
    },
    getReadCount() {
      return this.readCount
    },
    getStarCount() {
      return this.starCount
    },
    getHotCount() {
      return this.hotCount
    },
    getShowModal() {
      return this.showModal
    },
    getNewUnreads() {
      return this.newUnreads
    }
  }
});

export default useStore