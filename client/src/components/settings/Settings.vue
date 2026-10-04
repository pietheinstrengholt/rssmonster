<template>
  <div class="settings-surface">
    <section
      ref="settingsDialog"
      class="settings-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      tabindex="-1"
      @keydown="handleDialogKeydown"
    >
      <header class="settings-header">
        <div>
          <h2 id="settings-title" class="settings-title">Settings</h2>
          <p class="settings-subtitle">Manage your RSSMonster preferences and tools.</p>
        </div>

        <button
          ref="settingsCloseButton"
          class="settings-close-button"
          type="button"
          aria-label="Close settings"
          :disabled="draftSectionsSaving"
          @click="requestClose"
        >
          <BootstrapIcon icon="x-lg" aria-hidden="true" />
        </button>
      </header>

      <div class="settings-layout">
        <aside class="settings-sidebar" aria-label="Settings navigation">
          <div v-for="group in settingsNavigationGroups" :key="group.label" class="settings-nav-group">
            <h3 v-if="group.label" class="settings-nav-group-title">{{ group.label }}</h3>
            <button
              v-for="item in group.items"
              :key="item.key"
              type="button"
              class="settings-sidebar-item"
              :class="{ active: active === item.key }"
              :aria-current="active === item.key ? 'page' : undefined"
              @click="selectSection(item.key, $event)"
            >
              <BootstrapIcon
                class="settings-sidebar-icon"
                :icon="item.icon"
                context="control"
                decorative
              />
              <span>{{ item.label }}</span>
            </button>
          </div>
        </aside>

        <div class="settings-section-picker">
          <label for="settings-section-select">Settings sections</label>
          <select id="settings-section-select" class="app-form-select" :value="active" @change="selectSection($event.target.value, $event)">
            <template v-for="group in settingsNavigationGroups" :key="group.label">
              <optgroup v-if="group.label" :label="group.label">
                <option v-for="item in group.items" :key="item.key" :value="item.key">{{ item.label }}</option>
              </optgroup>
              <template v-else>
                <option v-for="item in group.items" :key="item.key" :value="item.key">{{ item.label }}</option>
              </template>
            </template>
          </select>
        </div>

        <main class="settings-content">
          <div v-if="confirmDiscard" class="app-notice app-notice--warning" role="alert">
            <p>You have unsaved changes in Actions or Smart Folders. Keep editing to save them, or discard them and close Settings.</p>
            <button ref="keepEditingButton" type="button" class="app-button app-button--primary" @click="keepEditing">Keep editing</button>
            <button type="button" class="app-button app-button--outline-danger" :disabled="draftSectionsSaving" @click="$emit('close')">Discard changes</button>
          </div>
          <KeepAlive :include="['SettingsActions', 'SettingsSmartFolders']">
            <component
              :is="activeComponent"
              :ref="rememberDraftSection"
              v-bind="active === 'islands' ? { interestId: targetInterestId } : {}"
              @close="active = 'welcome'"
              @saved="handleSaved"
              @select-section="selectSection"
              @forceReload="$emit('forceReload')"
              @open-article="$emit('open-article', $event)"
            />
          </KeepAlive>
        </main>
      </div>
    </section>
  </div>
</template>

<style src="../../assets/css/settings.css"></style>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { useAuthStore } from '../../store/auth.js';
import { defineAsyncComponent } from 'vue';
import SettingsWelcome from './SettingsWelcome.vue';
import SettingsSectionError from './SettingsSectionError.vue';
import SettingsSectionLoading from './SettingsSectionLoading.vue';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

// This function creates a lazy settings section with shared loading and error behavior.
const createAsyncSettingsSection = loader => defineAsyncComponent({
  loader,
  loadingComponent: SettingsSectionLoading,
  errorComponent: SettingsSectionError,
  delay: 120,
  timeout: 20000,
  suspensible: false,
  // This function retries transient chunk failures before showing the shared error state.
  onError(error, retry, fail, attempts) {
    if (attempts <= 2) {
      retry();
      return;
    }

    fail(error);
  }
});

