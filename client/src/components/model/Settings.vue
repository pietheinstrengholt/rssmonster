<template>
  <div class="settings-overlay">
    <section class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" @keydown.esc="$emit('close')">
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
            @click="active = item.key"
          >
            <BootstrapIcon class="settings-sidebar-icon" :icon="item.icon" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </button>
        </aside>

        <main class="settings-content">
          <component
            :is="activeComponent"
            @close="active = 'welcome'"
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
import { defineAsyncComponent } from 'vue';
import SettingsWelcome from './SettingsWelcome.vue';
import SettingsSectionError from './SettingsSectionError.vue';
import SettingsSectionLoading from './SettingsSectionLoading.vue';

// This function creates a lazy settings section with shared loading and error behavior.
const createAsyncSettingsSection = loader => defineAsyncComponent({
  loader,
  loadingComponent: SettingsSectionLoading,
  errorComponent: SettingsSectionError,
  delay: 120,
  timeout: 20000,
  suspensible: false,
  onError(error, retry, fail, attempts) {
    if (attempts <= 2) {
      retry();
      return;
    }

    fail(error);
  }
});

const SettingsSmartFolders = createAsyncSettingsSection(() => import('./SettingsSmartFolders.vue'));
const SettingsActions = createAsyncSettingsSection(() => import('./SettingsActions.vue'));
const SettingsScores = createAsyncSettingsSection(() => import('./SettingsScores.vue'));
const SettingsIslands = createAsyncSettingsSection(() => import('./SettingsIslands.vue'));
const SettingsTopics = createAsyncSettingsSection(() => import('./SettingsTopics.vue'));
const SettingsCrawlStatistics = createAsyncSettingsSection(() => import('./SettingsCrawlStatistics.vue'));
const SettingsFeedsOverview = createAsyncSettingsSection(() => import('./SettingsFeedsOverview.vue'));
const SettingsOfficialSources = createAsyncSettingsSection(() => import('./SettingsOfficialSources.vue'));
const SettingsManageUsers = createAsyncSettingsSection(() => import('./SettingsManageUsers.vue'));

export default {
  name: 'SettingsModal',
  emits: ['close', 'forceReload'],
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
  data() {
    return { active: 'welcome' };
  },
  mounted() {
    document.body.classList.add('modal-open');
    this.$nextTick(() => this.$refs.settingsCloseButton?.focus());
  },
  beforeUnmount() {
    document.body.classList.remove('modal-open');
  },
  computed: {
    settingsNavigation() {
      const aiEnabled = this.$store.data.currentSelection.AIEnabled;

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
        { key: 'users', label: 'Manage Users', description: 'Manage user access', icon: 'people-fill', visible: this.$store.auth.getRole === 'admin' }
      ];
    },
    visibleSettingsNavigation() {
      return this.settingsNavigation.filter((item) => item.visible);
    },
    activeNavigationItem() {
      return this.settingsNavigation.find((item) => item.key === this.active);
    },
    activeSectionDescription() {
      if (!this.activeNavigationItem) return 'Settings — Overview';

      return `Settings — ${this.activeNavigationItem.label}: ${this.activeNavigationItem.description}`;
    },
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
    handleSaved() {
      this.$emit('forceReload');
    }
  }
};
</script>
