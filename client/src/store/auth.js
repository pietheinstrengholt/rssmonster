import { useOfflineReadingStore } from './offlineReading.js';
import Cookies from 'js-cookie';
import { offlineAccount } from '../services/offlineReading.js';
import { rememberOfflineIdentity, forgetOfflineIdentity, clearRememberedOfflineSnapshot } from '../services/offlineIdentity.js';
import { defineStore } from 'pinia';
import { setAuthToken } from '../api/client.js';
import { useOverviewStore } from './overview.js';
import { useSelectionStore } from './selection.js';
import { useUiStore } from './ui.js';
import { useFeedRefreshStore } from './feedRefresh.js';

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
    setSession({ token, role, userId = null, offline = false }) {
      if (this.token && this.token !== token) {
        this.clearSession();
      }
      setAuthToken(token);
      this.token = token;
      this.role = role;
      this.userId = userId;
      if (!offline && userId != null) void rememberOfflineIdentity({ token, role, userId }).catch(() => {});
    },
    // This function invalidates all requests before atomically clearing every user-owned store.
    clearSession() {
      const selectionStore = useSelectionStore();
      const overviewStore = useOverviewStore();
      const uiStore = useUiStore();
      const feedRefreshStore = useFeedRefreshStore();

      this.sessionRequestId++;
      const offlineStore = useOfflineReadingStore();
      if (this.userId == null && !offlineStore.account) {
        void clearRememberedOfflineSnapshot(Cookies.get('token')).catch(error => console.warn('Could not clear offline data:', error));
      }
      offlineStore.resetSession(this.userId == null ? offlineStore.account : offlineAccount(this.userId));
      forgetOfflineIdentity();
      setAuthToken(null);
      selectionStore.invalidateSessionRequests();
      overviewStore.invalidateSessionRequests();

      this.token = null;
      this.role = null;
      this.userId = null;
      selectionStore.resetSessionState();
      overviewStore.resetSessionState();
      uiStore.resetSessionState();
      feedRefreshStore.resetSessionState();
    }
  },
});
