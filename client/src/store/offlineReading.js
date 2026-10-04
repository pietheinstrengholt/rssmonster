import { defineStore } from 'pinia';
import { offlineReading, offlineAccount } from '../services/offlineReading.js';
import { setOfflineReadOnly } from '../api/client.js';

export const useOfflineReadingStore = defineStore('offlineReading', {
  state: () => ({ account: null, profile: null, progress: null, readOnly: false, error: '', sessionId: 0 }),
  actions: {
    async initialize(userId, readOnly = false) {
      this.sessionId++;
      const sessionId = this.sessionId;
      this.account = offlineAccount(userId);
      this.setReadOnly(readOnly);
      try {
        const profile = await offlineReading.getProfile(this.account);
        if (this.sessionId === sessionId) this.profile = profile;
      } catch (error) {
        if (this.sessionId === sessionId) this.error = error.message;
      }
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
      const nextSessionId = this.sessionId + 1;
      this.$reset();
      this.sessionId = nextSessionId;
      setOfflineReadOnly(false);
      if (account) void offlineReading.clearSnapshot(account).catch(error => console.error('Could not clear offline data:', error));
    }
  }
});
