import { acceptHMRUpdate, defineStore } from 'pinia';

// This function creates application presentation state for one user session.
const initialUiState = () => ({
  showModal: '',
  chatAssistantOpen: false,
  mobileSearchOpen: false,
  searchQuery: '',
  themeMode: null,
  fatalError: null,
  feedRefreshProgress: {
    visible: false,
    currentFeedLabel: 'Waiting to start...',
    progressPercent: 0,
    totalFeeds: 0,
    processedFeeds: 0,
    newArticles: 0,
    errors: 0,
    logs: []
  }
});

export const useUiStore = defineStore('ui', {
  // This state owns application-wide presentation flags and fatal error reporting.
  state: initialUiState,

  actions: {
    // This action clears modal, assistant, search, theme, and fatal-error state between users.
    resetSessionState() {
      this.$patch(initialUiState());
    },

    // This action records the user's selected color theme mode.
    setThemeMode(themeMode) {
      this.themeMode = themeMode;
    },

    // This action controls whether a modal is currently visible.
    setShowModal(value) {
      this.showModal = value;
    },

    // This action controls whether the chat assistant is open.
    setChatAssistantOpen(value) {
      this.chatAssistantOpen = value;
    },

    // This action controls whether the mobile search interface is open.
    setMobileSearchOpen(value) {
      this.mobileSearchOpen = value;
    },

    // This action records the current local search input.
    setSearchQuery(query) {
      this.searchQuery = query;
    },

    // This action shares the live feed-refresh presentation with mobile surfaces.
    setFeedRefreshProgress(progress) {
      this.feedRefreshProgress = {
        ...progress,
        logs: [...progress.logs]
      };
    },

    // This action publishes an unrecoverable application error.
    setFatalError(error) {
      this.fatalError = error;
    },

    // This action clears the current unrecoverable application error.
    clearFatalError() {
      this.fatalError = null;
    }
  }
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useUiStore, import.meta.hot));
}
