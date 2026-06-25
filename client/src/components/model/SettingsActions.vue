<template>
  <div class="actions-settings">
    <!-- Info text -->
    <section class="settings-insight-card settings-insight-card--stacked actions-intro-card" aria-labelledby="actions-intro-title">
      <header class="actions-intro-heading"><span class="actions-intro-icon" aria-hidden="true"><BootstrapIcon icon="lightning-charge-fill" /></span><div><p class="actions-eyebrow">Automation</p><h3 id="actions-intro-title">How Actions work</h3><p>Actions automatically process incoming articles during the crawl. When an article’s content or title matches a regular expression, the selected action is applied.</p></div></header>
      <div class="actions-type-grid" aria-label="Available action types">
        <article v-for="actionType in actionTypes" :key="actionType.value" class="actions-type-card"><span class="actions-type-icon" :class="actionType.iconClass" aria-hidden="true"><BootstrapIcon :icon="actionType.icon" /></span><div><h4>{{ actionType.label }}</h4><p>{{ actionType.description }}</p></div></article>
      </div>
      <div class="actions-note"><BootstrapIcon icon="lightning-charge" aria-hidden="true" /><p><strong>Performance tip:</strong> Delete actions are processed before AI analysis, saving API costs by skipping unwanted content early.</p></div>
    </section>

    <section class="actions-list-section" aria-labelledby="actions-list-title">
      <header class="actions-list-heading"><div><h3 id="actions-list-title">Your Actions</h3><p>Actions are evaluated in the order shown below.</p></div><button type="button" class="actions-add-button" @click="addAction"><BootstrapIcon icon="plus-circle-fill" aria-hidden="true" />Add Action</button></header>
      <div v-if="actions.length" class="actions-list">
        <article v-for="(action, index) in actions" :key="index" class="actions-list-row">
          <BootstrapIcon class="actions-grip" icon="grip-vertical" aria-hidden="true" /><span class="actions-row-icon" :class="actionTypeMeta(action.actionType).iconClass" aria-hidden="true"><BootstrapIcon :icon="actionTypeMeta(action.actionType).icon" /></span>
          <div class="actions-row-fields">
            <div class="actions-field"><label :for="`action-name-${index}`">Name</label><input :id="`action-name-${index}`" v-model="action.name" type="text" class="form-control" placeholder="Action name" /></div>
            <div class="actions-field"><label :for="`action-type-${index}`">Type</label><div class="actions-type-control"><select :id="`action-type-${index}`" v-model="action.actionType" class="form-select"><option value="">Select action type</option><option v-for="actionType in actionTypes" :key="actionType.value" :value="actionType.value">{{ actionType.selectLabel }}</option></select><span v-if="action.actionType" class="actions-type-pill">{{ actionTypeMeta(action.actionType).label }}</span></div></div>
            <div v-if="action.actionType === 'tag'" class="actions-field"><label :for="`action-tag-${index}`">Tag value</label><input :id="`action-tag-${index}`" v-model="action.tagValue" type="text" class="form-control" placeholder="e.g., important" /></div>
            <div class="actions-field actions-field--regex"><label :for="`action-regex-${index}`">Regular Expression</label><input :id="`action-regex-${index}`" v-model="action.regularExpression" type="text" class="form-control" placeholder="e.g., /keyword|phrase/i" /></div>
          </div>
          <div class="actions-row-buttons"><button type="button" class="actions-edit-button" :aria-label="`Edit ${action.name || 'action'}`" @click="focusActionName(index)"><BootstrapIcon icon="pencil" aria-hidden="true" /><span>Edit</span></button><button type="button" class="actions-delete-button" :aria-label="`Delete ${action.name || 'action'}`" @click="removeAction(index)"><BootstrapIcon icon="trash-fill" aria-hidden="true" /></button></div>
        </article>
      </div>
      <p v-else class="actions-empty-state">No actions yet. Add one to automate how incoming articles are handled.</p>
      <div class="actions-order-note"><BootstrapIcon icon="info-circle" aria-hidden="true" /><p>Actions are applied from top to bottom. Once a Delete action matches, the article will not be saved and no other actions will be applied.</p></div>
    </section>
    <div class="actions-save-area"><button class="actions-save-button" type="button" @click="save">Save Changes</button></div>
  </div>
