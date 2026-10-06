<template>
  <AppDropdown v-if="canSaveSearch" ref="dropdown" align="end" fixed :close-key="selectionKey" class="save-smart-folder" :class="{ 'save-smart-folder--menu-item': menuItem }">
    <template #trigger="{ triggerProps }">
      <slot name="trigger" :trigger-props="triggerProps" :is-saving="isSaving">
        <button v-bind="triggerProps" type="button" class="app-button app-button--outline-secondary app-button--compact" aria-haspopup="dialog" :disabled="isSaving">
          <BootstrapIcon icon="folder-plus" context="control" aria-hidden="true" />
          <span>Save as smart folder</span>
        </button>
      </slot>
    </template>
    <template #menu="{ menuProps }">
      <form v-if="dropdown?.isOpen" v-bind="menuProps" role="dialog" aria-modal="false" :aria-labelledby="`${menuProps.id}-title`" class="save-smart-folder__popover" @submit.prevent="save" @keydown.stop="onKeydown">
        <div class="save-smart-folder__header">
          <h3 :id="`${menuProps.id}-title`">Save current view</h3>
          <button type="button" class="app-button app-button--icon-only" aria-label="Close" :disabled="isSaving" @click="dropdown.close(true)"><BootstrapIcon icon="x-lg" aria-hidden="true" /></button>
        </div>
        <p>Create a smart folder from the filters and context currently applied.</p>
        <label class="app-form-label" :for="`${menuProps.id}-name`">Folder name</label>
        <input :id="`${menuProps.id}-name`" ref="nameInput" v-model.trim="folderName" class="app-form-control" type="text" required maxlength="255" autocomplete="off" :disabled="isSaving" />
        <p class="app-form-label">Rules included</p>
        <div class="save-smart-folder__chips"><span v-for="rule in rulePreview" :key="rule.id" class="save-smart-folder__chip" :class="ruleBadgeClass(rule)">{{ rule.label }}</span></div>
        <p v-if="omittedContext" class="app-form-help">Feed/category context and publication-date controls are not included; Smart Folders have no equivalent rules.</p>
        <p v-if="saveError || !validation.valid" role="alert">{{ saveError || validation.error }}</p>
        <div class="save-smart-folder__actions">
          <button type="button" class="app-button app-button--outline-secondary" :disabled="isSaving" @click="dropdown.close(true)">Cancel</button>
          <button type="submit" class="app-button app-button--primary" :disabled="!folderName || !validation.valid || isSaving">{{ isSaving ? 'Saving…' : 'Save smart folder' }}</button>
        </div>
      </form>
    </template>
  </AppDropdown>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import AppDropdown from '../shared/AppDropdown.vue';
import { useSelectionStore } from '../../store/selection.js';
import { useOverviewStore } from '../../store/overview.js';
import { currentViewSmartFolder, smartFolderRulePreview } from '../../services/currentViewSmartFolder.js';
import { validateSmartFolderQuery } from '../../services/queryValidation.js';
import { saveSmartFolders } from '../../api/smartfolders.js';
import { notifyActionError, notifyActionSuccess } from '../../services/actionNotifications.js';

defineProps({ menuItem: { type: Boolean, default: false } });

