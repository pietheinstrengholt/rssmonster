<template>
  <Teleport to="body">
    <BaseDialog class="article-tags-dialog" icon="tag" show-close :close-disabled="saving" @close="close">
      <template #title>{{ isManageMode ? 'Manage tags' : 'Add tags' }}</template>
      <template #description>{{ isManageMode ? 'View, add or remove tags for this article.' : 'Add tags to this article. Create new tags or select from existing tags.' }}</template>

      <section class="article-tags-dialog__section">
        <h3 class="app-form-label">{{ isManageMode ? 'Current tags' : 'Selected tags' }}</h3>
        <div v-if="selectedNames.length" class="article-tags-dialog__chips">
          <button v-for="name in selectedNames" :key="name" type="button" class="app-button app-button--secondary app-button--compact" :aria-label="!isManageMode && originalNames.includes(name) ? `Tag ${formatTagName(name)} already assigned` : `Remove tag ${formatTagName(name)}`" :disabled="currentLoading || saving || !!currentError || (!isManageMode && originalNames.includes(name))" @click="toggleTag(name)">
            {{ formatTagName(name) }} <BootstrapIcon v-if="isManageMode || !originalNames.includes(name)" icon="x" aria-hidden="true" />
          </button>
        </div>
        <p v-else class="app-form-help">No tags selected.</p>
      </section>

      <section class="article-tags-dialog__section" :aria-busy="searchLoading || suggestionsLoading">
        <h3 v-if="isManageMode" class="app-form-label">Add more tags</h3>
        <input ref="searchInput" v-model="searchQuery" class="app-form-control" type="search" placeholder="Search tags..." aria-label="Search tags" autofocus :disabled="saving" />
        <p v-if="currentLoading" class="app-form-help" role="status">Loading current tags…</p>
        <div v-if="currentError" role="alert">
          <p>{{ currentError }}</p>
          <button type="button" class="app-button app-button--secondary" @click="loadCurrent">Retry current tags</button>
        </div>
        <p v-if="searchLoading" class="app-form-help" role="status">Searching…</p>
        <p v-else-if="!normalizedQuery && suggestionsLoading" class="app-form-help" role="status">Loading suggestions…</p>
        <div v-if="searchError || (!normalizedQuery && suggestionsError)" role="alert">
          <p>{{ searchError || suggestionsError }}</p>
          <button type="button" class="app-button app-button--secondary" @click="normalizedQuery ? retrySearch() : loadSuggestions()">Retry</button>
        </div>
        <div v-for="section in resultSections" :key="section.title" class="article-tags-dialog__section">
          <h3 class="app-form-label">{{ section.title }}</h3>
          <label v-for="name in section.names" :key="name" class="article-tags-dialog__tag-row">
            <input class="app-form-check-input" type="checkbox" :checked="selectedNames.includes(name)" :disabled="currentLoading || saving || !!currentError || (!isManageMode && originalNames.includes(name))" @change="toggleTag(name, $event.target)" />
            <span>{{ formatTagName(name) }}</span>
          </label>
        </div>
        <p v-if="normalizedQuery && !searchLoading && !searchError && !sortedNames.length" class="app-form-help">No matching tags found.</p>
        <p v-else-if="!normalizedQuery && !suggestionsLoading && !suggestionsError && !resultSections.length" class="app-form-help">No more suggestions. Search for a tag or create one below.</p>
        <button v-if="canCreateSearch" type="button" class="app-button app-button--outline-secondary" :disabled="currentLoading || saving || !!currentError" @click="createSearchTag">
          <BootstrapIcon icon="plus-lg" aria-hidden="true" /> Create "{{ normalizedQuery }}"
        </button>
      </section>

      <form v-if="creating" class="article-tags-dialog__section" @submit.prevent="createTag">
        <label class="app-form-label" :for="newTagInputId">New tag</label>
        <input :id="newTagInputId" ref="newTagInput" v-model="newName" class="app-form-control" type="text" maxlength="255" autocomplete="off" :disabled="saving" />
        <p class="app-form-help">New tags are saved with your changes.</p>
        <p v-if="createError" role="alert">{{ createError }}</p>
        <div class="article-tags-dialog__actions">
          <button type="button" class="app-button app-button--secondary" :disabled="saving" @click="creating = false">Cancel</button>
          <button type="submit" class="app-button app-button--primary" :disabled="saving || !normalizeTagName(newName)">Create</button>
        </div>
      </form>
      <p v-if="saveError" role="alert">{{ saveError }}</p>
      <template #footer>
        <div class="article-tags-dialog__footer">
          <button type="button" class="app-button app-button--outline-secondary" :disabled="currentLoading || saving || !!currentError || creating" @click="startCreate">
            <BootstrapIcon icon="plus-lg" aria-hidden="true" /> Create new tag
          </button>
          <div class="article-tags-dialog__actions">
            <button type="button" class="app-button app-button--secondary" :disabled="saving" @click="close">Cancel</button>
            <button type="button" class="app-button app-button--primary" :disabled="currentLoading || saving || !!currentError || !hasChanges" :aria-busy="saving" @click="save">{{ saving ? 'Saving…' : isManageMode ? 'Save changes' : 'Add tags' }}</button>
          </div>
        </div>
      </template>
    </BaseDialog>
  </Teleport>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import BaseDialog from '../dialogs/BaseDialog.vue';
