<template>
  <div class="settings-group">
    <SettingsPageIntro
      eyebrow="Settings — Overview"
      icon="info-circle-fill"
      title="Welcome to Settings"
      title-id="settings-welcome-title"
    >
      RSSMonster provides powerful automation and filtering tools to help you take control of your reading experience.
      Configure how articles are processed, filtered, and organized to surface the content that matters most to you.
    </SettingsPageIntro>

    <div v-if="selectionStore.currentSelection.AIEnabled" class="settings-welcome__section">
      <h6><strong>Smart Folders</strong></h6>
      <p class="settings-welcome__metadata">
        Create dynamic, saved searches using powerful query expressions. Filter by status (<code>unread:true</code>),
        tags (<code>tag:ai</code>), quality scores (<code>quality:>0.6</code>), dates (<code>@today</code>), and more.
        Folders update automatically as new articles arrive.
      </p>
    </div>

    <div class="settings-welcome__section">
      <h6><strong>Actions</strong></h6>
      <p class="settings-welcome__metadata">
        Define automated rules using regular expressions to process articles during crawl.
        Automatically discard unwanted content, mark articles as read, flag promotions, or favorite important topics —
        all before AI analysis runs, saving API costs.
      </p>
    </div>

    <div v-if="selectionStore.currentSelection.AIEnabled" class="settings-welcome__section">
      <h6><strong>Score Thresholds</strong></h6>
      <p class="settings-welcome__metadata">
        Control content quality by setting thresholds for advertisement, sentiment, and quality scores.
        Articles scoring above your limits are automatically filtered out. Requires OpenAI API configuration
        for AI-powered scoring during crawl.
      </p>
    </div>

    <div v-if="selectionStore.currentSelection.AIEnabled" class="settings-welcome__section">
      <h6><strong>Topics</strong></h6>
      <p class="settings-welcome__metadata">
        Review topic and event insights to see how related articles are grouped into current stories and longer-running themes.
      </p>
    </div>

    <div v-if="selectionStore.currentSelection.AIEnabled" class="settings-welcome__section">
      <h6><strong>Islands</strong></h6>
      <p class="settings-welcome__metadata">
        Explore your interest islands to understand which topics, favorites, and clicks are shaping your reading priorities.
      </p>
    </div>

    <div class="settings-welcome__section">
      <h6><strong>Crawl Statistics</strong></h6>
      <p class="settings-welcome__metadata">
        Review daily crawl activity, including new and updated articles and the number of completed or failed crawls.
      </p>
    </div>

    <div class="settings-welcome__section">
      <h6><strong>Feeds Overview</strong></h6>
      <p class="settings-welcome__metadata">
        Manage your RSS subscriptions, view feed metrics (trust score, duplication rate, article counts),
        and import/export OPML files for easy migration between RSS readers.
      </p>
    </div>

    <div v-if="this.authStore.role === 'admin'" class="settings-welcome__section">
      <h6><strong>Manage Users</strong></h6>
      <p class="settings-welcome__metadata">
        Manage user accounts, roles, and permissions for multi-user installations. Admins can create, edit, and delete users,
        as well as assign roles to control access to features and settings.
      </p>
    </div>

    <p class="settings-welcome__metadata settings-welcome__tip">
      <strong>Tip:</strong> Use the settings navigation to configure each feature. Changes are saved independently per section.
    </p>
  </div>
</template>

<style scoped>
.settings-group {
  max-width: 1100px;
}

.settings-welcome__metadata {
  margin-bottom: 0;
  color: var(--text-muted);
  font-size: 0.875em;
}

.settings-welcome__section {
  margin-bottom: 1rem;
}

.settings-welcome__section h6 {
  margin-bottom: 0.5rem;
}

.settings-welcome__tip {
  margin-top: 1.5rem;
}
</style>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { useAuthStore } from '../../store/auth.js';
import SettingsPageIntro from './SettingsPageIntro.vue';
export default {
  components: {
    SettingsPageIntro
  },
  computed: {
    ...mapStores(useSelectionStore, useAuthStore)
  },
  name: 'SettingsWelcome'
};
</script>