</template>

<style src="../../assets/css/settings.css"></style>
<style scoped>
.actions-settings{max-width:1100px;color:var(--text-primary)}.actions-intro-card,.actions-list-section{background:var(--bg-primary);border:1px solid var(--border-subtle);border-radius:14px}.actions-intro-card{padding:26px;background:var(--bg-info-subtle);border-color:var(--border-info)}.actions-intro-heading,.actions-list-heading,.actions-note,.actions-order-note{display:flex;align-items:flex-start;gap:14px}.actions-intro-icon,.actions-type-icon,.actions-row-icon{display:inline-flex;align-items:center;justify-content:center;border-radius:10px}.actions-intro-icon{width:42px;height:42px;flex:0 0 42px;background:var(--bg-primary);color:var(--color-primary);font-size:20px}.actions-eyebrow{margin:0 0 4px;color:var(--color-primary);font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.actions-intro-heading h3,.actions-list-heading h3{margin:0;color:var(--text-primary);font-size:20px;font-weight:700}.actions-intro-heading p:not(.actions-eyebrow),.actions-list-heading p,.actions-type-card p,.actions-field label,.actions-empty-state{color:var(--text-muted)}.actions-intro-heading p:not(.actions-eyebrow){max-width:720px;margin:6px 0 0;font-size:14px;line-height:1.5}.actions-type-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:24px}.actions-type-card{display:flex;gap:10px;padding:12px;background:var(--bg-primary);border:1px solid var(--border-subtle);border-radius:10px}.actions-type-icon,.actions-row-icon{width:34px;height:34px;flex:0 0 34px;background:var(--bg-surface-muted);color:var(--color-primary);font-size:16px}.actions-type-icon--delete{background:var(--bg-danger-subtle);color:var(--text-danger)}.actions-type-icon--star{background:var(--literal-color-hex-fef3c7);color:var(--literal-color-hex-a16207)}.actions-type-icon--read{background:var(--literal-color-hex-dbeafe);color:var(--literal-color-hex-1d4ed8)}.actions-type-icon--clicked{background:var(--literal-color-hex-e0f2fe);color:var(--literal-color-hex-0369a1)}.actions-type-icon--advertisement{background:var(--color-warning-soft);color:var(--color-warning-action)}.actions-type-icon--badquality{background:var(--literal-color-hex-f3e8ff);color:var(--literal-color-hex-7e22ce)}.actions-type-icon--tag{background:var(--literal-color-hex-dcfce7);color:var(--literal-color-hex-15803d)}.actions-type-card h4{margin:1px 0 3px;color:var(--text-primary);font-size:13px;font-weight:700}.actions-type-card p{margin:0;font-size:12px;line-height:1.4}.actions-note{margin-top:16px;padding-top:16px;border-top:1px solid var(--border-info);color:var(--text-info)}.actions-note p,.actions-order-note p{margin:0;font-size:13px;line-height:1.5}.actions-list-section{margin-top:24px;overflow:hidden}.actions-list-heading{align-items:center;justify-content:space-between;padding:22px 24px;border-bottom:1px solid var(--border-subtle)}.actions-list-heading p{margin:5px 0 0;font-size:13px}.actions-add-button,.actions-save-button,.actions-edit-button,.actions-delete-button{display:inline-flex;align-items:center;justify-content:center;border:0;cursor:pointer;font-weight:700}.actions-add-button{height:40px;gap:8px;padding:0 14px;background:var(--color-success);border-radius:8px;color:var(--text-inverted);font-size:14px}.actions-add-button:hover{background:var(--color-success-hover)}.actions-list-row{display:grid;grid-template-columns:18px 34px minmax(0,1fr) auto;gap:12px;align-items:center;padding:18px 24px}.actions-list-row+.actions-list-row{border-top:1px solid var(--border-subtle)}.actions-grip{color:var(--text-muted);font-size:18px}.actions-row-fields{display:grid;grid-template-columns:minmax(130px,.75fr) minmax(180px,1fr) minmax(220px,1.35fr);gap:12px;min-width:0}.actions-field label{display:block;margin-bottom:5px;font-size:12px;font-weight:700}.actions-field .form-control,.actions-field .form-select{height:38px;min-width:0;padding:6px 10px}.actions-type-control{display:flex;align-items:center;gap:6px}.actions-type-control .form-select{flex:1}.actions-type-pill{max-width:90px;overflow:hidden;padding:4px 7px;background:var(--bg-surface-muted);border-radius:999px;color:var(--text-secondary);font-size:11px;font-weight:700;text-overflow:ellipsis;white-space:nowrap}.actions-row-buttons{display:flex;gap:6px}.actions-edit-button{height:34px;gap:6px;padding:0 8px;background:var(--color-transparent);border-radius:6px;color:var(--color-primary);font-size:13px}.actions-edit-button:hover{background:var(--bg-surface-muted)}.actions-delete-button{width:34px;height:34px;background:var(--bg-danger-subtle);border-radius:6px;color:var(--text-danger);font-size:14px}.actions-empty-state{margin:0;padding:36px 24px;text-align:center}.actions-order-note{margin:0;padding:16px 24px;background:var(--bg-surface-muted);border-top:1px solid var(--border-subtle);color:var(--text-secondary)}.actions-save-area{display:flex;justify-content:flex-end;margin-top:20px}.actions-save-button{height:42px;gap:8px;padding:0 16px;background:var(--color-primary);border-radius:8px;color:var(--text-inverted);font-size:14px}.actions-save-button:hover{background:var(--color-primary-hover)}:global(:root[data-theme='dark']) .actions-intro-card,:global(:root[data-theme='dark']) .actions-list-section,:global(:root[data-theme='dark']) .actions-type-card{background:var(--bg-modal);border-color:var(--border-color)}:global(:root[data-theme='dark']) .actions-list-heading,:global(:root[data-theme='dark']) .actions-list-row+.actions-list-row,:global(:root[data-theme='dark']) .actions-order-note,:global(:root[data-theme='dark']) .actions-note{border-color:var(--border-color)}:global(:root[data-theme='dark']) .actions-order-note{background:var(--bg-control)}@media(max-width:900px){.actions-row-fields{grid-template-columns:repeat(2,minmax(0,1fr))}.actions-field--regex{grid-column:1/-1}}@media(max-width:766px){.actions-intro-card{padding:20px}.actions-type-grid{grid-template-columns:1fr}.actions-list-heading{flex-direction:column;padding:20px}.actions-list-row{grid-template-columns:18px 34px minmax(0,1fr);padding:18px 20px}.actions-row-fields,.actions-field--regex{grid-column:1/-1;grid-template-columns:1fr}.actions-row-buttons{grid-column:3;justify-content:flex-end}}
</style>

