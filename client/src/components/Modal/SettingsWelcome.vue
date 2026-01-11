<template>
  <div class="settings-group">
    <h4>Welcome to Settings</h4>

    <p class="text-muted mb-3">
      RSSMonster provides powerful automation and filtering tools to help you take control of your reading experience.
      Configure how articles are processed, filtered, and organized to surface the content that matters most to you.
    </p>

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
        Automatically delete unwanted content, mark articles as read, flag promotions, or star important topics — 
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

    <div class="mb-3">
      <h6 class="mb-2"><strong>Feeds Overview</strong></h6>
      <p class="small text-muted mb-0">
        Manage your RSS subscriptions, view feed metrics (trust score, duplication rate, article counts), 
        and import/export OPML files for easy migration between RSS readers.
      </p>
    </div>

    <p class="small text-muted mt-4">
      <strong>Tip:</strong> Use the navigation buttons above to configure each feature. Changes are saved independently per section.
    </p>
  </div>
</template>

<style src="../../assets/css/settings.css"></style>

<script>
export default {
  name: 'SettingsWelcome'
};
</script>
