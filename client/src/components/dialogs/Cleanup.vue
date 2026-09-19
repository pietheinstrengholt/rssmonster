<template>
  <ConfirmDialog title="Cleanup" variant="warning" size="lg" :busy="busy" @cancel="closeDialog" @close="closeDialog">
    <template #subtitle>Remove old articles based on your settings</template>
    <div class="cleanup-dialog">
      <div class="app-notice app-notice--warning cleanup-warning">
        <BootstrapIcon icon="info-circle" aria-hidden="true" />
        <div>
          <strong>This will permanently delete articles that match the criteria below.</strong>
          <p>Favorited, unread or clicked articles can be excluded based on your settings.</p>
        </div>
      </div>
      <p v-if="loading" role="status">Loading archiving settings…</p>
      <div v-if="loadError" class="app-notice app-notice--danger" role="alert">
        <p>Could not load archiving settings.</p>
        <button class="app-button app-button--secondary" type="button" @click="loadSettings">Retry</button>
      </div>
      <p v-if="message" class="app-notice cleanup-success" role="status">{{ message }}</p>
      <form v-if="settings" ref="form" @submit.prevent="saveSettings">
        <fieldset :disabled="busy" class="cleanup-fields-container">
          <section class="cleanup-section">
            <h3>What to keep</h3>
            <p>Choose which articles should never be deleted.</p>
            <div class="cleanup-options">
              <label v-for="option in protectionOptions" :key="option.key" class="cleanup-option">
                <input v-model="settings[option.key]" type="checkbox" class="app-form-check-input">
                <span><strong>{{ option.label }}</strong><small>{{ option.help }}</small></span>
              </label>
            </div>
          </section>
          <section class="cleanup-section cleanup-section--divided">
            <h3>Age and limits</h3>
            <p>Configure how much article history RSSMonster should retain.</p>
            <div class="cleanup-fields">
              <div class="cleanup-field">
                <div>
                  <label for="cleanup-max-age">Maximum age of articles to keep</label>
                  <small id="cleanup-age-help">Applies when no article-count limit is set. Count limits can also remove newer articles.</small>
                </div>
                <div class="cleanup-age-controls">
                  <input id="cleanup-max-age" v-model.number="settings.maximumAgeValue" class="app-form-control" type="number" min="1" max="2147483647" step="1" required aria-describedby="cleanup-age-help">
                  <select v-model="settings.maximumAgeUnit" class="app-form-select" aria-label="Maximum article age unit">
                    <option value="days">Days</option><option value="weeks">Weeks</option><option value="months">Months</option><option value="years">Years</option>
                  </select>
                </div>
              </div>
              <div v-for="limit in countLimits" :key="limit.key" class="cleanup-field">
                <div>
                  <label :for="limit.key">{{ limit.label }}</label>
                  <small :id="`${limit.key}-help`">{{ limit.help }}</small>
                </div>
                <div>
                  <input :id="limit.key" v-model.number="settings[limit.key]" class="app-form-control" type="number" min="1" :max="limit.max" step="1" placeholder="Unlimited" :aria-describedby="`${limit.key}-help ${limit.key}-maximum`">
                  <small :id="`${limit.key}-maximum`">Maximum {{ limit.maximumLabel }} · Leave blank for unlimited</small>
                </div>
              </div>
            </div>
            <p class="cleanup-limits-help">Count limits take priority over age: unprotected articles above a limit are deleted oldest first, including newer articles. Without count limits, all older unprotected articles are deleted. Protected articles may keep counts above your limits.</p>
          </section>
        </fieldset>
      </form>
    </div>
    <template #footer>
      <button type="button" class="app-button app-button--secondary" :disabled="busy" autofocus @click="closeDialog">Close</button>
      <button type="button" class="app-button app-button--primary" :disabled="busy || loading || !settings" :aria-busy="savePending" @click="saveSettings">{{ savePending ? 'Saving…' : 'Save settings' }}</button>
      <button type="button" class="app-button app-button--warning" :disabled="busy || loading || !settings" :aria-busy="cleanupPending" @click="cleanupNow">
        <BootstrapIcon icon="trash3-fill" aria-hidden="true" />{{ cleanupPending ? 'Cleaning up…' : 'Cleanup now' }}
      </button>
    </template>
  </ConfirmDialog>
</template>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { useUiStore } from '../../store/ui.js';
import ConfirmDialog from './ConfirmDialog.vue';
import { cleanupOldArticles } from '../../api/cleanup';
import { fetchArchivingSettings, saveArchivingSettings } from '../../api/settings';
import { notifyActionError } from '../../services/actionNotifications.js';