<style>
:root[data-theme="dark"] .actions-settings .actions-type-icon--delete { background: var(--literal-color-hex-4a2428); color: var(--literal-color-hex-ff9a9f); }
:root[data-theme="dark"] .actions-settings .actions-type-icon--star { background: var(--literal-color-hex-44391d); color: var(--literal-color-hex-f8d86b); }
:root[data-theme="dark"] .actions-settings .actions-type-icon--read { background: var(--literal-color-hex-1f3658); color: var(--literal-color-hex-8bbdff); }
:root[data-theme="dark"] .actions-settings .actions-type-icon--clicked { background: var(--literal-color-hex-1d3b4b); color: var(--literal-color-hex-82d3f4); }
:root[data-theme="dark"] .actions-settings .actions-type-icon--advertisement { background: var(--literal-color-hex-452b1e); color: var(--literal-color-hex-ffb37a); }
:root[data-theme="dark"] .actions-settings .actions-type-icon--badquality { background: var(--literal-color-hex-35264d); color: var(--literal-color-hex-c7a7ff); }
:root[data-theme="dark"] .actions-settings .actions-type-icon--tag { background: var(--literal-color-hex-1d4032); color: var(--literal-color-hex-86d8a5); }
:root[data-theme="dark"] .actions-settings .actions-type-icon--default { background: var(--bg-control); color: var(--text-muted); }
</style>

