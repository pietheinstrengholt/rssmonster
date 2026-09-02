<template>
  <div class="generated-feeds-page settings-page">
    <section class="generated-feeds-header settings-insight-card" aria-labelledby="generated-feeds-title">
      <span class="settings-insight-icon" aria-hidden="true">
        <BootstrapIcon icon="rss-fill" />
      </span>
      <div class="generated-feeds-header__content">
        <p class="settings-page-eyebrow">Settings — Generated Feeds</p>
        <h3 id="generated-feeds-title">Generated Feeds</h3>
        <p>Generate RSS feeds from custom expressions and share their private URLs with another reader or service.</p>
      </div>
      <button
        type="button"
        class="app-button settings-add-button generated-feeds-create"
        :disabled="loading || operationBusy"
        @click="startCreate"
      >
        <BootstrapIcon icon="plus-circle-fill" aria-hidden="true" />
        Create Generated Feed
      </button>
    </section>

    <section class="generated-feeds-help settings-panel" aria-labelledby="generated-feeds-help-title">
      <BootstrapIcon icon="info-circle-fill" aria-hidden="true" />
      <div>
        <h4 id="generated-feeds-help-title">Uses Smart Folder expressions</h4>
        <p>Generated Feeds use the same expression syntax as Smart Folders to choose which articles appear.</p>
        <span>Examples: <code>tag:ai</code>, <code>unread:true</code>, <code>quality:&gt;=0.6 sort:quality</code></span>
      </div>
    </section>

    <div v-if="notice.message" class="generated-feeds-notice" :class="`generated-feeds-notice--${notice.type}`" :role="notice.type === 'error' ? 'alert' : 'status'">
      {{ notice.message }}
    </div>

    <div v-if="loading" class="settings-state" role="status" aria-live="polite">
      <span class="app-loading-indicator app-loading-indicator--small" aria-hidden="true"></span>
      Loading Generated Feeds…
    </div>
    <div v-else-if="loadError" class="settings-state settings-state--error" role="alert">
      <div>
        <p>{{ loadError }}</p>
        <button type="button" class="app-button app-button--outline-secondary app-button--compact" @click="loadGeneratedFeeds">Retry</button>
      </div>
    </div>
    <section v-else class="generated-feeds-overview settings-panel" aria-labelledby="generated-feeds-overview-title">
      <div class="generated-feeds-section-heading">
        <div>
          <h4 id="generated-feeds-overview-title">Your Generated Feeds</h4>
          <p>Manage expressions, external URLs, and availability.</p>
        </div>
        <span class="generated-feeds-count">{{ generatedFeeds.length }}</span>
      </div>

      <div v-if="generatedFeeds.length === 0" class="settings-state settings-state--empty">
        <div>
          <strong>No Generated Feeds yet</strong>
          <p>Create one to expose a saved article expression as RSS.</p>
        </div>
      </div>
      <div v-else class="generated-feeds-table-wrap">
        <table class="generated-feeds-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Expression</th>
              <th>RSS URL</th>
              <th>Status</th>
              <th>Updated</th>
              <th><span class="app-visually-hidden">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="generatedFeed in generatedFeeds"
              :key="generatedFeed.id"
              :class="{ 'generated-feeds-table__row--selected': selectedFeedId === generatedFeed.id && !creating }"
            >
              <td data-label="Name">
                <button type="button" class="generated-feed-select" @click="selectFeed(generatedFeed)">
                  <strong>{{ generatedFeed.name }}</strong>
                  <span v-if="generatedFeed.description">{{ generatedFeed.description }}</span>
                </button>
              </td>
              <td data-label="Expression"><code class="generated-feed-expression" :title="generatedFeed.expression">{{ generatedFeed.expression }}</code></td>
              <td data-label="RSS URL">
                <div class="generated-feed-url-cell">
                  <span :title="generatedFeed.rssUrl">{{ generatedFeed.rssUrl }}</span>
                  <button type="button" class="app-icon-button app-icon-button--compact" :aria-label="`Copy URL for ${generatedFeed.name}`" @click="copyUrl(generatedFeed)">
                    <BootstrapIcon icon="copy" aria-hidden="true" />
                  </button>
                </div>
              </td>
              <td data-label="Status"><span class="generated-feed-status" :class="{ 'generated-feed-status--disabled': !generatedFeed.enabled }">{{ generatedFeed.enabled ? 'Enabled' : 'Disabled' }}</span></td>
              <td data-label="Updated" class="generated-feed-updated">{{ relativeDate(generatedFeed.updatedAt) }}</td>
              <td data-label="Actions" class="generated-feed-actions">
                <AppDropdown :id="`generated-feed-actions-${generatedFeed.id}`" :close-key="menuCloseKey" align="end">
                  <template #trigger="{ triggerProps }">
                    <button v-bind="triggerProps" type="button" class="app-icon-button app-icon-button--compact" :aria-label="`Actions for ${generatedFeed.name}`">
                      <BootstrapIcon icon="three-dots-vertical" aria-hidden="true" />
                    </button>
                  </template>
                  <template #menu="{ menuProps }">
                    <div v-bind="menuProps">
                      <button type="button" class="app-dropdown__item" role="menuitem" @click="selectFeed(generatedFeed)">Edit</button>
                      <button type="button" class="app-dropdown__item" role="menuitem" @click="copyUrl(generatedFeed)">Copy URL</button>
                      <button type="button" class="app-dropdown__item" role="menuitem" @click="requestConfirmation('regenerate', generatedFeed)">Regenerate URL</button>
                      <button type="button" class="app-dropdown__item" role="menuitem" @click="toggleEnabled(generatedFeed)">{{ generatedFeed.enabled ? 'Disable' : 'Enable' }}</button>
                      <div class="app-dropdown__divider" role="separator"></div>
                      <button type="button" class="app-dropdown__item generated-feed-delete-action" role="menuitem" @click="requestConfirmation('delete', generatedFeed)">Delete</button>
                    </div>
                  </template>
                </AppDropdown>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="editorOpen" class="generated-feed-details" aria-labelledby="generated-feed-editor-title">
      <form class="generated-feed-editor settings-panel" @submit.prevent="saveGeneratedFeed">
        <div class="generated-feed-editor__heading">
          <div>
            <p class="settings-page-eyebrow">{{ creating ? 'New Generated Feed' : 'Edit Generated Feed' }}</p>
            <h4 id="generated-feed-editor-title">{{ creating ? 'Create Generated Feed' : `Edit: ${selectedFeed?.name || ''}` }}</h4>
          </div>
          <label class="generated-feed-enabled">
            <input v-model="draft.enabled" type="checkbox" class="app-form-check-input" />
            Enabled
          </label>
        </div>

        <div class="generated-feed-fields-row">
          <label class="generated-feed-field">
            <span class="app-form-label">Name</span>
            <input v-model="draft.name" type="text" maxlength="255" class="app-form-control" :aria-invalid="fieldErrors.name ? 'true' : 'false'" placeholder="e.g. High Quality AI" />
            <span v-if="fieldErrors.name" class="generated-feed-field-error">{{ fieldErrors.name }}</span>
          </label>
          <label class="generated-feed-field">
            <span class="app-form-label">Description <span class="generated-feed-optional">(optional)</span></span>
            <input v-model="draft.description" type="text" maxlength="2000" class="app-form-control" placeholder="What this feed contains" />
          </label>
        </div>

        <ExpressionEditor
          v-model="draft.expression"
          class="generated-feed-expression-field"
          :force-validation="validationRequested || (submitAttempted && !expressionValidation.valid)"
          @update:model-value="validationRequested = false"
        >
          <template #help>Use the same expression syntax as Smart Folders. Each Generated Feed includes at most 50 articles. Examples: <code>tag:ai</code>, <code>unread:true</code>, <code>quality:&gt;=0.6 sort:quality</code>.</template>
        </ExpressionEditor>

        <div class="generated-feed-editor__actions">
          <button type="button" class="app-button app-button--outline-secondary" :disabled="saving" @click="cancelEditor">Cancel</button>
          <button type="submit" class="app-button app-button--primary" :disabled="saving" :aria-busy="saving ? 'true' : 'false'">{{ saving ? 'Saving…' : creating ? 'Create Feed' : 'Save Changes' }}</button>
        </div>
      </form>

      <aside class="generated-feed-sharing settings-panel" aria-labelledby="generated-feed-sharing-title">
        <span class="generated-feed-sharing__icon" aria-hidden="true"><BootstrapIcon icon="broadcast" /></span>
        <h4 id="generated-feed-sharing-title">RSS Feed URL</h4>
        <p>Use this private URL in any RSS-compatible reader or service.</p>
        <template v-if="!creating && selectedFeed">
          <div class="generated-feed-sharing__url">
            <input ref="sharingUrl" class="app-form-control" type="text" readonly :value="selectedFeed.rssUrl" aria-label="Generated RSS feed URL" />
            <button type="button" class="app-button app-button--outline-secondary" @click="copyUrl(selectedFeed)">
              <BootstrapIcon icon="copy" aria-hidden="true" />
              Copy
            </button>
          </div>
          <p class="generated-feed-regenerated">Last regenerated {{ relativeDate(selectedFeed.tokenRegeneratedAt).toLowerCase() }}</p>
          <button type="button" class="app-button app-button--outline-secondary" :disabled="operationBusy" @click="requestConfirmation('regenerate', selectedFeed)">
            <BootstrapIcon icon="arrow-repeat" aria-hidden="true" />
            Regenerate URL
          </button>
          <p class="generated-feed-sharing__warning">Anyone with this URL can read matching articles. Regenerating it immediately invalidates the existing URL.</p>
        </template>
        <p v-else class="generated-feed-sharing__pending">The private RSS URL will be generated after you create the feed.</p>
      </aside>
    </section>

    <ConfirmDialog
      v-if="confirmation"
      :title="confirmation.type === 'delete' ? 'Delete Generated Feed?' : 'Regenerate generated feed URL?'"
      :confirm-label="confirmation.type === 'delete' ? 'Delete Feed' : 'Regenerate URL'"
      :variant="confirmation.type === 'delete' ? 'danger' : 'warning'"
      :busy="operationBusy"
      @confirm="confirmAction"
      @cancel="confirmation = null"
      @close="confirmation = null"
    >
      <template v-if="confirmation.type === 'delete'">
        <p><strong>{{ confirmation.feed.name }}</strong> will be deleted. Matching articles will not be removed.</p>
      </template>
      <template v-else>
        <p>The existing URL will stop working immediately. RSS readers using it will no longer receive updates.</p>
      </template>
    </ConfirmDialog>
  </div>
