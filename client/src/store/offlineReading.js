import { defineStore } from 'pinia';
import { offlineReading, offlineAccount } from '../services/offlineReading.js';
import { setOfflineReadOnly } from '../api/client.js';
import { offlineDatabase } from '../services/offlineDatabase.js';
import { useAuthStore } from './auth.js';
import { useOverviewStore } from './overview.js';
import { articleSynchronization } from '../services/articleSynchronization.js';
import { OFFLINE_STATE_EVENT, OFFLINE_SESSION_EVENT, publishOfflineChange, sameOfflineAccount } from '../services/offlineCoordination.js';
import { articleStateActions } from '../services/articleStateActions.js';

export const useOfflineReadingStore = defineStore('offlineReading', {
  state: () => ({ account: null, profile: null, progress: null, readOnly: false, error: '', sessionId: 0, syncStatus: 'idle', pendingCount: 0, failedCount: 0, lastSync: null, syncError: '' }),
  actions: {
    async initialize(userId, readOnly = false) {
      this.sessionId++;
      const sessionId = this.sessionId;
      this.account = offlineAccount(userId);
      this.setReadOnly(readOnly);
      try {
        if (typeof indexedDB !== 'undefined') {
          const state = await offlineDatabase.getSyncState(this.account);
          if (this.sessionId !== sessionId) return;
          articleStateActions.setSession(this.account, state.epoch, () => this.readOnly);
          await this.refreshSynchronizationState();
          if (this.sessionId !== sessionId) return;
          const auth = useAuthStore();
          const token = auth.token;
          articleSynchronization.start({ account: { ...this.account }, token,
            isCurrent: () => this.sessionId === sessionId && auth.token === token && auth.userId === userId,
            onStatus: (status, error = '') => { if (this.sessionId === sessionId) { this.syncStatus = status; this.syncError = error; } },
            reconcile: async () => {
              const overview = useOverviewStore();
              // Authentication has succeeded; allow authoritative reads while retaining the offline collection.
              setOfflineReadOnly(false);
              try {
                const results = await Promise.all([overview.fetchOverviewCounts({ forceUpdate: true }), overview.fetchSmartFolderCounts()]);
                if (results.some(result => result === false)) throw new Error('Changes were accepted, but counts could not be refreshed.');
              } finally { setOfflineReadOnly(this.readOnly); }
            }
          });
          if (token && navigator.onLine !== false) void articleSynchronization.request();
        }
        const profile = await offlineReading.getProfile(this.account);
        if (this.sessionId === sessionId) this.profile = profile;
      } catch (error) {
        if (this.sessionId === sessionId) this.error = error.message;
      }
    },
    async refreshSynchronizationState() {
      if (!this.account || typeof indexedDB === 'undefined') return;
      const sessionId = this.sessionId;
      const [actions, state, profile] = await Promise.all([offlineDatabase.getActions(this.account), offlineDatabase.getSyncState(this.account), offlineReading.getProfile(this.account)]);
      if (this.sessionId !== sessionId) return;
      this.pendingCount = actions.filter(action => action.state !== 'failed').length;
      this.failedCount = actions.filter(action => action.state === 'failed').length;
      this.lastSync = state.lastSync;
      this.profile = profile;
      if (!['synchronizing', 'paused'].includes(this.syncStatus)) this.syncStatus = this.failedCount ? 'failed' : this.pendingCount || state.needsReconciliation ? 'pending' : 'idle';
    },
    synchronize(force = false) { return articleSynchronization.request(force); },
    handleStateChange(event) {
      if (!sameOfflineAccount(event.detail?.account, this.account)) return;
      if (event.detail.discarded && event.detail.remote) { void this.initialize(this.account.userId, this.readOnly); return; }
      void this.refreshSynchronizationState().catch(error => { this.syncError = error.message; });
      if (event.detail.local) void this.synchronize();
    },
    handleSessionChange(event) {
      if (!event.detail?.remote || !sameOfflineAccount(event.detail.account, this.account)) return;
      window.dispatchEvent(new Event('auth:expired'));
    },
    async discardPendingChanges() {
      const sessionId = this.sessionId;
      const account = this.account;
      articleSynchronization.stop();
      articleStateActions.clearSession();
      let discardedActions;
      try { discardedActions = await offlineDatabase.discardActions(account); } finally {
        if (this.sessionId === sessionId) await this.initialize(account.userId, this.readOnly);
      }
      if (this.sessionId !== sessionId + 1 || !sameOfflineAccount(account, this.account)) return;
      publishOfflineChange(account, OFFLINE_STATE_EVENT, { discarded: true, discardedActions });
    },
    setReadOnly(value) {
      this.readOnly = value;
      setOfflineReadOnly(value);
    },
    async updateConfiguration(changes) {
      const sessionId = this.sessionId;
      const account = this.account;
      const profile = await offlineReading.updateConfiguration(account, changes);
      if (sessionId !== this.sessionId) return;
      this.profile = profile;
      // Reconfiguration invalidates the old generation; let its job exit before starting another.
      await offlineReading.settleRefresh(account);
      if (sessionId === this.sessionId && profile.enabled && !this.readOnly && navigator.onLine !== false) await this.refreshSnapshot();
    },
    async refreshSnapshot() {
      if (!this.account) return;
      if (this.readOnly || navigator.onLine === false) {
        this.error = 'Connect to RSSMonster to refresh downloaded articles.';
        return;
      }
      const sessionId = this.sessionId;
      const account = this.account;
      this.error = '';
      try {
        await offlineReading.refreshSnapshot(account, progress => {
          if (this.sessionId === sessionId) this.progress = progress;
        });
      } catch (error) {
        if (this.sessionId === sessionId) this.error = error.message;
      } finally {
        const profile = await offlineReading.getProfile(account).catch(() => null);
        if (this.sessionId === sessionId) { this.profile = profile; this.progress = null; }
      }
    },
    async loadSnapshot() {
      return this.account ? offlineReading.loadSnapshot(this.account) : [];
    },
    async clearSnapshot() {
      const sessionId = this.sessionId;
      await offlineReading.clearSnapshot(this.account);
      if (this.sessionId !== sessionId) return;
      this.profile = null;
      this.progress = null;
      this.error = '';
    },
    resetSession(account = this.account) {
      articleSynchronization.stop();
      articleStateActions.clearSession();
      if (account && typeof indexedDB !== 'undefined') void offlineDatabase.invalidateSession(account).then(() => publishOfflineChange(account, OFFLINE_SESSION_EVENT)).catch(error => console.error('Could not pause offline changes:', error));
      const nextSessionId = this.sessionId + 1;
      this.$reset();
      this.sessionId = nextSessionId;
      setOfflineReadOnly(false);
      if (account) void offlineReading.clearSnapshot(account).catch(error => console.error('Could not clear offline data:', error));
    }
  }
});