const selectionStore = useSelectionStore();
const overviewStore = useOverviewStore();
const dropdown = ref(null);
const nameInput = ref(null);
const folderName = ref('');
const draft = ref(currentViewSmartFolder(selectionStore.currentSelection, selectionStore));
const isSaving = ref(false);
const saveError = ref('');
const canSaveSearch = computed(() => {
  const { smartFolderId, status, search } = selectionStore.currentSelection;
  // Briefing owns a generated query rather than a user search.
  return smartFolderId == null && status !== 'briefing' && Boolean(search?.trim());
});
const selectionKey = computed(() => JSON.stringify([selectionStore.currentSelection, selectionStore.dateRange, selectionStore.ageCutoff, selectionStore.customDateRange]));
const rulePreview = computed(() => smartFolderRulePreview(draft.value.query));
const validation = computed(() => validateSmartFolderQuery(draft.value.query));
const omittedContext = computed(() => selectionStore.currentSelection.feedId !== '%' || selectionStore.currentSelection.categoryId !== '%' || !['all', 'today', 'yesterday'].includes(selectionStore.dateRange) || selectionStore.ageCutoff !== 'all');
watch(() => dropdown.value?.isOpen, async open => {
  if (!open) return;
  draft.value = currentViewSmartFolder(selectionStore.currentSelection, selectionStore);
  folderName.value = draft.value.name;
  saveError.value = '';
  await nextTick();
  nameInput.value?.focus();
  nameInput.value?.select();
});
function ruleBadgeClass(rule) {
  if (rule.key === 'sort' && rule.value === 'recommended') return 'recommended-badge';
  if (['grouping', 'event', 'developing', 'eventcount'].includes(rule.key)) return 'source-badge';
  if (rule.key === 'quality') {
    const score = Math.round(Number(rule.value.match(/[\d.]+$/)?.[0]) * 100);
    return score >= 80 ? 'score-good' : score >= 60 ? 'score-medium' : 'score-poor';
  }
  return 'tag';
}
function onKeydown(event) {
  if (event.key === 'Escape') {
    event.preventDefault();
    dropdown.value.close(true);
  }
}
async function save() {
  if (isSaving.value || !folderName.value.trim() || !validation.value.valid) return;
  isSaving.value = true;
  saveError.value = '';
  try {
    // The Settings API replaces the complete collection: never append to a stale snapshot.
    if (!await overviewStore.fetchSmartFolders()) throw new Error('Smart Folders changed while loading. Please try again.');
    const folders = overviewStore.smartFolders;
    const { data } = await saveSmartFolders([...folders, { ...draft.value, name: folderName.value.trim() }]);
    const activeId = selectionStore.currentSelection.smartFolderId;
    if (activeId != null) selectionStore.setSmartFolder(data.smartFolders[folders.findIndex(folder => folder.id === activeId)] ?? null);
    overviewStore.setSmartFolders(data.smartFolders);
    dropdown.value?.close(true);
    notifyActionSuccess('Smart Folder saved.');
    try {
      await overviewStore.fetchSmartFolders();
    } catch (error) {
      notifyActionError('Smart Folder was saved, but the sidebar couldn’t refresh. Try again.', error, () => overviewStore.fetchSmartFolders());
    }
  } catch (error) {
    saveError.value = error.response?.data?.error?.message || 'Smart Folder wasn’t saved. Your draft is still here. Try again.';
    notifyActionError(saveError.value, error);
  } finally {
    isSaving.value = false;
  }
}
</script>

<style scoped>
.save-smart-folder { margin-left: auto; min-width: 0; }
.save-smart-folder__popover { width: min(24rem, calc(100vw - 2rem)); min-width: 0; max-height: calc(100dvh - 2rem); overflow-y: auto; padding: 1rem; overflow-wrap: anywhere; }
.save-smart-folder__header { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.save-smart-folder__header h3 { margin: 0; font-size: 1.1rem; color: var(--text-primary); }
.save-smart-folder__popover p { margin: 0.75rem 0; color: var(--text-secondary); }
.save-smart-folder__chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.save-smart-folder__chip {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  padding: 3px 8px;
  border: 1px solid var(--color-transparent);
  border-radius: var(--radius-compact);
  background-color: var(--article-tag-background);
  color: var(--badge-tag-text);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  vertical-align: middle;
}
.save-smart-folder__chip.recommended-badge { background-color: var(--badge-quality-bg); color: var(--badge-quality-text); }
.save-smart-folder__chip.source-badge { background-color: var(--article-source-diversity-background); color: var(--article-source-diversity-text); }
.save-smart-folder__chip.score-good { background-color: var(--article-score-good-background); color: var(--article-score-good-text); }
.save-smart-folder__chip.score-medium { background-color: var(--article-score-medium-background); color: var(--article-score-medium-text); }
.save-smart-folder__chip.score-poor { background-color: var(--article-score-poor-background); color: var(--article-score-poor-text); }
.save-smart-folder__actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-subtle); }
@media (width < 1084px) { .save-smart-folder:not(.save-smart-folder--menu-item) { display: none; } }
</style>
