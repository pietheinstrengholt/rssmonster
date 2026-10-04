<template>
  <div class="settings-webhooks settings-page">
    <SettingsPageIntro
      eyebrow="Settings — Automation"
      icon="diagram-3"
      title="Webhooks"
      title-id="settings-webhooks-title"
    >
      Send matching articles to external services such as Home Assistant, n8n, Node-RED, Discord, or Slack.
    </SettingsPageIntro>

    <div class="app-notice app-notice--warning" role="status">
      Webhook delivery is not active yet. Saved configurations will not send articles until delivery support is added.
    </div>
    <div v-if="notice.message" class="app-notice" :class="notice.type === 'error' ? 'app-notice--danger' : 'app-notice--success'" :role="notice.type === 'error' ? 'alert' : 'status'">
      {{ notice.message }}
    </div>

    <div v-if="loading" class="settings-state" role="status">Loading webhooks…</div>
    <div v-else-if="loadError" class="settings-state settings-state--error" role="alert">
      <div>
        <p>{{ loadError }}</p>
        <button type="button" class="app-button app-button--outline-secondary app-button--compact" @click="loadWebhooks">Retry</button>
      </div>
    </div>
    <div v-else class="settings-webhooks__layout">
      <section class="settings-panel webhook-list-panel" aria-labelledby="webhook-list-title">
        <header class="webhook-panel-header">
          <h4 id="webhook-list-title">Configured webhooks</h4>
          <button type="button" class="app-button app-button--primary app-button--compact" @click="startCreate">
            <BootstrapIcon icon="plus-lg" aria-hidden="true" />
            New webhook
          </button>
        </header>

        <div v-if="!webhooks.length" class="settings-state settings-state--empty webhook-empty">
          <div>
            <strong>No webhooks configured</strong>
            <p>Create a webhook to send matching RSSMonster articles to another service.</p>
            <button type="button" class="app-button app-button--outline-secondary app-button--compact" @click="startCreate">New webhook</button>
          </div>
        </div>
        <div v-else class="webhook-list">
          <button
            v-for="webhook in webhooks"
            :key="webhook.id"
            type="button"
            class="webhook-list-item"
            :class="{ 'webhook-list-item--selected': !creating && selectedWebhookId === webhook.id }"
            :aria-pressed="!creating && selectedWebhookId === webhook.id"
            @click="selectWebhook(webhook)"
          >
            <span class="webhook-list-item__content">
              <strong>{{ webhook.name }}</strong>
              <span class="webhook-list-item__summary">{{ summarizeWebhookConditions(webhook.conditions, categories, webhook.matchMode) }}</span>
            </span>
            <span class="webhook-list-item__meta">
              <span class="webhook-status" :class="webhook.enabled ? 'webhook-status--enabled' : 'webhook-status--paused'">
                {{ webhook.enabled ? 'Enabled' : 'Paused' }}
              </span>
              <BootstrapIcon icon="chevron-right" aria-hidden="true" />
            </span>
          </button>
        </div>
      </section>

      <form class="settings-panel webhook-editor-panel" aria-labelledby="webhook-editor-title" @submit.prevent="save">
        <div class="webhook-panel-header">
          <h4 id="webhook-editor-title">{{ creating ? 'New webhook' : `Edit ${selectedWebhook?.name || 'webhook'}` }}</h4>
        </div>

        <div class="webhook-editor-grid">
          <label class="webhook-field">
            <span class="app-form-label">Name</span>
            <input v-model="draft.name" type="text" maxlength="255" class="app-form-control" placeholder="Home Assistant alerts" :aria-invalid="showValidation && validation.errors.name ? 'true' : 'false'" @blur="showValidation = true" />
            <span v-if="showValidation && validation.errors.name" class="webhook-field-error">{{ validation.errors.name }}</span>
          </label>
          <label class="webhook-enabled">
            <input v-model="draft.enabled" type="checkbox" class="app-form-check-input" />
            <span>Enabled</span>
          </label>
        </div>

        <label class="webhook-field">
          <span class="app-form-label">Endpoint URL</span>
          <input v-model="draft.endpointUrl" type="url" class="app-form-control" placeholder="https://n8n.example.com/webhook/rssmonster" :aria-invalid="showValidation && validation.errors.endpointUrl ? 'true' : 'false'" @blur="showValidation = true" />
          <span v-if="showValidation && validation.errors.endpointUrl" class="webhook-field-error">{{ validation.errors.endpointUrl }}</span>
        </label>

        <div class="webhook-field">
          <label for="webhook-signing-secret" class="app-form-label">Signing secret</label>
          <div class="webhook-secret">
            <input id="webhook-signing-secret" v-model="draft.secret" :type="secretVisible ? 'text' : 'password'" class="app-form-control" autocomplete="new-password" @input="secretChanged = true" />
            <button type="button" class="app-button app-button--outline-secondary settings-control settings-control--icon-only" :aria-label="secretVisible ? 'Hide signing secret' : 'Show signing secret'" @click="secretVisible = !secretVisible">
              <BootstrapIcon :icon="secretVisible ? 'eye-slash' : 'eye'" aria-hidden="true" />
            </button>
            <button type="button" class="app-button app-button--outline-secondary" @click="generateSecret">{{ creating ? 'Generate' : 'Regenerate' }}</button>
          </div>
          <p v-if="!creating" class="webhook-help">Leave blank to keep the saved secret. Enter a new value or regenerate it to replace the secret.</p>
        </div>

        <fieldset class="webhook-editor-section">
          <legend>Match mode</legend>
          <div class="webhook-match-mode" role="group" aria-label="Match mode">
            <button type="button" :class="{ active: draft.matchMode === 'ALL' }" :aria-pressed="draft.matchMode === 'ALL'" @click="draft.matchMode = 'ALL'">All conditions</button>
            <button type="button" :class="{ active: draft.matchMode === 'ANY' }" :aria-pressed="draft.matchMode === 'ANY'" @click="draft.matchMode = 'ANY'">Any condition</button>
          </div>
        </fieldset>

        <fieldset class="webhook-editor-section">
          <legend>Conditions</legend>
          <div class="webhook-condition-header" aria-hidden="true"><span>Field</span><span>Operator</span><span>Value</span><span></span></div>
          <div v-for="(condition, index) in draft.conditions" :key="condition.localId" class="webhook-condition">
            <div class="webhook-condition-row">
              <label>
                <span class="webhook-condition-label">Field</span>
                <select v-model="condition.field" class="app-form-select" :aria-label="`Condition ${index + 1} field`" :aria-invalid="showValidation && validation.errors.conditions[index] ? 'true' : 'false'" @change="changeField(condition)" @blur="showValidation = true">
                  <option value="">Select field</option>
                  <option v-for="field in fields" :key="field.value" :value="field.value">{{ field.label }}</option>
                </select>
              </label>
              <label>
                <span class="webhook-condition-label">Operator</span>
                <select v-model="condition.operator" class="app-form-select" :aria-label="`Condition ${index + 1} operator`" :aria-invalid="showValidation && validation.errors.conditions[index] ? 'true' : 'false'" :disabled="!condition.field" @blur="showValidation = true">
                  <option value="">Select operator</option>
                  <option v-for="operator in operatorsFor(condition.field)" :key="operator.value" :value="operator.value">{{ operator.label }}</option>
                </select>
              </label>
              <label>
                <span class="webhook-condition-label">Value</span>
                <select v-if="condition.field === 'category'" v-model="condition.value" class="app-form-select" :aria-label="`Condition ${index + 1} value`" :aria-invalid="showValidation && validation.errors.conditions[index] ? 'true' : 'false'" @blur="showValidation = true">
                  <option value="">Select category</option>
                  <option v-for="category in categories" :key="category.id" :value="String(category.id)">{{ category.name }}</option>
                </select>
                <select v-else-if="condition.field === 'feed'" v-model="condition.value" class="app-form-select" :aria-label="`Condition ${index + 1} value`" :aria-invalid="showValidation && validation.errors.conditions[index] ? 'true' : 'false'" @blur="showValidation = true">
                  <option value="">Select feed</option>
                  <option v-for="feed in feeds" :key="feed.id" :value="String(feed.id)">{{ feed.feedName }}</option>
                </select>
                <input v-else v-model="condition.value" type="text" class="app-form-control" :aria-label="`Condition ${index + 1} value`" :aria-invalid="showValidation && validation.errors.conditions[index] ? 'true' : 'false'" placeholder="Value to match" @blur="showValidation = true" />
              </label>
              <button type="button" class="webhook-condition-remove" :aria-label="`Remove condition ${index + 1}`" @click="removeCondition(index)">
                <BootstrapIcon icon="trash" aria-hidden="true" />
              </button>
            </div>
            <p v-if="showValidation && validation.errors.conditions[index]" class="webhook-field-error">Condition {{ index + 1 }}: {{ validation.errors.conditions[index] }}</p>
          </div>
          <button type="button" class="webhook-add-condition" @click="addCondition">
            <BootstrapIcon icon="plus-circle-fill" aria-hidden="true" />
            Add condition
          </button>
        </fieldset>

        <footer class="webhook-editor-actions">
          <button v-if="!creating" type="button" class="app-button app-button--outline-danger" :disabled="saving || deleting" @click="confirmation = true">
            <BootstrapIcon icon="trash" aria-hidden="true" />
            Delete
          </button>
          <button type="submit" class="app-button app-button--primary" :disabled="!validation.valid || saving || deleting" :aria-busy="saving ? 'true' : 'false'">
            {{ saving ? 'Saving…' : creating ? 'Create webhook' : 'Save changes' }}
          </button>
        </footer>
      </form>
    </div>

    <ConfirmDialog v-if="confirmation" title="Delete webhook?" confirm-label="Delete webhook" variant="danger" :busy="deleting" @confirm="confirmDelete" @cancel="confirmation = false" @close="confirmation = false">
      <p><strong>{{ selectedWebhook?.name }}</strong> and its saved conditions will be deleted.</p>
    </ConfirmDialog>
  </div>