export default {
  name: 'Cleanup',
  components: { ConfirmDialog },
  data() {
    return {
      settings: null,
      loading: true,
      loadError: false,
      savePending: false,
      cleanupPending: false,
      message: '',
      protectionOptions: [
        { key: 'neverDeleteUnread', label: 'Never delete unread articles', help: 'Keep all articles that are still unread.' },
        { key: 'neverDeleteFavorites', label: 'Never delete favorited articles', help: 'Keep all articles you have marked as favorite.' },
        { key: 'neverDeleteClicked', label: 'Never delete clicked articles', help: 'Keep articles with recorded outbound link clicks.' }
      ],
      countLimits: [
        { key: 'maximumArticlesPerFeed', label: 'Maximum number of articles to keep per feed', help: 'Keep at most this many articles per feed, subject to protections.', max: 1000000, maximumLabel: '1,000,000' },
        { key: 'maximumArticlesTotal', label: 'Maximum number of articles to keep in total', help: 'Keep at most this many articles across all feeds, subject to protections.', max: 1000000000, maximumLabel: '1,000,000,000' }
      ]
    };
  },
  computed: {
    ...mapStores(useSelectionStore, useUiStore),
    busy() { return this.savePending || this.cleanupPending; }
  },
  mounted() { this.loadSettings(); },
  methods: {
    async loadSettings() {
      this.loading = true;
      this.loadError = false;
      try {
        this.settings = (await fetchArchivingSettings()).data;
      } catch (error) {
        this.loadError = true;
        notifyActionError('Could not load archiving settings. Please try again.', error);
      } finally {
        this.loading = false;
      }
    },
    settingsPayload() {
      return { ...this.settings,
        maximumArticlesPerFeed: this.settings.maximumArticlesPerFeed === '' ? null : this.settings.maximumArticlesPerFeed,
        maximumArticlesTotal: this.settings.maximumArticlesTotal === '' ? null : this.settings.maximumArticlesTotal
      };
    },
    async saveSettings() {
      if (this.busy || this.loading || !this.settings || !this.$refs.form.reportValidity()) return;
      this.savePending = true;
      this.message = '';
      try {
        this.settings = (await saveArchivingSettings(this.settingsPayload())).data;
        this.message = 'Archiving settings saved.';
      } catch (error) {
        notifyActionError('Could not save archiving settings. Please try again.', error);
      } finally {
        this.savePending = false;
      }
    },
    // Save the displayed settings before removing articles and refreshing the all-articles view.
    async cleanupNow() {
      if (this.busy || this.loading || !this.settings || !this.$refs.form.reportValidity()) return;
      this.cleanupPending = true;
      this.message = '';
      try {
        this.settings = (await saveArchivingSettings(this.settingsPayload())).data;
        await cleanupOldArticles();
        //set the selection back to all and refresh the page
        this.selectionStore.selectCategory('%');
        location.reload();
      } catch (error) {
        notifyActionError('Could not clean up old articles. Please try again.', error);
      } finally {
        this.cleanupPending = false;
      }
    },
    // This function closes the cleanup dialog through the existing store contract.
    closeDialog() {
      if (!this.busy) this.uiStore.setShowModal('');
    }
  }
};
</script>

<style scoped>
.cleanup-warning { display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 1.5rem; border-left: 4px solid var(--color-warning-action); }
.cleanup-warning strong { color: var(--text-primary); font-weight: 500; }
.cleanup-warning p { margin: 0.25rem 0 0; color: var(--text-secondary); }
.cleanup-success { color: var(--settings-success-text); background: var(--settings-success-bg); border-color: var(--border-success); }
.cleanup-fields-container { min-width: 0; padding: 0; margin: 0; border: 0; }
.cleanup-section h3 { margin: 0 0 0.2rem; font-size: 1rem; font-weight: 650; }
.cleanup-section > p { margin: 0 0 1rem; color: var(--text-secondary); }
.cleanup-section--divided { margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-default); }
.cleanup-options, .cleanup-fields { display: flex; flex-direction: column; gap: 1.25rem; }
.cleanup-option { display: flex; align-items: flex-start; gap: 0.75rem; cursor: pointer; }
.cleanup-option input { flex: 0 0 auto; margin-top: 0.2rem; }
.cleanup-option strong, .cleanup-field label { font-weight: 500; }
.cleanup-dialog small { display: block; margin-top: 0.15rem; color: var(--text-secondary); font-size: 0.8125rem; }
.cleanup-field { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.5rem; align-items: center; }
.cleanup-age-controls { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0.75rem; }
.cleanup-section > .cleanup-limits-help { margin: 1rem 0 0; font-size: 0.8125rem; }
@media (max-width: 767.98px) {
  .cleanup-field { grid-template-columns: minmax(0, 1fr); gap: 0.5rem; }
}
</style>
