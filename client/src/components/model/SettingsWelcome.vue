<template>
  <div class="settings-group">
    <section class="settings-insight-card" aria-labelledby="settings-welcome-title">
      <span class="settings-insight-icon" aria-hidden="true">
        <BootstrapIcon icon="info-circle-fill" />
      </span>
      <div>
        <p class="settings-page-eyebrow">Settings — Overview</p>
        <h3 id="settings-welcome-title">Welcome to Settings</h3>
        <p>
          RSSMonster provides powerful automation and filtering tools to help you take control of your reading experience.
          Configure how articles are processed, filtered, and organized to surface the content that matters most to you.
        </p>
      </div>
    </section>

    <div v-if="$store.data.currentSelection.AIEnabled" class="mb-3">
      <h6 class="mb-2"><strong>Smart Folders</strong></h6>
      <p class="small text-muted mb-0">
        Create dynamic, saved searches using powerful query expressions. Filter by status (<code>unread:true</code>),
        tags (<code>tag:ai</code>), quality scores (<code>quality:>0.6</code>), dates (<code>@today</code>), and more.
        Folders update automatically as new articles arrive.
      </p>
    </div>

    <div class="mb-3">
      <h6 class="mb-2"><strong>Actions</strong></h6>
      <p class="small text-muted mb-0">
        Define automated rules using regular expressions to process articles during crawl.
        Automatically discard unwanted content, mark articles as read, flag promotions, or favorite important topics —
        all before AI analysis runs, saving API costs.
      </p>
    </div>

    <div v-if="$store.data.currentSelection.AIEnabled" class="mb-3">
      <h6 class="mb-2"><strong>Score Thresholds</strong></h6>
      <p class="small text-muted mb-0">
        Control content quality by setting thresholds for advertisement, sentiment, and quality scores.
        Articles scoring above your limits are automatically filtered out. Requires OpenAI API configuration
        for AI-powered scoring during crawl.
      </p>
    </div>

    <div v-if="$store.data.currentSelection.AIEnabled" class="mb-3">
      <h6 class="mb-2"><strong>Topics</strong></h6>
      <p class="small text-muted mb-0">
        Review topic and event insights to see how related articles are grouped into current stories and longer-running themes.
      </p>
    </div>

    <div v-if="$store.data.currentSelection.AIEnabled" class="mb-3">
      <h6 class="mb-2"><strong>Islands</strong></h6>
      <p class="small text-muted mb-0">
        Explore your interest islands to understand which topics, favorites, and clicks are shaping your reading priorities.
      </p>
    </div>

    <div class="mb-3">
      <h6 class="mb-2"><strong>Feeds Overview</strong></h6>
      <p class="small text-muted mb-0">
        Manage your RSS subscriptions, view feed metrics (trust score, duplication rate, article counts),
        and import/export OPML files for easy migration between RSS readers.
      </p>
    </div>

    <div v-if="this.$store.auth.getRole === 'admin'" class="mb-3">
      <h6 class="mb-2"><strong>Manage Users</strong></h6>
      <p class="small text-muted mb-0">
        Manage user accounts, roles, and permissions for multi-user installations. Admins can create, edit, and delete users,
        as well as assign roles to control access to features and settings.
      </p>
    </div>

    <p class="small text-muted mt-4">
      <strong>Tip:</strong> Use the settings navigation to configure each feature. Changes are saved independently per section.
    </p>
  </div>
</template>

<style src="../../assets/css/settings.css"></style>

<style scoped>
.settings-group {
  max-width: 1100px;
}
</style>

<script>
export default {
  name: 'SettingsWelcome'
};
</script>
