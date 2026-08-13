<template>
  <div class="actions-settings settings-page">
    <!-- Info text -->
    <section class="settings-insight-card settings-insight-card--stacked actions-intro-card" aria-labelledby="actions-intro-title">
      <header class="actions-intro-heading"><span class="settings-insight-icon" aria-hidden="true"><BootstrapIcon icon="lightning-charge-fill" /></span><div><p class="settings-page-eyebrow">Settings — Automation</p><h3 id="actions-intro-title">How Actions work</h3><p>Actions automatically process incoming articles during the crawl. When an article’s content or title matches a regular expression, the selected action is applied.</p></div></header>
      <details class="actions-intro-details">
        <summary>View action types</summary>
        <div class="actions-type-grid" aria-label="Available action types">
          <article v-for="actionType in actionTypes" :key="actionType.value" class="actions-type-card"><span class="actions-type-icon" :class="actionType.iconClass" aria-hidden="true"><BootstrapIcon :icon="actionType.icon" /></span><div><h4>{{ actionType.label }}</h4><p>{{ actionType.description }}</p></div></article>
        </div>
        <div class="actions-note"><BootstrapIcon icon="lightning-charge" aria-hidden="true" /><p><strong>Performance tip:</strong> Discard actions are processed before AI analysis, saving API costs by skipping unwanted content early.</p></div>
      </details>
    </section>

    <section class="actions-list-section settings-panel" aria-labelledby="actions-list-title" :aria-busy="loading ? 'true' : 'false'">
      <header class="actions-list-heading"><div><h3 id="actions-list-title">Your Actions</h3><p>Actions are evaluated in the order shown below.</p></div><button type="button" class="app-button settings-add-button" :disabled="!loaded || saving" @click="addAction"><BootstrapIcon icon="plus-circle-fill" aria-hidden="true" />Add Action</button></header>
      <div v-if="loading" class="actions-load-state settings-state" role="status" aria-live="polite">
        <span class="app-loading-indicator app-loading-indicator--small" aria-hidden="true"></span>
        <span>Loading actions…</span>
      </div>
      <div v-else-if="loadError" class="actions-load-state actions-load-state--error settings-state settings-state--error" role="alert">
        <span>{{ loadError }}</span>
        <button type="button" class="app-button app-button--outline-secondary app-button--compact" @click="fetchActions">Retry</button>
      </div>
      <div v-else-if="loaded && actions.length" class="actions-list">
        <article v-for="(action, index) in actions" :key="index" class="actions-list-row">
          <BootstrapIcon class="actions-grip" icon="grip-vertical" aria-hidden="true" /><span class="actions-row-icon" :class="actionTypeMeta(action.actionType).iconClass" aria-hidden="true"><BootstrapIcon :icon="actionTypeMeta(action.actionType).icon" /></span>
          <div class="actions-row-fields">
            <div class="actions-field"><label :for="`action-name-${index}`">Name</label><input :id="`action-name-${index}`" v-model="action.name" type="text" class="app-form-control settings-control" placeholder="Action name" :disabled="saving" /></div>
            <div class="actions-field"><label :for="`action-type-${index}`">Type</label><div class="actions-type-control"><select :id="`action-type-${index}`" v-model="action.actionType" class="app-form-select settings-control" :disabled="saving"><option value="">Select action type</option><option v-for="actionType in actionTypes" :key="actionType.value" :value="actionType.value">{{ actionType.selectLabel }}</option></select><span v-if="action.actionType" class="actions-type-pill">{{ actionTypeMeta(action.actionType).label }}</span></div></div>
            <div v-if="action.actionType === 'tag'" class="actions-field"><label :for="`action-tag-${index}`">Tag value</label><input :id="`action-tag-${index}`" v-model="action.tagValue" type="text" class="app-form-control settings-control" placeholder="e.g., important" :disabled="saving" /></div>
            <div class="actions-field actions-field--regex"><label :for="`action-regex-${index}`">Regular Expression</label><input :id="`action-regex-${index}`" v-model="action.regularExpression" type="text" class="app-form-control settings-control" placeholder="e.g., /keyword|phrase/i" :disabled="saving" /></div>
          </div>
          <div class="actions-row-buttons"><button type="button" class="actions-edit-button settings-control settings-control--compact" :disabled="saving" :aria-label="`Edit ${action.name || 'action'}`" @click="focusActionName(index)"><BootstrapIcon icon="pencil" aria-hidden="true" /><span>Edit</span></button><button type="button" class="actions-delete-button settings-control settings-control--compact settings-control--icon-only" :disabled="saving" :aria-label="`Delete ${action.name || 'action'}`" @click="removeAction(index)"><BootstrapIcon icon="trash-fill" aria-hidden="true" /></button></div>
        </article>
      </div>
      <p v-else-if="loaded" class="actions-empty-state settings-state settings-state--empty">No actions yet. Add one to automate how incoming articles are handled.</p>
      <div v-if="loaded" class="actions-order-note"><BootstrapIcon icon="info-circle" aria-hidden="true" /><p>Actions are applied from top to bottom. Once a Discard action matches, the article will be set with a filtered indicator ensuring it will not show up in queries.</p></div>
    </section>
    <div class="settings-action-footer"><button class="actions-save-button app-button app-button--primary" type="button" :disabled="!loaded || loading || Boolean(loadError) || saving" @click="save">{{ saving ? 'Saving…' : 'Save Changes' }}</button></div>
  </div>
