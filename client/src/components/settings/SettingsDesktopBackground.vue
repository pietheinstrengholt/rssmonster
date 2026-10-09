<template>
  <div class="settings-page">
    <SettingsPageIntro eyebrow="Settings — Desktop" icon="arrow-repeat" title="Background refresh" title-id="desktop-background-title">
      Keep eligible feeds up to date while RSSMonster runs on your computer.
    </SettingsPageIntro>
    <p v-if="error" class="app-notice app-notice--danger" role="alert">{{ error }}</p>
    <p v-if="saved" role="status">Desktop settings saved.</p>
    <form v-if="settings" class="settings-panel" @submit.prevent="save">
      <fieldset :disabled="saving">
        <legend class="app-visually-hidden">Desktop background settings</legend>
        <label v-for="row in toggles" :key="row.key" class="desktop-setting-row">
          <span><strong>{{ row.label }}</strong><small>{{ row.help }}</small></span>
          <input :id="row.key" v-model="settings[row.key]" type="checkbox" role="switch" :disabled="row.disabled" @change="changed(row.key)">
        </label>
        <label class="desktop-setting-row" for="desktop-refresh-interval">
          <span><strong>Refresh interval</strong><small>Delay after each completed cycle. Only due feeds are fetched; feed intervals, HTTP caching, and retries still apply.</small></span>
          <select id="desktop-refresh-interval" v-model.number="settings.refreshIntervalMinutes" class="app-form-select">
            <option v-for="interval in [5, 15, 30, 60]" :key="interval" :value="interval">{{ interval }} minutes</option>
          </select>
        </label>
      </fieldset>
      <div class="settings-action-footer">
        <button type="submit" class="app-button app-button--primary" :disabled="saving">{{ saving ? 'Saving…' : 'Save settings' }}</button>
      </div>
    </form>
    <section class="settings-panel">
      <DesktopActivity @details="$emit('select-section', 'crawlStatistics')" />
      <p>Open <button type="button" class="app-button app-button--outline-secondary" @click="$emit('select-section', 'crawlStatistics')">Refresh history</button> for feed results or <button type="button" class="app-button app-button--outline-secondary" @click="$emit('select-section', 'processingJobs')">AI Processing</button> for enrichment details.</p>
      <p>Close the window to keep services running when the tray is enabled. Use <strong>Quit RSSMonster</strong> in the tray to stop them. If your session cannot display a tray, closing the window quits.</p>
    </section>
  </div>
</template>

<script>
import { fetchDesktopSettings, saveDesktopSettings } from '../../api/desktop';
import SettingsPageIntro from './SettingsPageIntro.vue';
import DesktopActivity from '../shared/DesktopActivity.vue';

export default {
  name: 'SettingsDesktopBackground',
  components: { SettingsPageIntro, DesktopActivity },
  emits: ['select-section'],
  data: () => ({ settings: null, capabilities: {}, saving: false, saved: false, error: '' }),
  computed: {
    toggles() {
      return [
        { key: 'automaticRefresh', label: 'Automatically refresh feeds', help: 'Check eligible subscriptions in the background. Manual refresh stays available.' },
        { key: 'continueInTray', label: 'Continue running in system tray', help: this.capabilities.tray ? 'Hide the window when closing it; keep the local services running.' : 'The system tray is unavailable in this desktop session.', disabled: !this.capabilities.tray },
        { key: 'launchAtLogin', label: 'Launch RSSMonster when signing in', help: this.capabilities.login ? 'Start this installed app when you sign in to Windows.' : this.capabilities.loginReason, disabled: !this.capabilities.login },
        { key: 'startMinimized', label: 'Start minimized to tray', help: 'Keep the window hidden on the next launch. Requires the system tray.', disabled: !this.capabilities.tray || !this.settings.continueInTray }
      ];
    }
  },
  async mounted() {
    try { this.apply((await fetchDesktopSettings()).data); } catch (error) { this.error = error.response?.data?.message || 'Desktop settings could not be loaded.'; }
  },
  methods: {
    apply(data) { this.settings = { ...data.settings }; this.capabilities = data.capabilities; },
    changed(key) { this.saved = false; if (key === 'continueInTray' && !this.settings.continueInTray) this.settings.startMinimized = false; },
    async save() {
      this.saving = true; this.error = ''; this.saved = false;
      try { this.apply((await saveDesktopSettings(this.settings)).data); this.saved = true; } catch (error) { this.error = error.response?.data?.message || 'Desktop settings could not be saved.'; } finally { this.saving = false; }
    }
  }
};
</script>

<style scoped>
fieldset { border: 0; margin: 0; padding: 0; }
.desktop-setting-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding: var(--space-3) 0; }
.desktop-setting-row span { min-width: 0; }
.desktop-setting-row small { display: block; color: var(--text-secondary); margin-top: var(--space-1); }
.desktop-setting-row input { flex-shrink: 0; width: 1.25rem; height: 1.25rem; accent-color: var(--color-link); }
.desktop-setting-row select { width: auto; flex-shrink: 0; }
</style>
