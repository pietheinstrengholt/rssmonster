<template>
  <div class="settings-overlay">
    <section class="settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header class="settings-header">
        <div>
          <h2 id="settings-title" class="settings-title">Settings</h2>
          <p class="settings-subtitle">{{ activeSectionDescription }}</p>
        </div>

        <button
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
import SettingsWelcome from './SettingsWelcome.vue';
import SettingsSmartFolders from './SettingsSmartFolders.vue';
import SettingsActions from './SettingsActions.vue';
import SettingsScores from './SettingsScores.vue';
import SettingsIslands from './SettingsIslands.vue';
import SettingsTopics from './SettingsTopics.vue';
import SettingsFeedsOverview from './SettingsFeedsOverview.vue';
import SettingsManageUsers from './SettingsManageUsers.vue';

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
    SettingsFeedsOverview,
    SettingsManageUsers
  },
  data() {
    return { active: 'welcome' };
  },
  mounted() {
    document.body.classList.add('modal-open');
  },
  beforeUnmount() {
    document.body.classList.remove('modal-open');
  },
  computed: {
    settingsNavigation() {
      const aiEnabled = this.$store.data.currentSelection.AIEnabled;

      return [
        { key: 'welcome', label: 'Welcome', description: 'Settings overview', icon: 'info-circle-fill', visible: true },
        { key: 'smartfolders', label: 'Smart Folders', description: 'Organize articles with AI', icon: 'folder-fill', visible: aiEnabled },
        { key: 'actions', label: 'Actions', description: 'Configure article actions', icon: 'lightning-charge-fill', visible: true },
        { key: 'scores', label: 'Scores', description: 'Set AI score thresholds', icon: 'bar-chart-fill', visible: aiEnabled },
        { key: 'topics', label: 'Topics', description: 'Manage events and topics', icon: 'diagram-3-fill', visible: aiEnabled },
        { key: 'islands', label: 'Islands', description: 'Manage interest islands', icon: 'compass-fill', visible: aiEnabled },
        { key: 'feeds', label: 'Feeds', description: 'Manage RSS subscriptions', icon: 'rss-fill', visible: true },
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
        feeds: 'SettingsFeedsOverview',
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
