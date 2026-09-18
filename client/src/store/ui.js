import { acceptHMRUpdate, defineStore } from 'pinia';
import { saveThemeMode } from '../api/settings.js';
import { setThemeMode as applyThemeMode } from '../services/theme.js';
import { notifyActionError } from '../services/actionNotifications.js';

// This function creates application presentation state for one user session.
const initialUiState = () => ({
  showModal: '',
  openArticleLinksInNewTab: false,
  htmlXpathDraft: null,
  chatAssistantOpen: false,
  mobileSearchOpen: false,
  searchQuery: '',
  themeMode: null,
  pendingThemeMode: null,
  themeRevision: 0,
  themeSessionId: 0,
  themeSaving: false,
  themeRetryTimer: null,
  fatalError: null
});

export const useUiStore = defineStore('ui', {
  // This state owns application-wide presentation flags and fatal error reporting.
  state: initialUiState,

  actions: {
    // This action clears modal, assistant, search, theme, and fatal-error state between users.
    resetSessionState() {
      this.stopThemeSync();
      this.$patch({ ...initialUiState(), themeSessionId: this.themeSessionId });
    },

    // This action applies the saved article body link preference.
    setOpenArticleLinksInNewTab(enabled) {
      this.openArticleLinksInNewTab = Boolean(enabled);
    },

    // This action records the user's selected color theme mode.
    setThemeMode(themeMode) {
      this.themeMode = themeMode;
    },

    // Apply locally first; only the latest choice needs to reach the server.
    selectThemeMode(themeMode) {
      applyThemeMode(themeMode);
      this.themeMode = themeMode;
      this.pendingThemeMode = themeMode;
      this.themeRevision++;
      window.clearTimeout(this.themeRetryTimer);
      this.themeRetryTimer = null;
      void this.syncThemeMode();
    },

    // Serialize writes so a slow earlier request cannot overwrite the latest choice.
    async syncThemeMode() {
      if (this.themeSaving || this.pendingThemeMode === null) return;
      window.clearTimeout(this.themeRetryTimer);
      this.themeRetryTimer = null;
      const sessionId = this.themeSessionId;
      const revision = this.themeRevision;
      const themeMode = this.pendingThemeMode;
      this.themeSaving = true;
      let retry = false;
      try {
        await saveThemeMode(themeMode);
        if (sessionId !== this.themeSessionId) return;
        if (revision === this.themeRevision) this.pendingThemeMode = null;
      } catch (error) {
        if (sessionId !== this.themeSessionId) return;
        const status = error?.response?.status;
        retry = !status || status >= 500 || status === 429;
        if (!retry) {
          notifyActionError('Theme applied on this device, but the account preference could not be saved.', error);
        }
      } finally {
        if (sessionId === this.themeSessionId) {
          this.themeSaving = false;
          if (retry) {
            this.themeRetryTimer = window.setTimeout(() => {
              this.themeRetryTimer = null;
              void this.syncThemeMode();
            }, 30000);
          } else if (revision !== this.themeRevision) {
            void this.syncThemeMode();
          }
        }
      }
    },

    // Stop retries and ignore outstanding completions when the shell or session ends.
    stopThemeSync() {
      window.clearTimeout(this.themeRetryTimer);
      this.themeRetryTimer = null;
      this.themeSessionId++;
      this.themeSaving = false;
    },

    // This action controls whether a modal is currently visible.
    setShowModal(value) {
      this.showModal = value;
    },

    // This action carries an ephemeral scraper preview draft between dialogs.
    setHtmlXpathDraft(value) {
      this.htmlXpathDraft = value;
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