</template>

<style scoped>
.actions-intro-card {
  background: var(--settings-info-bg);
  border-color: var(--settings-info-border);
}

.actions-load-state {
  min-height: 140px;
}

.actions-load-state--error {
  flex-direction: column;
  color: var(--settings-danger-text);
}

.actions-intro-heading,
.actions-list-heading,
.actions-note,
.actions-order-note {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.actions-type-icon,
.actions-row-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-control);
}

.actions-intro-heading h3,
.actions-list-heading h3 {
  margin: 0;
  color: var(--text-primary);
  font-size: 20px;
  font-weight: 700;
}

.actions-intro-heading p:not(.settings-page-eyebrow),
.actions-list-heading p,
.actions-type-card p,
.actions-field label,
.actions-empty-state {
  color: var(--text-muted);
}

.actions-intro-heading p:not(.settings-page-eyebrow) {
  max-width: 720px;
  margin: 6px 0 0;
  font-size: 14px;
  line-height: 1.5;
}

.actions-intro-details {
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--settings-info-border);
}

.actions-intro-details summary {
  width: fit-content;
  color: var(--settings-info-text);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.actions-intro-details summary:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.actions-type-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.actions-type-card {
  display: flex;
  gap: 10px;
  padding: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
}

.actions-type-icon,
.actions-row-icon {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  background: var(--settings-neutral-bg);
  color: var(--settings-info-text);
  font-size: 16px;
}

.actions-type-icon--discard {
  background: var(--settings-danger-bg);
  color: var(--settings-danger-text);
}

.actions-type-icon--star {
  background: var(--badge-quality-bg);
  color: var(--badge-quality-text);
}

.actions-type-icon--read {
  background: var(--settings-info-bg);
  color: var(--settings-info-text);
}

.actions-type-icon--clicked {
  background: var(--settings-info-bg);
  color: var(--settings-info-text);
}

.actions-type-icon--advertisement {
  background: var(--settings-orange-bg);
  color: var(--settings-orange-text);
}

.actions-type-icon--badquality {
  background: var(--badge-quality-bg);
  color: var(--badge-quality-text);
}

.actions-type-icon--tag {
  background: var(--settings-rule-bg);
  color: var(--settings-rule-text);
}

.actions-type-card h4 {
  margin: 1px 0 3px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 700;
}

.actions-type-card p {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
}

.actions-note {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--settings-info-border);
  color: var(--settings-info-text);
}

.actions-note p,
.actions-order-note p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.actions-list-section {
  margin-top: 24px;
  overflow: hidden;
}

.actions-list-heading {
  align-items: center;
  justify-content: space-between;
  padding: 22px 24px;
  border-bottom: 1px solid var(--border-subtle);
}

.actions-list-heading p {
  margin: 5px 0 0;
  font-size: 13px;
}