</template>

<script>
import { mapStores } from 'pinia';
import { useOverviewStore } from '../../store/overview.js';
import ConfirmDialog from '../dialogs/ConfirmDialog.vue';
import SettingsPageIntro from './SettingsPageIntro.vue';
import {
  fetchWebhooks,
  createWebhook,
  updateWebhook,
  deleteWebhook
} from '../../services/webhooks.js';
import {
  WEBHOOK_FIELDS,
  webhookOperatorsFor,
  newWebhookCondition,
  summarizeWebhookConditions,
  validateWebhookDraft,
  generateWebhookSecret
} from '../../services/webhookConditions.js';

const emptyDraft = localId => ({
  name: '', enabled: true, endpointUrl: '', secret: '', matchMode: 'ALL',
  conditions: [{ ...newWebhookCondition(), localId }]
});

const errorMessage = (error, fallback) =>
  error?.response?.data?.error?.message || error?.response?.data?.message || fallback;

export default {
  name: 'SettingsWebhooks',
  components: { ConfirmDialog, SettingsPageIntro },
  data() {
    return {
      webhooks: [], loading: true, loadError: '',
      selectedWebhookId: null, creating: true, draft: emptyDraft(1), nextConditionId: 1,
      showValidation: false, secretVisible: false, secretChanged: false,
      saving: false, deleting: false, confirmation: false,
      notice: { type: 'success', message: '' }
    };
  },
  computed: {
    ...mapStores(useOverviewStore),
    categories() { return this.overviewStore.categories || []; },
    feeds() { return this.categories.flatMap(category => category.feeds || []); },
    fields() { return WEBHOOK_FIELDS; },
    selectedWebhook() { return this.webhooks.find(webhook => webhook.id === this.selectedWebhookId) || null; },
    validation() { return validateWebhookDraft(this.draft, this.categories); }
  },
  mounted() {
    this.loadWebhooks();
  },
  methods: {
    summarizeWebhookConditions,
    operatorsFor: webhookOperatorsFor,
    async loadWebhooks() {
      this.loading = true;
      this.loadError = '';
      try {
        const webhooks = await fetchWebhooks();
        if (!Array.isArray(webhooks)) throw new Error('Invalid webhooks response');
        this.webhooks = webhooks;
        if (webhooks.length) this.selectWebhook(webhooks[0]);
      } catch (error) {
        this.loadError = errorMessage(error, 'Could not load webhooks. Please try again.');
      } finally {
        this.loading = false;
      }
    },
    resetEditor() {
      this.showValidation = false;
      this.secretVisible = false;
      this.secretChanged = false;
      this.notice = { type: 'success', message: '' };
    },
    startCreate() {
      this.creating = true;
      this.selectedWebhookId = null;
      this.draft = emptyDraft(++this.nextConditionId);
      this.resetEditor();
    },
    selectWebhook(webhook) {
      this.creating = false;
      this.selectedWebhookId = webhook.id;
      this.draft = {
        name: webhook.name || '', enabled: Boolean(webhook.enabled),
        endpointUrl: webhook.endpointUrl || '', secret: '', matchMode: webhook.matchMode || 'ALL',
        conditions: (webhook.conditions || []).map(condition => ({
          field: condition.field, operator: condition.operator, value: String(condition.value),
          localId: ++this.nextConditionId
        }))
      };
      this.resetEditor();
    },
    changeField(condition) {
      condition.operator = '';
      condition.value = '';
    },
    addCondition() {
      this.draft.conditions.push({ ...newWebhookCondition(), localId: ++this.nextConditionId });
    },
    removeCondition(index) {
      this.draft.conditions.splice(index, 1);
      this.showValidation = true;
      this.$nextTick(() => this.$el.querySelector('.webhook-add-condition')?.focus());
    },
    generateSecret() {
      try {
        this.draft.secret = generateWebhookSecret();
        this.secretChanged = true;
        this.secretVisible = true;
      } catch {
        this.notice = { type: 'error', message: 'Could not generate a signing secret in this browser.' };
      }
    },
    replaceWebhook(webhook) {
      const index = this.webhooks.findIndex(item => item.id === webhook.id);
      if (index === -1) this.webhooks.push(webhook);
      else this.webhooks.splice(index, 1, webhook);
      this.webhooks.sort((left, right) => left.name.localeCompare(right.name));
    },
    async save() {
      this.showValidation = true;
      if (!this.validation.valid || this.saving || this.deleting) return;
      this.saving = true;
      this.notice = { type: 'success', message: '' };
      const payload = {
        name: this.draft.name.trim(), enabled: this.draft.enabled,
        endpointUrl: this.draft.endpointUrl.trim(), matchMode: this.draft.matchMode,
        conditions: this.draft.conditions.map(({ field, operator, value }) => ({
          field, operator, value: String(value).trim()
        }))
      };
      if (this.secretChanged) payload.secret = this.draft.secret || null;

      try {
        const wasCreating = this.creating;
        const webhook = wasCreating
          ? await createWebhook(payload)
          : await updateWebhook(this.selectedWebhookId, payload);
        this.replaceWebhook(webhook);
        this.selectWebhook(webhook);
        this.notice = { type: 'success', message: wasCreating ? 'Webhook created.' : 'Webhook saved.' };
      } catch (error) {
        this.notice = { type: 'error', message: errorMessage(error, 'Could not save webhook. Please try again.') };
      } finally {
        this.saving = false;
      }
    },
    async confirmDelete() {
      if (!this.selectedWebhook || this.deleting) return;
      this.deleting = true;
      try {
        await deleteWebhook(this.selectedWebhookId);
        this.webhooks = this.webhooks.filter(webhook => webhook.id !== this.selectedWebhookId);
        if (this.webhooks.length) this.selectWebhook(this.webhooks[0]);
        else this.startCreate();
        this.notice = { type: 'success', message: 'Webhook deleted.' };
        this.confirmation = false;
      } catch (error) {
        this.notice = { type: 'error', message: errorMessage(error, 'Could not delete webhook. Please try again.') };
      } finally {
        this.deleting = false;
      }
    }
  }
};
</script>

