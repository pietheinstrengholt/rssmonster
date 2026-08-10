<template>
  <div class="settings-surface settings-overlay">
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
          <p class="settings-subtitle">{{ activeSectionDescription }}</p>
        </div>

        <button
          ref="settingsCloseButton"
          class="settings-close-button"
          type="button"
          aria-label="Close settings"
          @click="$emit('close')"
        >
          <BootstrapIcon icon="x-lg" aria-hidden="true" />
        </button>
      </header>

      <div class="settings-layout">
        <aside class="settings-sidebar" aria-label="Settings navigation">
          <button
            v-for="item in visibleSettingsNavigation"
            :key="item.key"
            type="button"
            class="settings-sidebar-item"
            :class="{ active: active === item.key }"
            :aria-current="active === item.key ? 'page' : undefined"
            @click="selectSection(item.key, $event)"
          >
            <BootstrapIcon class="settings-sidebar-icon" :icon="item.icon" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </button>
        </aside>

        <main class="settings-content">
          <component
            :is="activeComponent"
            @close="active = 'welcome'"
            @detail-view="feedDetailsActive = $event"
            @saved="handleSaved"
            @forceReload="$emit('forceReload')"
          />
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

// This component lazily loads Smart Folder settings.
const SettingsSmartFolders = createAsyncSettingsSection(() => import('./SettingsSmartFolders.vue'));
// This component lazily loads article action settings.
const SettingsActions = createAsyncSettingsSection(() => import('./SettingsActions.vue'));
// This component lazily loads AI score settings.
const SettingsScores = createAsyncSettingsSection(() => import('./SettingsScores.vue'));
// This component lazily loads interest island settings.
const SettingsIslands = createAsyncSettingsSection(() => import('./SettingsIslands.vue'));
// This component lazily loads event and topic settings.
const SettingsTopics = createAsyncSettingsSection(() => import('./SettingsTopics.vue'));
// This component lazily loads crawl statistics.
const SettingsCrawlStatistics = createAsyncSettingsSection(() => import('./SettingsCrawlStatistics.vue'));
// This component lazily loads feed management settings.
const SettingsFeedsOverview = createAsyncSettingsSection(() => import('./SettingsFeedsOverview.vue'));
// This component lazily loads official source settings.
const SettingsOfficialSources = createAsyncSettingsSection(() => import('./SettingsOfficialSources.vue'));
// This component lazily loads administrator user management.
const SettingsManageUsers = createAsyncSettingsSection(() => import('./SettingsManageUsers.vue'));

export default {
  name: 'SettingsModal',
  emits: ['close', 'forceReload'],
  props: {
    returnFocusTo: {
      type: Object,
      default: null
    }
  },
  components: {
    SettingsWelcome,
    SettingsSmartFolders,
    SettingsActions,
    SettingsScores,
    SettingsIslands,
    SettingsTopics,
    SettingsCrawlStatistics,
    SettingsFeedsOverview,
    SettingsOfficialSources,
    SettingsManageUsers
  },
  // This function creates modal navigation and focus restoration state.
  data() {
    return {
      active: 'welcome',
      feedDetailsActive: false,
      previouslyFocusedElement: null
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
    // This function returns navigation items allowed by the current role and AI configuration.
    settingsNavigation() {
      const aiEnabled = this.selectionStore.currentSelection.AIEnabled;

      return [
        { key: 'welcome', label: 'Welcome', description: 'Settings overview', icon: 'info-circle-fill', visible: true },
        { key: 'smartfolders', label: 'Smart Folders', description: 'Create dynamic saved searches', icon: 'folder-fill', visible: true },
        { key: 'actions', label: 'Actions', description: 'Configure article actions', icon: 'lightning-charge-fill', visible: true },
        { key: 'scores', label: 'Scores', description: 'Set AI score thresholds', icon: 'bar-chart-fill', visible: aiEnabled },
        { key: 'topics', label: 'Topics', description: 'Manage events and topics', icon: 'diagram-3-fill', visible: aiEnabled },
        { key: 'islands', label: 'Islands', description: 'Manage interest islands', icon: 'compass-fill', visible: aiEnabled },
        { key: 'crawlStatistics', label: 'Crawl Statistics', description: 'Review daily crawl activity', icon: 'clipboard-data-fill', visible: true },
        { key: 'feeds', label: 'Feeds', description: 'Manage RSS subscriptions', icon: 'rss-fill', visible: true },
        { key: 'officialSources', label: 'Official Sources', description: 'Mark trusted organization domains', icon: 'patch-check-fill', visible: true },
        { key: 'users', label: 'Manage Users', description: 'Manage user access', icon: 'people-fill', visible: this.authStore.role === 'admin' }
      ];
    },
    // This function removes settings sections hidden from the current user.
    visibleSettingsNavigation() {
      return this.settingsNavigation.filter((item) => item.visible);
    },
    // This function returns metadata for the active settings section.
    activeNavigationItem() {
      return this.settingsNavigation.find((item) => item.key === this.active);
    },
    // This function describes the active section for the dialog header.
    activeSectionDescription() {
      if (this.active === 'feeds' && this.feedDetailsActive) {
        return 'Settings — Feeds — Feed details';
      }
      if (!this.activeNavigationItem) return 'Settings — Overview';

      return `Settings — ${this.activeNavigationItem.label}: ${this.activeNavigationItem.description}`;
    },
    // This function resolves the component displayed for the active section.
    activeComponent() {
      return {
        welcome: 'SettingsWelcome',
        smartfolders: 'SettingsSmartFolders',
        actions: 'SettingsActions',
        scores: 'SettingsScores',
        topics: 'SettingsTopics',
        islands: 'SettingsIslands',
        crawlStatistics: 'SettingsCrawlStatistics',
        feeds: 'SettingsFeedsOverview',
        officialSources: 'SettingsOfficialSources',
        users: 'SettingsManageUsers'
      }[this.active] || 'SettingsWelcome';
    }
  },
  methods: {
    // This function returns currently usable focus targets inside the dialog.
    getFocusableElements() {
      const dialog = this.$refs.settingsDialog;
      if (!dialog) return [];

      return [...dialog.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter(element => {
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
        this.$emit('close');
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
      this.active = sectionKey;
      this.feedDetailsActive = false;

      this.$nextTick(() => {
        const dialog = this.$refs.settingsDialog;
        if (navigationButton?.isConnected && !dialog?.contains(document.activeElement)) {
          navigationButton.focus();
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
