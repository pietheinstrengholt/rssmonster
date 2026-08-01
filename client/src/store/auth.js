import { defineStore } from 'pinia';
import { useOverviewStore } from './overview.js';
import { useSelectionStore } from './selection.js';
import { useUiStore } from './ui.js';

export const useAuthStore = defineStore('auth', {
  // This function creates a logged-out authentication state.
  state: () => ({
    token: null,
    role: null,
    userId: null,
    sessionRequestId: 0
  }),
  actions: {
    // This function starts an authentication request and invalidates older session completions.
    beginSessionRequest() {
      return ++this.sessionRequestId;
    },
    // This function reports whether an authentication response still belongs to the active session transition.
    isSessionRequestCurrent(requestId) {
      return requestId === this.sessionRequestId;
    },
    // This function applies every authenticated-session field from login or validation.
    setSession({ token, role, userId = null }) {
      if (this.token && this.token !== token) {
        this.clearSession();
      }
      this.token = token;
      this.role = role;
      this.userId = userId;
    },
    // This function invalidates all requests before atomically clearing every user-owned store.
    clearSession() {
      const selectionStore = useSelectionStore();
      const overviewStore = useOverviewStore();
      const uiStore = useUiStore();

      this.sessionRequestId++;
      selectionStore.invalidateSessionRequests();
      overviewStore.invalidateSessionRequests();

      this.token = null;
      this.role = null;
      this.userId = null;
      selectionStore.resetSessionState();
      overviewStore.resetSessionState();
      uiStore.resetSessionState();
    }
  },
});