<script>
import { fetchActions, saveActions } from '../../api/actions';
import { setAuthToken } from '../../api/client';

export default {
  emits: ['close', 'saved'],
  data() {
    return {
      actions: [],
      actionTypes: [
        { value: 'delete', label: 'Delete', selectLabel: 'Delete article', icon: 'trash', iconClass: 'actions-type-icon--delete', description: 'Prevents the article from being saved.' },
        { value: 'star', label: 'Star', selectLabel: 'Set starred', icon: 'star', iconClass: 'actions-type-icon--star', description: 'Marks the article as important.' },
        { value: 'read', label: 'Read', selectLabel: 'Mark as read', icon: 'eye', iconClass: 'actions-type-icon--read', description: 'Automatically marks the article as read.' },
        { value: 'clicked', label: 'Clicked', selectLabel: 'Mark as clicked', icon: 'cursor', iconClass: 'actions-type-icon--clicked', description: 'Sets the read-later indicator.' },
        { value: 'advertisement', label: 'Mark as advertisement', selectLabel: 'Mark as advertisement', icon: 'megaphone', iconClass: 'actions-type-icon--advertisement', description: 'Overrides the advertisement score to 100.' },
        { value: 'badquality', label: 'Mark as low quality', selectLabel: 'Mark as low quality', icon: 'arrow-down-square', iconClass: 'actions-type-icon--badquality', description: 'Overrides the quality score to 100.' },
        { value: 'tag', label: 'Assign tag', selectLabel: 'Assign tag', icon: 'tag', iconClass: 'actions-type-icon--tag', description: 'Adds a custom tag to the article.' }
      ]
    };
  },
  async created() { setAuthToken(this.$store.auth.token); this.fetchActions(); },
  methods: {
    actionTypeMeta(actionType) { return this.actionTypes.find((type) => type.value === actionType) || { label: 'Select type', icon: 'lightning-charge', iconClass: 'actions-type-icon--default' }; },
    async fetchActions() { try { const resp = await fetchActions(); if (resp && resp.data && Array.isArray(resp.data.actions)) this.actions = resp.data.actions.map(a => ({ name: a.name || '', actionType: a.actionType || '', regularExpression: a.regularExpression || '', tagValue: a.tagValue || '' })); } catch (err) { console.error('Failed to fetch actions:', err); } },
    addAction() { this.actions.push({ name: '', actionType: '', regularExpression: '', tagValue: '' }); },
    removeAction(index) { this.actions.splice(index, 1); },
    focusActionName(index) { this.$el.querySelector(`#action-name-${index}`)?.focus(); },
    async save() {
      // Persist actions to the server
      const filteredActions = this.actions.filter(a => a && a.actionType && a.actionType.trim() !== '');
      try { const resp = await saveActions(filteredActions); console.log('Actions saved:', resp.data); } catch (err) { console.error('Error saving actions:', err); alert('Failed to save actions. Please try again.'); }
      this.$emit('saved'); this.$emit('close');
    },
    closeActionsModal() { this.showActionsModal = false; }
  }
};
</script>