</template>

<script>
import AppDropdown from '../shared/AppDropdown.vue';
import ConfirmDialog from '../dialogs/ConfirmDialog.vue';
import ExpressionEditor from './shared/ExpressionEditor.vue';
import {
  createGeneratedFeed,
  deleteGeneratedFeed,
  fetchGeneratedFeeds,
  regenerateGeneratedFeedToken,
  updateGeneratedFeed
} from '../../api/generatedFeeds.js';
import { validateSmartFolderQuery } from '../../services/queryValidation.js';
import { formatRelativeDate } from '../../utils/date.js';

const emptyDraft = () => ({
  name: '',
  description: '',
  expression: '',
  enabled: true
});

const errorMessage = (error, fallback) =>
  error?.response?.data?.error?.message
  || error?.response?.data?.message
  || fallback;

export default {
  name: 'SettingsGeneratedFeeds',
  components: { AppDropdown, ConfirmDialog, ExpressionEditor },
  data() {
    return {
      generatedFeeds: [],
      loading: true,
      loadError: '',
      selectedFeedId: null,
      creating: false,
      draft: emptyDraft(),
      saving: false,
      operationBusy: false,
      confirmation: null,
      menuCloseKey: 0,
      validationRequested: false,
      submitAttempted: false,
      notice: { type: 'success', message: '' }
    };
  },
  computed: {
    selectedFeed() {
      return this.generatedFeeds.find(feed => feed.id === this.selectedFeedId) || null;
    },
    editorOpen() {
      return this.creating || this.selectedFeed !== null;
    },
    expressionValidation() {
      return validateSmartFolderQuery(this.draft.expression);
    },
    fieldErrors() {
      return {
        name: this.submitAttempted && !this.draft.name.trim() ? 'Name cannot be empty.' : ''
      };
    }
  },
  mounted() {
    this.loadGeneratedFeeds();
  },
  methods: {
    relativeDate(value) {
      return formatRelativeDate(value) || 'Not available';
    },
    clearNotice() {
      this.notice = { type: 'success', message: '' };
    },
    showNotice(message, type = 'success') {
      this.notice = { type, message };
    },
    async loadGeneratedFeeds() {
      this.loading = true;
      this.loadError = '';
      try {
        const response = await fetchGeneratedFeeds();
        this.generatedFeeds = response.data.generatedFeeds || [];
      } catch (error) {
        this.loadError = errorMessage(error, 'Could not load Generated Feeds. Please try again.');
      } finally {
        this.loading = false;
      }
    },
    draftFromFeed(feed) {
      return {
        name: feed.name || '',
        description: feed.description || '',
        expression: feed.expression || '',
        enabled: Boolean(feed.enabled)
      };
    },
    startCreate() {
      this.creating = true;
      this.selectedFeedId = null;
      this.draft = emptyDraft();
      this.resetValidation();
      this.clearNotice();
    },
    selectFeed(feed) {
      this.creating = false;
      this.selectedFeedId = feed.id;
      this.draft = this.draftFromFeed(feed);
      this.resetValidation();
      this.menuCloseKey += 1;
      this.clearNotice();
    },
    cancelEditor() {
      this.creating = false;
      this.selectedFeedId = null;
      this.draft = emptyDraft();
      this.resetValidation();
    },
    resetValidation() {
      this.validationRequested = false;
      this.submitAttempted = false;
    },
    replaceFeed(updatedFeed) {
      const index = this.generatedFeeds.findIndex(feed => feed.id === updatedFeed.id);
      if (index === -1) this.generatedFeeds.push(updatedFeed);
      else this.generatedFeeds.splice(index, 1, updatedFeed);
      this.generatedFeeds.sort((left, right) => left.name.localeCompare(right.name));
    },
    async saveGeneratedFeed() {
      this.submitAttempted = true;
      this.validationRequested = true;
      if (this.fieldErrors.name || !this.expressionValidation.valid) return;

      this.saving = true;
      this.clearNotice();
      const payload = {
        name: this.draft.name.trim(),
        description: this.draft.description.trim() || null,
        expression: this.draft.expression.trim(),
        enabled: this.draft.enabled
      };
      try {
        const wasCreating = this.creating;
        const response = wasCreating
          ? await createGeneratedFeed(payload)
          : await updateGeneratedFeed(this.selectedFeedId, payload);
        const updatedFeed = response.data.generatedFeed;
        this.replaceFeed(updatedFeed);
        this.creating = false;
        this.selectedFeedId = updatedFeed.id;
        this.draft = this.draftFromFeed(updatedFeed);
        this.resetValidation();
        this.showNotice(wasCreating ? 'Generated Feed created.' : 'Generated Feed saved.');
      } catch (error) {
        this.showNotice(errorMessage(error, 'Could not save the Generated Feed. Please try again.'), 'error');
      } finally {
        this.saving = false;
      }
    },
    async copyUrl(feed) {
      this.menuCloseKey += 1;
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(feed.rssUrl);
        this.showNotice(`Copied the RSS URL for ${feed.name}.`);
      } catch {
        this.showNotice('Could not copy the RSS URL. Select it from the sharing panel instead.', 'error');
        this.$nextTick(() => this.$refs.sharingUrl?.select?.());
      }
    },
    requestConfirmation(type, feed) {
      this.menuCloseKey += 1;
      this.confirmation = { type, feed };
    },
    async confirmAction() {
      if (!this.confirmation || this.operationBusy) return;
      const { type, feed } = this.confirmation;
      this.operationBusy = true;
      this.clearNotice();
      try {
        if (type === 'delete') {
          await deleteGeneratedFeed(feed.id);
          this.generatedFeeds = this.generatedFeeds.filter(item => item.id !== feed.id);
          if (this.selectedFeedId === feed.id) this.cancelEditor();
          this.showNotice('Generated Feed deleted.');
        } else {
          const response = await regenerateGeneratedFeedToken(feed.id);
          this.replaceFeed(response.data.generatedFeed);
          if (this.selectedFeedId === feed.id) {
            this.draft = this.draftFromFeed(response.data.generatedFeed);
          }
          this.showNotice('Generated Feed URL regenerated.');
        }
        this.confirmation = null;
      } catch (error) {
        this.showNotice(errorMessage(error, `Could not ${type} the Generated Feed. Please try again.`), 'error');
      } finally {
        this.operationBusy = false;
      }
    },
    async toggleEnabled(feed) {
      if (this.operationBusy) return;
      this.menuCloseKey += 1;
      this.operationBusy = true;
      this.clearNotice();
      try {
        const response = await updateGeneratedFeed(feed.id, { enabled: !feed.enabled });
        this.replaceFeed(response.data.generatedFeed);
        if (this.selectedFeedId === feed.id) {
          this.draft = this.draftFromFeed(response.data.generatedFeed);
        }
        this.showNotice(`Generated Feed ${feed.enabled ? 'disabled' : 'enabled'}.`);
      } catch (error) {
        this.showNotice(errorMessage(error, 'Could not update the Generated Feed status.'), 'error');
      } finally {
        this.operationBusy = false;
      }
    }
  }
};
</script>