.actions-save-button,
.actions-edit-button,
.actions-delete-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  cursor: pointer;
  font-weight: 700;
}

.actions-list-row {
  display: grid;
  grid-template-columns: 18px 34px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 18px 24px;
}

.actions-list-row + .actions-list-row {
  border-top: 1px solid var(--border-subtle);
}

.actions-grip {
  color: var(--text-muted);
  font-size: 18px;
}

.actions-row-fields {
  display: grid;
  grid-template-columns: minmax(130px, .75fr) minmax(180px, 1fr) minmax(220px, 1.35fr);
  gap: 12px;
  min-width: 0;
}

.actions-field label {
  display: block;
  margin-bottom: 5px;
  font-size: 12px;
  font-weight: 700;
}

.actions-field .app-form-control,
.actions-field .app-form-select {
  min-width: 0;
  padding: 6px 10px;
}

.actions-type-control {
  display: flex;
  align-items: center;
  gap: 6px;
}

.actions-type-control .app-form-select {
  flex: 1;
}

.actions-type-pill {
  max-width: 90px;
  overflow: hidden;
  padding: 4px 7px;
  background: var(--settings-neutral-bg);
  border-radius: var(--radius-pill);
  color: var(--settings-neutral-text);
  font-size: 11px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.actions-row-buttons {
  display: flex;
  gap: 6px;
}

.actions-edit-button {
  gap: 6px;
  padding: 0 8px;
  background: var(--color-transparent);
  border-radius: var(--radius-control);
  color: var(--settings-orange-text);
  font-size: 13px;
}

.actions-edit-button:hover {
  background: var(--settings-orange-bg);
  color: var(--settings-orange-text);
}

:global(:root[data-theme='dark'] .actions-settings .actions-edit-button:hover) {
  background: var(--settings-orange-bg);
  color: var(--settings-orange-text);
}

.actions-delete-button {
  background: var(--settings-danger-bg);
  border-radius: var(--radius-control);
  color: var(--settings-danger-text);
  font-size: 14px;
}

@media (min-width: 901px) {
  .actions-row-icon,
  .actions-row-buttons {
    align-self: end;
    margin-bottom: 2px;
  }

  .actions-grip {
    align-self: end;
    margin-bottom: 10px;
  }
}

.actions-empty-state { margin: 0; }

.actions-order-note {
  margin: 0;
  padding: 16px 24px;
  background: var(--settings-neutral-bg);
  border-top: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}

.actions-save-button {
  min-height: var(--control-height-default);
}

:global(:root[data-theme='dark'] .actions-settings .actions-type-icon--default) {
  background: var(--bg-control);
  color: var(--text-muted);
}

:global(:root[data-theme='dark'] .actions-settings .actions-intro-card),
:global(:root[data-theme='dark'] .actions-settings .actions-list-section),
:global(:root[data-theme='dark'] .actions-settings .actions-type-card) {
  background: var(--bg-modal);
  border-color: var(--border-default);
}

:global(:root[data-theme='dark'] .actions-settings .actions-list-heading),
:global(:root[data-theme='dark'] .actions-settings .actions-list-row + .actions-list-row),
:global(:root[data-theme='dark'] .actions-settings .actions-order-note),
:global(:root[data-theme='dark'] .actions-settings .actions-note) {
  border-color: var(--border-default);
}

:global(:root[data-theme='dark'] .actions-settings .actions-order-note) {
  background: var(--bg-control);
}

@media (max-width: 900px) {
  .actions-row-fields {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .actions-field--regex {
    grid-column: 1 / -1;
  }
}

@media (max-width: 879px) {
  .actions-type-grid {
    grid-template-columns: 1fr;
  }

  .actions-list-heading {
    flex-direction: column;
    padding: 20px;
  }

  .actions-list-row {
    grid-template-columns: 18px 34px minmax(0, 1fr);
    padding: 18px 20px;
  }

  .actions-row-fields,
  .actions-field--regex {
    grid-column: 1 / -1;
    grid-template-columns: 1fr;
  }

  .actions-row-buttons {
    grid-column: 3;
    justify-content: flex-end;
  }
}
</style>

<script>
import { fetchActions, saveActions } from '../../api/actions';
import { notifyActionError } from '../../services/actionNotifications.js';

export default {
  emits: ['close', 'saved'],
  data() {
    return {
      actions: [],
      loading: false,
      loadError: '',
      loaded: false,
      saving: false,
      actionTypes: [
        { value: 'discard', label: 'Discard', selectLabel: 'Discard article', icon: 'trash', iconClass: 'actions-type-icon--discard', description: 'Hides the article from normal queries.' },
        { value: 'favorite', label: 'Favorite', selectLabel: 'Set favorite', icon: 'bookmark', iconClass: 'actions-type-icon--star', description: 'Marks the article as a favorite.' },
        { value: 'read', label: 'Read', selectLabel: 'Mark as read', icon: 'eye', iconClass: 'actions-type-icon--read', description: 'Automatically marks the article as read.' },
        { value: 'clicked', label: 'Clicked', selectLabel: 'Mark as clicked', icon: 'cursor', iconClass: 'actions-type-icon--clicked', description: 'Sets the read-later indicator.' },
        { value: 'advertisement', label: 'Mark as advertisement', selectLabel: 'Mark as advertisement', icon: 'megaphone', iconClass: 'actions-type-icon--advertisement', description: 'Overrides the advertisement score to 0.' },
        { value: 'badquality', label: 'Mark as low quality', selectLabel: 'Mark as low quality', icon: 'arrow-down-square', iconClass: 'actions-type-icon--badquality', description: 'Overrides the quality score to 0.' },
        { value: 'tag', label: 'Assign tag', selectLabel: 'Assign tag', icon: 'tag', iconClass: 'actions-type-icon--tag', description: 'Adds a custom tag to the article.' }
      ]
    };
  },
  // This function loads authoritative actions before enabling the editor.
  async created() {
    await this.fetchActions();
  },
  methods: {
    // This function returns display metadata for an action type.
    actionTypeMeta(actionType) {
      return this.actionTypes.find((type) => type.value === actionType) || { label: 'Select type', icon: 'lightning-charge', iconClass: 'actions-type-icon--default' };
    },
    // This function loads the authoritative action collection before editing is allowed.
    async fetchActions() {
      if (this.loading || this.saving) return;

      this.loading = true;
      this.loaded = false;
      this.loadError = '';

      try {
        const response = await fetchActions();
        if (!Array.isArray(response?.data?.actions)) {
          throw new Error('Invalid actions response');
        }

        this.actions = response.data.actions.map(action => ({
          name: action.name || '',
          actionType: action.actionType || '',
          regularExpression: action.regularExpression || '',
          tagValue: action.tagValue || ''
        }));
        this.loaded = true;
      } catch (err) {
        console.error('Error loading article actions:', err);
        this.loadError = 'Could not load article actions. Your existing actions have not been changed.';
        notifyActionError('Could not load article actions. Please try again.', err);
      } finally {
        this.loading = false;
      }
    },
    // This function adds one editable action after the authoritative collection has loaded.
    addAction() {
      if (!this.loaded || this.saving) return;
      this.actions.push({ name: '', actionType: '', regularExpression: '', tagValue: '' });
    },
    // This function removes one local action while the editor is available.
    removeAction(index) {
      if (!this.loaded || this.saving) return;
      this.actions.splice(index, 1);
    },
    // This function focuses an action name while the editor is available.
    focusActionName(index) {
      if (!this.loaded || this.saving) return;
      this.$el.querySelector(`#action-name-${index}`)?.focus();
    },
    // This function persists only a successfully loaded action collection.
    async save() {
      if (!this.loaded || this.loading || this.loadError || this.saving) return;

      const filteredActions = this.actions.filter(a => a && a.actionType && a.actionType.trim() !== '');
      this.saving = true;

      try {
        await saveActions(filteredActions);
        this.$emit('saved');
        this.$emit('close');
      } catch (err) {
        console.error('Error saving article actions:', err);
        notifyActionError('Could not save article actions. Please try again.', err);
      } finally {
        this.saving = false;
      }
    },
    // This function closes the legacy nested actions modal state.
    closeActionsModal() {
      this.showActionsModal = false;
    }
  }
};
</script>