import { useOverviewStore } from '../../store/overview.js';
import { addArticleTags, fetchArticleTags, fetchAvailableTags, removeArticleTag } from '../../api/tags.js';
import { formatTagName, normalizeTagName } from '../../utils/tags.js';
import { notifyActionError, notifyActionSuccess } from '../../services/actionNotifications.js';

const props = defineProps({ articleId: { type: [Number, String], required: true }, tags: { type: Array, default: () => [] }, mode: { type: String, default: 'add' } });
const emit = defineEmits(['close', 'updated']);
const overview = useOverviewStore();
const persistedTags = ref([...props.tags]);
const defaultNames = ref([]);
const searchNames = ref([]);
const selectedNames = ref(props.tags.map(tag => normalizeTagName(tag.name)));
const searchQuery = ref('');
const searchInput = ref(null);
const newTagInput = ref(null);
const newTagInputId = useId();
const newName = ref('');
const creating = ref(false);
const createError = ref('');
const currentError = ref('');
const suggestionsError = ref('');
const searchError = ref('');
const saveError = ref('');
const currentLoading = ref(true);
const suggestionsLoading = ref(true);
const searchLoading = ref(false);
const saving = ref(false);
const controller = new AbortController();
const isManageMode = computed(() => props.mode === 'manage');
const originalNames = computed(() => persistedTags.value.map(tag => normalizeTagName(tag.name)));
const normalizedQuery = computed(() => normalizeTagName(searchQuery.value));
const sortedNames = computed(() => {
  const selected = new Set(selectedNames.value);
  const selectedMatches = selectedNames.value.filter(name => name.includes(normalizedQuery.value));
  return [...new Set([...selectedMatches, ...searchNames.value])].sort((left, right) =>
    Number(selected.has(right)) - Number(selected.has(left)) || left.localeCompare(right)
  );
});
// Reuse the existing status/grouping-scoped sidebar snapshot without another usage query.
const popularNames = computed(() => [...new Set(overview.topTags.slice(0, 10).map(tag => normalizeTagName(tag.name)))].filter(name => !selectedNames.value.includes(name)));
const resultSections = computed(() => normalizedQuery.value
  ? (sortedNames.value.length ? [{ title: 'Matches', names: sortedNames.value }] : [])
  : [
    { title: 'Most used in this view', names: popularNames.value },
    { title: 'More tags', names: defaultNames.value.filter(name => !selectedNames.value.includes(name) && !popularNames.value.includes(name)) }
  ].filter(section => section.names.length));
const canCreateSearch = computed(() => normalizedQuery.value && normalizedQuery.value.length <= 255 && !searchLoading.value && !searchError.value && ![...originalNames.value, ...selectedNames.value, ...searchNames.value].includes(normalizedQuery.value));
let searchTimer = null;
let searchController = null;
let searchRequestId = 0;
const additions = computed(() => selectedNames.value.filter(name => !originalNames.value.includes(name)));
const removals = computed(() => isManageMode.value ? persistedTags.value.filter(tag => !selectedNames.value.includes(normalizeTagName(tag.name))) : []);
const hasChanges = computed(() => additions.value.length > 0 || removals.value.length > 0);

