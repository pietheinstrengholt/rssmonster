<template>
  <div class="modal">
    <div class="modal-dialog">
      <div class="modal-content">

        <div class="modal-header">
          <h5 class="modal-title">Settings</h5>
          <button class="btn-close" @click="$emit('close')" />
        </div>

        <div class="modal-body">
          <component
            :is="activeComponent"
            @close="active = 'welcome'"
            @saved="handleSaved"
          />
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="active = 'welcome'">Welcome</button>
          <button v-if="$store.data.currentSelection.AIEnabled" class="btn btn-secondary" @click="active = 'smartfolders'">Smart Folders</button>
          <button class="btn btn-secondary" @click="active = 'actions'">Actions</button>
          <button v-if="$store.data.currentSelection.AIEnabled" class="btn btn-secondary" @click="active = 'scores'">Scores</button>
          <button class="btn btn-secondary" @click="active = 'feeds'">Feeds</button>
        </div>

      </div>
    </div>
  </div>
</template>

<style src="../../assets/css/settings.css"></style>

<script>
import SettingsWelcome from './SettingsWelcome.vue';
import SmartFoldersSettings from './SmartFoldersSettings.vue';
import ActionsSettings from './ActionsSettings.vue';
import ScoresSettings from './ScoresSettings.vue';
import FeedsOverview from './FeedsOverview.vue';

export default {
  name: 'SettingsModal',
  emits: ['close', 'forceReload'],
  components: {
    SettingsWelcome,
    SmartFoldersSettings,
    ActionsSettings,
    ScoresSettings,
    FeedsOverview
  },
  data() {
    return { active: 'welcome' };
  },
  computed: {
    activeComponent() {
      return {
        welcome: 'SettingsWelcome',
        smartfolders: 'SmartFoldersSettings',
        actions: 'ActionsSettings',
        scores: 'ScoresSettings',
        feeds: 'FeedsOverview'
      }[this.active];
    }
  },
  methods: {
    handleSaved() {
      this.$emit('forceReload');
    }
  }
};
</script>
