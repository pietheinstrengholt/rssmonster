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
    newUnreads: 0
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
    }
  },
  getters: {
    getCategories: state => {
      return state.categories
    },
    getCurrentSelection: state => {
      return state.currentSelection
    },
    getFilter: state => {
      return state.filter
    },
    getCategories: state => {
      return state.categories
    },
    getUnreadCount: state => {
      return state.unreadCount
    },
    getReadCount: state => {
      return state.readCount
    },
    getStarCount: state => {
      return state.starCount
    },
    getHotCount: state => {
      return state.hotCount
    },
    getShowModal: state => {
      return state.showModal
    },
    getNewUnreads: state => {
      return state.newUnreads
    }
  }
});

export default useStore