onMounted(() => { void loadCurrent(); void loadSuggestions(); });
watch(normalizedQuery, scheduleSearch);
onBeforeUnmount(() => {
  controller.abort();
  clearTimeout(searchTimer);
  searchController?.abort();
  ++searchRequestId;
});
function close() { if (!saving.value) emit('close'); }
function selectTag(name) { if (!selectedNames.value.includes(name)) selectedNames.value.push(name); }
function toggleTag(name, input = null) {
  if (saving.value || currentLoading.value || currentError.value) return;
  if (!isManageMode.value && originalNames.value.includes(name)) return;
  const restoreFocus = input === document.activeElement;
  selectedNames.value = selectedNames.value.includes(name) ? selectedNames.value.filter(value => value !== name) : [...selectedNames.value, name];
  // Moving a focused checkbox row can blur it; retain native keyboard interaction.
  if (restoreFocus) nextTick(() => input.isConnected ? input.focus() : searchInput.value?.focus());
}
async function loadCurrent() {
  currentLoading.value = true;
  currentError.value = '';
  try {
    const { data } = await fetchArticleTags(props.articleId, { signal: controller.signal, suppressGlobalError: true });
    if (controller.signal.aborted) return;
    persistedTags.value = data.article.tags || [];
    selectedNames.value = [...originalNames.value];
  } catch (error) {
    if (controller.signal.aborted) return;
    currentError.value = 'Could not load current tags. Please try again.';
    notifyActionError(currentError.value, error);
  } finally { currentLoading.value = false; }
}
async function loadSuggestions() {
  suggestionsLoading.value = true;
  suggestionsError.value = '';
  try {
    const { data } = await fetchAvailableTags({ limit: 10 }, { signal: controller.signal, suppressGlobalError: true });
    if (controller.signal.aborted) return;
    defaultNames.value = data.tags.slice(0, 10).map(tag => normalizeTagName(tag.name));
  } catch (error) {
    if (controller.signal.aborted) return;
    suggestionsError.value = 'Could not load suggestions. Please try again.';
    notifyActionError(suggestionsError.value, error);
  } finally { suggestionsLoading.value = false; }
}
function scheduleSearch() {
  clearTimeout(searchTimer);
  searchController?.abort();
  const requestId = ++searchRequestId;
  searchNames.value = [];
  searchError.value = '';
  searchLoading.value = Boolean(normalizedQuery.value);
  if (normalizedQuery.value) searchTimer = setTimeout(() => void runSearch(normalizedQuery.value, requestId), 250);
}
function retrySearch() { scheduleSearch(); }
async function runSearch(query, requestId) {
  searchController = new AbortController();
  try {
    const { data } = await fetchAvailableTags({ search: query, limit: 20 }, { signal: searchController.signal, suppressGlobalError: true });
    if (controller.signal.aborted || requestId !== searchRequestId) return;
    searchNames.value = data.tags.slice(0, 20).map(tag => normalizeTagName(tag.name));
  } catch (error) {
    if (controller.signal.aborted || requestId !== searchRequestId) return;
    searchError.value = 'Could not search tags. Please try again.';
    notifyActionError(searchError.value, error);
  } finally {
    if (requestId === searchRequestId) searchLoading.value = false;
  }
}
function createSearchTag() { newName.value = normalizedQuery.value; void createTag(); }
async function startCreate() {
  creating.value = true;
  newName.value = searchQuery.value;
  createError.value = '';
  await nextTick();
  newTagInput.value?.focus();
}
async function createTag() {
  const name = normalizeTagName(newName.value);
  if (!name || name.length > 255) { createError.value = 'Enter a tag name of up to 255 characters.'; return; }
  selectTag(name);
  searchQuery.value = '';
  creating.value = false;
  await nextTick();
  searchInput.value?.focus();
}
function applyTags(tags) {
  persistedTags.value = tags;
}
async function save() {
  if (saving.value || currentLoading.value || currentError.value || !hasChanges.value) return;
  saving.value = true;
  saveError.value = '';
  const namesToAdd = [...additions.value];
  const tagsToRemove = [...removals.value];
  try {
    // The API accepts at most 100 names and removes assignments individually.
    // Reconcile after every response so retrying a partial save only sends remaining changes.
    for (let offset = 0; offset < namesToAdd.length; offset += 100) {
      const { data } = await addArticleTags(props.articleId, namesToAdd.slice(offset, offset + 100));
      applyTags(data.tags);
    }
    for (const tag of tagsToRemove) {
      const { data } = await removeArticleTag(props.articleId, tag.id);
      applyTags(data.tags);
    }
    // Publish once per save so sidebar counts do not refetch after every deletion.
    emit('updated', persistedTags.value);
    notifyActionSuccess(isManageMode.value ? 'Article tags updated.' : 'Tags added.');
    emit('close');
  } catch (error) {
    // A lost response can follow a committed write; read the current state before retrying.
    try {
      const { data } = await fetchArticleTags(props.articleId, { suppressGlobalError: true, signal: controller.signal });
      applyTags(data.article.tags || []);
      if (!hasChanges.value) {
        emit('updated', persistedTags.value);
        notifyActionSuccess(isManageMode.value ? 'Article tags updated.' : 'Tags added.');
        emit('close');
        return;
      }
    } catch { /* Keep the last confirmed state when the article cannot be reached. */ }
    emit('updated', persistedTags.value);
    saveError.value = 'Could not save all tag changes. Your selections are still here; retry to finish.';
    notifyActionError(saveError.value, error);
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.article-tags-dialog { font-family: var(--font-family); font-size: var(--font-size-ui-default); font-weight: 400; line-height: 1.4; }
.article-tags-dialog__section + .article-tags-dialog__section,
.article-tags-dialog__section .article-tags-dialog__section { margin-top: 1rem; }
.article-tags-dialog__section h3 { margin: 0 0 0.5rem; }
.article-tags-dialog__chips, .article-tags-dialog__actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.article-tags-dialog__chips button { font-weight: 500; max-width: 100%; white-space: normal; overflow-wrap: anywhere; }
.article-tags-dialog__tag-row { display: flex; align-items: center; gap: 0.65rem; min-height: var(--control-height-default); padding: 0.25rem 0.45rem; border-radius: var(--radius-compact); cursor: pointer; overflow-wrap: anywhere; font-weight: 400; }
.article-tags-dialog__tag-row:hover { background: var(--surface-hover); }
.article-tags-dialog__footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; width: 100%; }
.article-tags-dialog__actions { justify-content: flex-end; }
form .article-tags-dialog__actions { margin-top: 0.75rem; }
@media (max-width: 575.98px) {
  .article-tags-dialog__footer { align-items: stretch; flex-direction: column; }
  .article-tags-dialog__tag-row { min-height: var(--control-height-touch); }
}
</style>