<style scoped>
.generated-feeds-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.generated-feeds-header {
  align-items: flex-start;
  margin: 0;
}

.generated-feeds-header__content {
  min-width: 0;
  flex: 1;
}

.generated-feeds-create {
  flex: 0 0 auto;
  white-space: nowrap;
}

.generated-feeds-help {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 18px;
  color: var(--text-secondary);
}

.generated-feeds-help > svg {
  flex: 0 0 auto;
  margin-top: 2px;
  color: var(--color-primary);
}

.generated-feeds-help h4,
.generated-feeds-section-heading h4,
.generated-feed-editor__heading h4,
.generated-feed-sharing h4 {
  margin: 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 700;
}

.generated-feeds-help p,
.generated-feeds-help span,
.generated-feeds-section-heading p,
.generated-feed-sharing p,
.settings-state p {
  margin: 4px 0 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.generated-feeds-help code,
.generated-feed-expression {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.generated-feeds-notice {
  padding: 12px 14px;
  border: 1px solid var(--border-success);
  border-radius: var(--radius-control);
  background: var(--settings-success-bg);
  color: var(--settings-success-text);
  font-size: 13px;
}

.generated-feeds-notice--error {
  border-color: var(--settings-danger-border);
  background: var(--settings-danger-bg);
  color: var(--settings-danger-text);
}

.generated-feeds-overview {
  overflow: visible;
}

.generated-feeds-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border-subtle);
}

