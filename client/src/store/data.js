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
  }
});

export default useStore