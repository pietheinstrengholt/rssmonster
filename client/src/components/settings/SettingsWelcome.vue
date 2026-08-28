<template>
  <div class="settings-group settings-page">
    <SettingsPageIntro
      eyebrow="Settings — Overview"
      icon="info-circle-fill"
      title="Welcome to Settings"
      title-id="settings-welcome-title"
    >
      Choose a section to configure your reading experience or review RSSMonster activity.
    </SettingsPageIntro>

    <section class="settings-welcome__directory" aria-label="Settings sections">
      <article
        v-for="section in sectionDirectory"
        :key="section.key"
        class="settings-welcome__section settings-panel"
        :aria-labelledby="`settings-welcome-${section.key}`"
      >
        <span class="settings-welcome__icon" aria-hidden="true">
          <BootstrapIcon :icon="section.icon" />
        </span>
        <div class="settings-welcome__content">
          <div class="settings-welcome__heading">
            <h4 :id="`settings-welcome-${section.key}`">{{ section.title }}</h4>
            <span v-if="section.capability" class="settings-welcome__capability">{{ section.capability }}</span>
          </div>
          <p>{{ section.purpose }}</p>
        </div>
      </article>
    </section>
  </div>
</template>

<style scoped>
.settings-welcome__directory {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.settings-welcome__section {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
}

.settings-welcome__icon {
  display: inline-flex;
  width: var(--control-height-compact);
  height: var(--control-height-compact);
  flex: 0 0 var(--control-height-compact);
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-control);
  background: var(--settings-info-bg);
  color: var(--settings-info-text);
}

.settings-welcome__content {
  flex: 1 1 auto;
  min-width: 0;
}

.settings-welcome__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.settings-welcome__heading h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 700;
}

.settings-welcome__capability {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: var(--radius-pill);
  background: var(--settings-neutral-bg);
  color: var(--settings-neutral-text);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.settings-welcome__section p {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
}

@media (max-width: 700px) {
  .settings-welcome__directory {
    grid-template-columns: 1fr;
  }
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
    ...mapStores(useSelectionStore, useAuthStore),
    sectionDirectory() {
      const aiEnabled = this.selectionStore.currentSelection.AIEnabled;

      return [
        { key: 'smart-folders', title: 'Smart Folders', icon: 'folder-fill', purpose: 'Build saved searches that update as new articles arrive.', visible: true },
        { key: 'actions', title: 'Actions', icon: 'lightning-charge-fill', purpose: 'Automate how matching articles are handled during crawl.', visible: true },
        { key: 'scores', title: 'Scores', icon: 'bar-chart-fill', purpose: 'Set AI score thresholds that control article visibility.', capability: 'AI feature', visible: aiEnabled },
        { key: 'topics', title: 'Topics', icon: 'diagram-3-fill', purpose: 'Review current events and longer-running topic groups.', capability: 'AI feature', visible: aiEnabled },
        { key: 'islands', title: 'Islands', icon: 'compass-fill', purpose: 'Explore the interests learned from your reading behavior.', capability: 'AI feature', visible: aiEnabled },
        { key: 'crawl-statistics', title: 'Crawl Statistics', icon: 'clipboard-data-fill', purpose: 'Review daily crawl outcomes and article activity.', visible: true },
        { key: 'processing-jobs', title: 'AI Processing', icon: 'cpu-fill', purpose: 'Check background AI queue health and processing progress.', capability: 'AI feature', visible: aiEnabled },
        { key: 'observability', title: 'Observability', icon: 'activity', purpose: 'Inspect grouped processing failures and captured diagnostics.', visible: true },
        { key: 'feeds', title: 'Feeds', icon: 'rss-fill', purpose: 'Manage subscriptions, feed health, and OPML transfers.', visible: true },
        { key: 'official-sources', title: 'Official Sources', icon: 'patch-check-fill', purpose: 'Mark trusted organization domains during crawl.', visible: true },
        { key: 'users', title: 'Manage Users', icon: 'people-fill', purpose: 'Review existing accounts and update roles or access.', capability: 'Admin only', visible: this.authStore.role === 'admin' }
      ].filter(section => section.visible);
    }
  },
  name: 'SettingsWelcome'
};
</script>