// This component lazily loads device-specific offline reading settings.
const SettingsOfflineReading = createAsyncSettingsSection(() => import('./SettingsOfflineReading.vue'));
// This component lazily loads Smart Folder settings.
const SettingsSmartFolders = createAsyncSettingsSection(() => import('./SettingsSmartFolders.vue'));
// This component lazily loads Generated Feed settings.
const SettingsGeneratedFeeds = createAsyncSettingsSection(() => import('./SettingsGeneratedFeeds.vue'));
// This component lazily loads outbound webhook configuration.
const SettingsWebhooks = createAsyncSettingsSection(() => import('./SettingsWebhooks.vue'));
// This component lazily loads article action settings.
const SettingsActions = createAsyncSettingsSection(() => import('./SettingsActions.vue'));
// This component lazily loads AI score settings.
const SettingsScores = createAsyncSettingsSection(() => import('./SettingsScores.vue'));
// This component lazily loads interest island settings.
const SettingsIslands = createAsyncSettingsSection(() => import('./SettingsIslands.vue'));
// This component lazily loads event settings.
const SettingsEvents = createAsyncSettingsSection(() => import('./SettingsEvents.vue'));
// This component lazily loads crawl statistics.
const SettingsCrawlStatistics = createAsyncSettingsSection(() => import('./SettingsCrawlStatistics.vue'));
// This component lazily loads optional AI processing health.
const SettingsProcessingJobs = createAsyncSettingsSection(() => import('./SettingsProcessingJobs.vue'));
// This component lazily loads processing failure observability.
const SettingsObservability = createAsyncSettingsSection(() => import('./SettingsObservability.vue'));
// This component lazily loads feed management settings.
const SettingsFeedsOverview = createAsyncSettingsSection(() => import('./SettingsFeedsOverview.vue'));
// This component lazily loads official source settings.
const SettingsOfficialSources = createAsyncSettingsSection(() => import('./SettingsOfficialSources.vue'));
// This component lazily loads administrator user management.
const SettingsManageUsers = createAsyncSettingsSection(() => import('./SettingsManageUsers.vue'));
const SettingsInference = createAsyncSettingsSection(() => import('./SettingsInference.vue'));
const SettingsServer = createAsyncSettingsSection(() => import('./SettingsServer.vue'));
const SettingsAccount = createAsyncSettingsSection(() => import('./SettingsAccount.vue'));

