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
          <button v-if="$store.data.currentSelection.AIEnabled" class="btn btn-secondary" @click="active = 'smartfolders'">Smart Folders</button>
          <button class="btn btn-secondary" @click="active = 'actions'">Actions</button>
          <button v-if="$store.data.currentSelection.AIEnabled" class="btn btn-secondary" @click="active = 'scores'">Scores</button>
          <button v-if="$store.data.currentSelection.AIEnabled" class="btn btn-secondary" @click="active = 'topics'">Topics</button>
          <button v-if="$store.data.currentSelection.AIEnabled" class="btn btn-secondary" @click="active = 'islands'">Islands</button>
          <button class="btn btn-secondary" @click="active = 'feeds'">Feeds</button>
          <button v-if="$store.auth.getRole === 'admin'" class="btn btn-secondary" @click="active = 'users'">Manage Users</button>
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
import SettingsIslands from './SettingsIslands.vue';
import SettingsTopics from './SettingsTopics.vue';
import FeedsOverview from './FeedsOverview.vue';
import ManageUsers from './ManageUsers.vue';

export default {
  name: 'SettingsModal',
  emits: ['close', 'forceReload'],
  components: {
    SettingsWelcome,
    SmartFoldersSettings,
    ActionsSettings,
    ScoresSettings,
    SettingsIslands,
    SettingsTopics,
    FeedsOverview,
    ManageUsers
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
    activeComponent() {
      return {
        welcome: 'SettingsWelcome',
        smartfolders: 'SmartFoldersSettings',
        actions: 'ActionsSettings',
        scores: 'ScoresSettings',
        topics: 'SettingsTopics',
        islands: 'SettingsIslands',
        feeds: 'FeedsOverview',
        users: 'ManageUsers'
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