<style scoped>
.settings-webhooks { display: flex; flex-direction: column; gap: 16px; }
.settings-webhooks :deep(.settings-insight-card) { margin-bottom: 0; }
.settings-webhooks__layout { display: grid; grid-template-columns: minmax(260px, 0.85fr) minmax(0, 1.4fr); gap: 12px; }
.webhook-list-panel, .webhook-editor-panel { min-width: 0; padding: 16px; }
.webhook-panel-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
.webhook-panel-header h4, .webhook-editor-section legend { margin: 0; color: var(--text-primary); font-size: 16px; font-weight: 700; }
.webhook-panel-header .app-button { flex: 0 0 auto; }
.webhook-empty { min-height: 180px; }
.webhook-empty p { max-width: 280px; margin: 6px auto 14px; }
.webhook-list { display: flex; flex-direction: column; gap: 8px; }
.webhook-list-item { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 10px; padding: 12px; border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-card); color: var(--text-primary); text-align: left; cursor: pointer; }
.webhook-list-item:hover { background: var(--surface-control); }
.webhook-list-item--selected { border-color: var(--settings-info-border); background: var(--settings-info-bg); }
.webhook-list-item__content { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.webhook-list-item__content strong { font-size: 14px; }
.webhook-list-item__summary { overflow: hidden; color: var(--text-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.webhook-list-item__meta { display: flex; flex: 0 0 auto; align-items: center; gap: 8px; }
.webhook-status { padding: 3px 8px; border-radius: var(--radius-pill); font-size: 11px; font-weight: 700; }
.webhook-status--enabled { background: var(--settings-success-bg); color: var(--settings-success-text); }
.webhook-status--paused { background: var(--settings-neutral-bg); color: var(--settings-neutral-text); }
.webhook-editor-panel { display: flex; flex-direction: column; gap: 16px; }
.webhook-editor-panel .webhook-panel-header { margin-bottom: 0; }
.webhook-editor-grid { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 16px; }
.webhook-field { display: flex; min-width: 0; flex-direction: column; gap: 6px; }
.webhook-field .app-form-control { width: 100%; }
.webhook-enabled { display: inline-flex; align-items: center; gap: 8px; padding-bottom: 8px; font-size: 13px; font-weight: 600; white-space: nowrap; }
.webhook-secret { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; }
.webhook-help { margin: 0; color: var(--text-muted); font-size: 12px; line-height: 1.45; }
.webhook-field-error { margin: 0; color: var(--settings-danger-text); font-size: 12px; }
.webhook-editor-section { display: flex; min-width: 0; flex-direction: column; gap: 10px; margin: 0; padding: 0; border: 0; }
.webhook-editor-section legend { margin-bottom: 10px; padding: 0; }
.webhook-match-mode { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); padding: 3px; border-radius: var(--radius-control); background: var(--surface-control); }
.webhook-match-mode button { min-height: var(--control-height-default); border: 1px solid var(--color-transparent); border-radius: var(--radius-control); background: var(--color-transparent); color: var(--text-secondary); cursor: pointer; }
.webhook-match-mode button.active { border-color: var(--settings-info-border); background: var(--surface-card); color: var(--settings-info-text); font-weight: 700; }
.webhook-condition-header, .webhook-condition-row { display: grid; grid-template-columns: minmax(110px, 1fr) minmax(110px, 0.9fr) minmax(130px, 1.2fr) 32px; gap: 8px; align-items: center; }
.webhook-condition-header { color: var(--text-muted); font-size: 12px; font-weight: 600; }
.webhook-condition-row label { display: block; min-width: 0; }
.webhook-condition-row select, .webhook-condition-row input { width: 100%; min-width: 0; }
.webhook-condition-label { display: none; }
.webhook-condition-remove { display: inline-flex; width: 32px; height: 32px; align-items: center; justify-content: center; border: 0; border-radius: var(--radius-control); background: var(--color-transparent); color: var(--text-muted); cursor: pointer; }
.webhook-condition-remove:hover { color: var(--settings-danger-text); }
.webhook-add-condition { display: inline-flex; align-self: flex-start; align-items: center; gap: 7px; padding: 4px 0; border: 0; background: var(--color-transparent); color: var(--color-primary); font-weight: 600; cursor: pointer; }
.webhook-editor-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: auto; padding-top: 16px; border-top: 1px solid var(--border-subtle); }
.webhook-editor-actions .app-button--outline-danger { margin-right: auto; }
.webhook-list-item:focus-visible, .webhook-match-mode button:focus-visible, .webhook-condition-remove:focus-visible, .webhook-add-condition:focus-visible { outline: var(--focus-ring-width) solid var(--focus-ring-color); outline-offset: var(--focus-ring-offset); }
@media (max-width: 1100px) { .settings-webhooks__layout { grid-template-columns: 1fr; } }
@media (max-width: 650px) {
  .webhook-editor-grid, .webhook-secret { grid-template-columns: 1fr; }
  .webhook-condition-header { display: none; }
  .webhook-condition-row { grid-template-columns: 1fr; }
  .webhook-condition-label { display: block; margin-bottom: 5px; color: var(--text-secondary); font-size: 12px; font-weight: 600; }
  .webhook-condition-remove { justify-self: end; }
  .webhook-editor-actions { flex-wrap: wrap; }
}
</style>