.generated-feeds-count,
.generated-feed-status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px 8px;
  border-radius: var(--radius-pill);
  background: var(--settings-success-bg);
  color: var(--settings-success-text);
  font-size: 11px;
  font-weight: 700;
}

.generated-feeds-count,
.generated-feed-status--disabled {
  background: var(--settings-neutral-bg);
  color: var(--settings-neutral-text);
}

.generated-feeds-table-wrap {
  min-width: 0;
}

.generated-feeds-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
}

.generated-feeds-table th {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  text-align: left;
  text-transform: uppercase;
}

.generated-feeds-table th:nth-child(1) { width: 19%; }
.generated-feeds-table th:nth-child(2) { width: 24%; }
.generated-feeds-table th:nth-child(3) { width: 25%; }
.generated-feeds-table th:nth-child(4) { width: 10%; }
.generated-feeds-table th:nth-child(5) { width: 13%; }
.generated-feeds-table th:nth-child(6) { width: 9%; }

.generated-feeds-table td {
  min-width: 0;
  padding: 12px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  vertical-align: middle;
}

.generated-feeds-table tbody tr:last-child td {
  border-bottom: 0;
}

.generated-feeds-table tbody tr:hover,
.generated-feeds-table__row--selected {
  background: var(--surface-hover);
}