export default {
  name: 'SettingsModal',
  emits: ['close', 'forceReload', 'open-article'],
  props: {
    initialSection: { type: String, default: 'welcome' },
    interestId: { type: [Number, String], default: null },
    returnFocusTo: {
      type: Object,
      default: null
    }
  },
  components: {
    SettingsWelcome,
    SettingsSmartFolders,
    SettingsOfflineReading,
    SettingsGeneratedFeeds,
    SettingsWebhooks,
    SettingsActions,
    SettingsScores,
    SettingsIslands,
    SettingsEvents,
    SettingsCrawlStatistics,
    SettingsProcessingJobs,
    SettingsObservability,
    SettingsFeedsOverview,
    SettingsOfficialSources,
    SettingsManageUsers,
    SettingsAccount,
    SettingsInference,
    SettingsServer
  },
  // This function creates modal navigation and focus restoration state.
  data() {
    return {
      active: this.initialSection,
      targetInterestId: this.interestId,
      previouslyFocusedElement: null,
      draftSections: {},
      confirmDiscard: false
    };
  },
  // This function remembers the focused opener before the dialog enters the document.
  beforeMount() {
    this.previouslyFocusedElement = document.activeElement;
  },
  // This function locks page scrolling and moves initial focus into Settings.
  mounted() {
    document.body.classList.add('settings-overlay-open');
    this.$nextTick(() => this.$refs.settingsCloseButton?.focus());
  },
  // This function releases page scrolling before Settings is removed.
  beforeUnmount() {
    document.body.classList.remove('settings-overlay-open');
  },
  // This function restores focus to the connected opener after Settings closes.
  unmounted() {
    const focusTarget = this.returnFocusTo || this.previouslyFocusedElement;
    if (focusTarget?.isConnected && typeof focusTarget.focus === 'function') {
      focusTarget.focus();
    }
  },
  computed: {
    ...mapStores(useSelectionStore, useAuthStore),
    draftSectionsSaving() {
      return Object.values(this.draftSections).some(section => section.saving);
    },
    // This function returns navigation items allowed by the current role and AI configuration.
    settingsNavigation() {
      const aiEnabled = this.selectionStore.currentSelection.AIEnabled;

      return [
        { key: 'welcome', group: '', label: 'Welcome', icon: 'info-circle-fill', visible: true },
        { key: 'account', group: '', label: 'Account', icon: 'person-circle', visible: true },
        { key: 'smartfolders', group: 'Reading', label: 'Smart Folders', icon: 'folder-fill', visible: true },
        { key: 'offlineReading', group: 'Reading', label: 'Offline reading', icon: 'download', visible: true },
        { key: 'generatedFeeds', group: 'Automation', label: 'Generated Feeds', icon: 'rss-fill', visible: true },
        { key: 'actions', group: 'Automation', label: 'Actions', icon: 'lightning-charge-fill', visible: true },
        { key: 'webhooks', group: 'Automation', label: 'Webhooks', icon: 'diagram-3', visible: true },
        { key: 'scores', group: 'Reading', label: 'Scores', icon: 'bar-chart-fill', visible: aiEnabled },
        { key: 'events', group: 'Reading', label: 'Events', icon: 'diagram-3-fill', visible: aiEnabled },
        { key: 'islands', group: 'Reading', label: 'Your interests', icon: 'compass-fill', visible: aiEnabled },
        { key: 'crawlStatistics', group: 'Troubleshooting', label: 'Refresh history', icon: 'clipboard-data-fill', visible: true },
        { key: 'processingJobs', group: 'Troubleshooting', label: 'AI Processing', icon: 'cpu-fill', visible: true },
        { key: 'observability', group: 'Troubleshooting', label: 'Health & errors', icon: 'activity', visible: true },
        { key: 'feeds', group: 'Subscriptions', label: 'Feeds', icon: 'rss-fill', visible: true },
        { key: 'officialSources', group: 'Subscriptions', label: 'Official Sources', icon: 'patch-check-fill', visible: true },
        { key: 'inference', group: 'Administration', label: 'AI / Inference', icon: 'cpu-fill', visible: this.authStore.role === 'admin' },
        { key: 'users', group: 'Administration', label: 'Manage Users', icon: 'people-fill', visible: this.authStore.role === 'admin' },
        { key: 'server', group: 'Administration', label: 'Server settings', icon: 'gear-fill', visible: this.authStore.role === 'admin' }
      ];
    },
    // This function removes settings sections hidden from the current user.
    visibleSettingsNavigation() {
      return this.settingsNavigation.filter((item) => item.visible);
    },
    settingsNavigationGroups() {
      return ['', 'Reading', 'Subscriptions', 'Automation', 'Troubleshooting', 'Administration']
        .map(label => ({ label, items: this.visibleSettingsNavigation.filter(item => item.group === label) }))
        .filter(group => group.items.length);
    },
    // This function resolves the component displayed for the active section.
    activeComponent() {
      return {
        welcome: 'SettingsWelcome',
        account: 'SettingsAccount',
        inference: 'SettingsInference',
        server: 'SettingsServer',
        smartfolders: 'SettingsSmartFolders',
        offlineReading: 'SettingsOfflineReading',
        generatedFeeds: 'SettingsGeneratedFeeds',
        webhooks: 'SettingsWebhooks',
        actions: 'SettingsActions',
        scores: 'SettingsScores',
        events: 'SettingsEvents',
        islands: 'SettingsIslands',
        crawlStatistics: 'SettingsCrawlStatistics',
        processingJobs: 'SettingsProcessingJobs',
        observability: 'SettingsObservability',
        feeds: 'SettingsFeedsOverview',
        officialSources: 'SettingsOfficialSources',
        users: 'SettingsManageUsers'
      }[this.active] || 'SettingsWelcome';
    }
  },
  methods: {
    rememberDraftSection(section) {
      if (['SettingsActions', 'SettingsSmartFolders'].includes(section?.$options.name)) {
        this.draftSections[section.$options.name] = section;
      }
    },
    requestClose() {
      if (this.draftSectionsSaving) return;
      if (Object.values(this.draftSections).some(section => section.hasUnsavedChanges)) {
        this.confirmDiscard = true;
        this.$nextTick(() => this.$refs.keepEditingButton?.focus());
        return;
      }
      this.$emit('close');
    },
    keepEditing() {
      this.confirmDiscard = false;
      this.$refs.settingsCloseButton?.focus();
    },
    // This function returns currently usable focus targets inside the dialog.
    getFocusableElements() {
      const dialog = this.$refs.settingsDialog;
      if (!dialog) return [];

      return [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter(element => {
          for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
            if (window.getComputedStyle(ancestor).display === 'none') return false;
          }
          const style = window.getComputedStyle(element);
          return !element.hidden &&
            !element.closest('[hidden], [aria-hidden="true"]') &&
            element.tabIndex >= 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden';
        });
    },
    // This function keeps Tab navigation inside Settings and preserves Escape closing.
    handleDialogKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (this.confirmDiscard) this.keepEditing();
        else this.requestClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusableElements = this.getFocusableElements();
      if (focusableElements.length === 0) {
        event.preventDefault();
        this.$refs.settingsDialog?.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;
      const focusIsOutsideDialog = !this.$refs.settingsDialog?.contains(activeElement);

      if (event.shiftKey && (activeElement === firstElement || focusIsOutsideDialog)) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && (activeElement === lastElement || focusIsOutsideDialog)) {
        event.preventDefault();
        firstElement.focus();
      }
    },
    // This function changes sections while retaining focus on the persistent navigation control.
    selectSection(sectionKey, event) {
      const navigationButton = event?.currentTarget;
      if (sectionKey !== this.active) this.targetInterestId = null;
      this.active = sectionKey;

      this.$nextTick(() => {
        const dialog = this.$refs.settingsDialog;
        const focusTarget = navigationButton || this.getFocusableElements().find(element =>
          element.matches('.settings-sidebar-item[aria-current="page"], #settings-section-select')
        );
        if (focusTarget?.isConnected && !dialog?.contains(document.activeElement)) {
          focusTarget.focus();
        }
      });
    },
    // This function requests a content refresh after settings are saved.
    handleSaved() {
      this.$emit('forceReload');
    }
  }
};
</script>