.generated-feed-select {
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  padding: 0;
  border: 0;
  background: var(--color-transparent);
  color: inherit;
  text-align: left;
}

.generated-feed-select strong,
.generated-feed-select span,
.generated-feed-expression,
.generated-feed-url-cell > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.generated-feed-select strong {
  color: var(--text-primary);
  font-size: 14px;
}

.generated-feed-select span,
.generated-feed-updated {
  color: var(--text-muted);
  font-size: 12px;
}

.generated-feed-expression {
  display: block;
  padding: 4px 6px;
  border-radius: var(--radius-control);
  background: var(--surface-chrome);
  color: var(--text-secondary);
}

.generated-feed-url-cell {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.generated-feed-url-cell > span {
  flex: 1;
}

.generated-feed-actions {
  text-align: right;
}

.generated-feed-actions :deep(.app-dropdown) {
  display: inline-block;
  text-align: left;
}

.generated-feed-delete-action {
  color: var(--settings-danger-text);
}

.generated-feed-details {
  display: grid;
  grid-template-columns: minmax(0, 1.65fr) minmax(260px, 0.85fr);
  align-items: start;
  gap: 20px;
}

.generated-feed-editor,
.generated-feed-sharing {
  padding: 22px;
}

.generated-feed-editor__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.generated-feed-enabled {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

.generated-feed-fields-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.generated-feed-field {
  display: block;
  min-width: 0;
}

.generated-feed-expression-field {
  margin-top: 16px;
}

.generated-feed-optional {
  color: var(--text-muted);
  font-weight: 400;
}

.generated-feed-field-error {
  color: var(--settings-danger-text);
  font-size: 12px;
  display: block;
  margin-top: 5px;
}

.generated-feed-editor__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
  padding-top: 18px;
  border-top: 1px solid var(--border-subtle);
}

.generated-feed-sharing__icon {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  margin-bottom: 14px;
  border-radius: var(--radius-control);
  background: var(--settings-info-bg);
  color: var(--settings-info-text);
}

.generated-feed-sharing__url {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}

.generated-feed-sharing__url input {
  min-width: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.generated-feed-sharing .generated-feed-regenerated {
  margin-bottom: 8px;
}

.generated-feed-sharing .generated-feed-sharing__warning {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
  font-size: 12px;
}

.generated-feed-sharing__pending {
  padding: 18px 0;
}

@media (max-width: 960px) {
  .generated-feed-details {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .generated-feeds-header {
    flex-wrap: wrap;
  }

  .generated-feeds-create {
    width: 100%;
  }

  .generated-feeds-table,
  .generated-feeds-table tbody,
  .generated-feeds-table tr,
  .generated-feeds-table td {
    display: block;
    width: 100%;
  }

  .generated-feeds-table thead {
    display: none;
  }

  .generated-feeds-table tr {
    padding: 14px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .generated-feeds-table td {
    display: grid;
    grid-template-columns: 88px minmax(0, 1fr);
    gap: 10px;
    padding: 6px 0;
    border: 0;
  }

  .generated-feeds-table td::before {
    content: attr(data-label);
    color: var(--text-muted);
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .generated-feed-actions {
    text-align: left;
  }

  .generated-feed-fields-row {
    grid-template-columns: 1fr;
  }

  .generated-feed-sharing__url,
  .generated-feed-editor__actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
