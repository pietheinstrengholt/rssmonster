<template>
  <BaseDialog
    size="xl"
    icon="upload"
    show-close
    :close-label="error && !preview ? 'Close OPML preview' : 'Discard OPML import'"
    :close-disabled="loading || busy"
    @close="discard"
  >
    <template #title>Preview OPML import</template>

    <template #description>
      Review the categories and subscriptions found in this file before importing them.
    </template>

    <div class="opml-preview" :aria-busy="loading || busy ? 'true' : 'false'">
      <div v-if="loading" class="opml-preview__state" role="status">
        <span
          class="app-loading-indicator app-loading-indicator--accent"
          aria-hidden="true"
        ></span>
        <strong>Preparing your OPML preview</strong>
        <span v-if="totalFeeds !== null" class="opml-preview__progress">
          {{ checkedFeeds }} of {{ totalFeeds }} feeds checked.
        </span>
        <span>Checking subscription connections. This can take a moment.</span>
      </div>

      <p
        v-else-if="error"
        class="opml-preview__error"
        :class="{ 'opml-preview__error--standalone': !preview }"
        role="alert"
      >
        {{ error }}
      </p>

      <div v-if="!loading && preview" class="opml-preview__table-wrapper">
        <table class="opml-preview__table">
          <colgroup>
            <col class="opml-preview__select-column">
            <col class="opml-preview__name-column">
            <col class="opml-preview__category-column">
            <col class="opml-preview__url-column">
            <col class="opml-preview__status-column">
          </colgroup>
          <thead>
            <tr>
              <th><span class="app-visually-hidden">Import</span></th>
              <th>Name</th>
              <th>Category</th>
              <th>URL</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(subscription, index) in preview.subscriptions"
              :key="`${index}-${subscription.inputUrl}`"
              :class="{ 'opml-preview__row--skipped': isSkipped(subscription) }"
            >
              <td>
                <input
                  v-if="!isSkipped(subscription)"
                  v-model="selectedSubscriptionIndexes"
                  type="checkbox"
                  :value="index"
                  :aria-label="`Import ${subscription.title || subscription.inputUrl}`"
                >
                <span v-else aria-label="Already subscribed">—</span>
              </td>
              <td class="opml-preview__name-cell">
                <div class="opml-preview__name-heading">
                  <strong>{{ subscription.title || 'Untitled feed' }}</strong>
                  <button
                    v-if="!isSkipped(subscription) && editingDescriptionIndex !== index"
                    type="button"
                    class="opml-preview__edit-description"
                    :disabled="busy"
                    :aria-label="`Edit description for ${subscription.title || subscription.inputUrl}`"
                    title="Edit description"
                    @click="startDescriptionEdit(subscription, index)"
                  >
                    <BootstrapIcon icon="pencil" context="control" decorative />
                  </button>
                </div>
                <div
                  v-if="editingDescriptionIndex === index"
                  class="opml-preview__description-editor"
                >
                  <label
                    class="app-visually-hidden"
                    :for="`opml-description-${index}`"
                  >
                    Description for {{ subscription.title || subscription.inputUrl }}
                  </label>
                  <textarea
                    :id="`opml-description-${index}`"
                    ref="descriptionEditor"
                    v-model="descriptionDraft"
                    rows="3"
                    @keydown.esc.prevent="cancelDescriptionEdit"
                  ></textarea>
                  <div class="opml-preview__description-actions">
                    <button
                      type="button"
                      class="opml-preview__description-save"
                      @click="saveDescriptionEdit(index)"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      class="opml-preview__description-cancel"
                      @click="cancelDescriptionEdit"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
                <p
                  v-else
                  class="opml-preview__description"
                  :class="{ 'opml-preview__description--empty': !descriptionFor(subscription, index) }"
                >
                  {{ descriptionFor(subscription, index) || 'No description' }}
                </p>
              </td>
              <td class="opml-preview__category-cell">
                <div class="opml-preview__category-heading">
                  <span>{{ categoryFor(subscription, index) || 'Uncategorized' }}</span>
                  <button
                    v-if="!isSkipped(subscription) && editingCategoryIndex !== index"
                    type="button"
                    class="opml-preview__edit-category"
                    :disabled="busy"
                    :aria-label="`Edit category for ${subscription.title || subscription.inputUrl}`"
                    title="Edit category"
                    @click="startCategoryEdit(subscription, index)"
                  >
                    <BootstrapIcon icon="pencil" context="control" decorative />
                  </button>
                </div>
                <div
                  v-if="editingCategoryIndex === index"
                  class="opml-preview__category-editor"
                >
                  <label
                    class="app-visually-hidden"
                    :for="`opml-category-${index}`"
                  >
                    Category for {{ subscription.title || subscription.inputUrl }}
                  </label>
                  <select
                    :id="`opml-category-${index}`"
                    ref="categoryEditor"
                    v-model="categoryDraftSelection"
                  >
                    <option value="uncategorized">Uncategorized</option>
                    <option
                      v-for="(category, categoryIndex) in categoryChoices"
                      :key="category.name"
                      :value="`option:${categoryIndex}`"
                    >
                      {{ categoryChoiceLabel(category) }}
                    </option>
                    <option value="new">Create new category…</option>
                  </select>
                  <input
                    v-if="categoryDraftSelection === 'new'"
                    v-model="newCategoryDraft"
                    type="text"
                    maxlength="255"
                    placeholder="New category name"
                    aria-label="New category name"
                    @keydown.enter.prevent="saveCategoryEdit(index)"
                    @keydown.esc.prevent="cancelCategoryEdit"
                  >
                  <div class="opml-preview__category-actions">
                    <button
                      type="button"
                      class="opml-preview__category-save"
                      :disabled="categoryDraftSelection === 'new' && !newCategoryDraft.trim()"
                      @click="saveCategoryEdit(index)"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      class="opml-preview__category-cancel"
                      @click="cancelCategoryEdit"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </td>
              <td class="opml-preview__url">{{ subscription.inputUrl }}</td>
              <td>
                <span
                  class="opml-preview__status"
                  :class="statusClass(subscription)"
                >
                  {{ subscriptionStatus(subscription) }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <template #footer>
      <button
        type="button"
        class="app-button app-button--secondary base-dialog__button base-dialog__button--secondary"
        :disabled="loading || busy"
        autofocus
        @click="discard"
      >
        {{ discardButtonLabel }}
      </button>
      <button
        v-if="preview"
        type="button"
        class="app-button app-button--primary base-dialog__button base-dialog__button--primary"
        :disabled="busy || importCount === 0 || hasOpenEditor"
        :aria-busy="busy ? 'true' : 'false'"
        @click="confirmImport"
      >
        {{ importButtonLabel }}
      </button>
    </template>
  </BaseDialog>
</template>

<script>
import BaseDialog from '../BaseDialog.vue';

export default {
  name: 'OpmlImportPreview',
  components: { BaseDialog },
  props: {
    preview: {
      type: Object,
      default: null
    },
    loading: {
      type: Boolean,
      default: false
    },
    checkedFeeds: {
      type: Number,
      default: 0
    },
    totalFeeds: {
      type: Number,
      default: null
    },
    busy: {
      type: Boolean,
      default: false
    },
    error: {
      type: String,
      default: ''
    }
  },
  emits: ['confirm', 'discard'],
  data() {
    return {
      selectedSubscriptionIndexes: [],
      descriptionOverrides: {},
      editingDescriptionIndex: null,
      descriptionDraft: '',
      categoryOverrides: {},
      editingCategoryIndex: null,
      categoryDraftSelection: 'uncategorized',
      newCategoryDraft: '',
      newCategoryNames: []
    };
  },
  watch: {
    preview: {
      immediate: true,
      handler(preview) {
        this.descriptionOverrides = {};
        this.editingDescriptionIndex = null;
        this.descriptionDraft = '';
        this.categoryOverrides = {};
        this.editingCategoryIndex = null;
        this.categoryDraftSelection = 'uncategorized';
        this.newCategoryDraft = '';
        this.newCategoryNames = [];
        this.selectedSubscriptionIndexes = (preview?.subscriptions || []).reduce(
          (indexes, subscription, index) => this.isSkipped(subscription) ||
            subscription.selectedForImport === false
            ? indexes
            : [...indexes, index],
          []
        );
      }
    }
  },
  computed: {
    importCount() {
      return this.selectedSubscriptionIndexes.length;
    },
    importButtonLabel() {
      if (this.busy) return 'Importing…';
      if (this.importCount === 0) return 'No new subscriptions';
      return `Import ${this.subscriptionLabel(this.importCount)}`;
    },
    discardButtonLabel() {
      return this.error && !this.preview ? 'Close' : 'Discard';
    },
    hasOpenEditor() {
      return this.editingDescriptionIndex !== null ||
        this.editingCategoryIndex !== null;
    },
    categoryChoices() {
      const categories = new Map();
      const addCategory = category => {
        const name = String(category?.name || '').trim();
        const identity = this.categoryIdentity(name);
        if (!name || identity === this.categoryIdentity('Uncategorized')) return;
        const existing = categories.get(identity);
        categories.set(identity, {
          name: existing?.name || name,
          alreadyExists: existing?.alreadyExists === true ||
            category.alreadyExists === true,
          fromOpml: existing?.fromOpml === true || category.fromOpml === true
        });
      };
      for (const category of this.preview?.categoryOptions || []) {
        addCategory(category);
      }
      for (const category of this.preview?.categories || []) {
        addCategory({ ...category, fromOpml: true });
      }
      for (const name of this.newCategoryNames) {
        addCategory({ name, alreadyExists: false, fromOpml: false });
      }
      return [...categories.values()];
    }
  },
  methods: {
    isSkipped(subscription) {
      return subscription.alreadySubscribed || subscription.duplicateInFile;
    },
    subscriptionStatus(subscription) {
      if (subscription.duplicateInFile) return 'Duplicate in file';
      if (subscription.alreadySubscribed) return 'Already subscribed';
      const statuses = {
        available: 'Available',
        temporarily_unavailable: 'Temporarily unavailable',
        access_denied: 'Access denied',
        rate_limited: 'Rate limited',
        not_checked: 'Not checked'
      };
      return statuses[subscription.connectionStatus] || 'Not checked';
    },
    statusClass(subscription) {
      if (this.isSkipped(subscription)) return 'opml-preview__status--skipped';
      if (subscription.connectionStatus === 'available') {
        return 'opml-preview__status--available';
      }
      if (subscription.connectionStatus === 'not_checked') {
        return 'opml-preview__status--skipped';
      }
      return 'opml-preview__status--warning';
    },
    descriptionFor(subscription, index) {
      return Object.hasOwn(this.descriptionOverrides, index)
        ? this.descriptionOverrides[index]
        : subscription.description || '';
    },
    startDescriptionEdit(subscription, index) {
      if (this.busy || this.isSkipped(subscription)) return;
      this.cancelCategoryEdit();
      this.editingDescriptionIndex = index;
      this.descriptionDraft = this.descriptionFor(subscription, index);
      this.$nextTick(() => {
        const editor = Array.isArray(this.$refs.descriptionEditor)
          ? this.$refs.descriptionEditor[0]
          : this.$refs.descriptionEditor;
        editor?.focus();
      });
    },
    saveDescriptionEdit(index) {
      if (this.editingDescriptionIndex !== index) return;
      this.descriptionOverrides = {
        ...this.descriptionOverrides,
        [index]: this.descriptionDraft.trim()
      };
      this.cancelDescriptionEdit();
    },
    cancelDescriptionEdit() {
      this.editingDescriptionIndex = null;
      this.descriptionDraft = '';
    },
    categoryFor(subscription, index) {
      return Object.hasOwn(this.categoryOverrides, index)
        ? this.categoryOverrides[index]
        : subscription.categoryName || '';
    },
    categoryIdentity(name) {
      return String(name || '').trim().toLowerCase();
    },
    categoryChoiceLabel(category) {
      if (category.alreadyExists && category.fromOpml) {
        return `${category.name} — existing, in OPML`;
      }
      if (category.alreadyExists) return `${category.name} — existing`;
      if (category.fromOpml) return `${category.name} — from OPML`;
      return `${category.name} — new`;
    },
    startCategoryEdit(subscription, index) {
      if (this.busy || this.isSkipped(subscription)) return;
      this.cancelDescriptionEdit();
      const assignedCategory = this.categoryFor(subscription, index);
      const currentCategory = this.categoryIdentity(assignedCategory) ===
        this.categoryIdentity('Uncategorized')
        ? ''
        : assignedCategory;
      const optionIndex = this.categoryChoices.findIndex(
        category => this.categoryIdentity(category.name) ===
          this.categoryIdentity(currentCategory)
      );
      this.editingCategoryIndex = index;
      if (!currentCategory) this.categoryDraftSelection = 'uncategorized';
      else if (optionIndex >= 0) {
        this.categoryDraftSelection = `option:${optionIndex}`;
      } else this.categoryDraftSelection = 'new';
      this.newCategoryDraft = optionIndex >= 0 ? '' : currentCategory;
      this.$nextTick(() => {
        const editor = Array.isArray(this.$refs.categoryEditor)
          ? this.$refs.categoryEditor[0]
          : this.$refs.categoryEditor;
        editor?.focus();
      });
    },
    saveCategoryEdit(index) {
      if (this.editingCategoryIndex !== index) return;
      let categoryName = '';
      if (this.categoryDraftSelection === 'new') {
        categoryName = this.newCategoryDraft.trim();
        if (!categoryName) return;
        const matchingCategory = this.categoryChoices.find(category =>
          this.categoryIdentity(category.name) === this.categoryIdentity(categoryName)
        );
        if (matchingCategory) categoryName = matchingCategory.name;
        else {
          this.newCategoryNames = [...this.newCategoryNames, categoryName];
        }
      } else if (this.categoryDraftSelection.startsWith('option:')) {
        const optionIndex = Number(this.categoryDraftSelection.slice(7));
        categoryName = this.categoryChoices[optionIndex]?.name || '';
      }
      this.categoryOverrides = {
        ...this.categoryOverrides,
        [index]: categoryName
      };
      this.cancelCategoryEdit();
    },
    cancelCategoryEdit() {
      this.editingCategoryIndex = null;
      this.categoryDraftSelection = 'uncategorized';
      this.newCategoryDraft = '';
    },
    discard() {
      if (!this.loading && !this.busy) this.$emit('discard');
    },
    subscriptionLabel(count) {
      return `${count} subscription${Number(count) === 1 ? '' : 's'}`;
    },
    confirmImport() {
      if (
        this.busy ||
        this.importCount === 0 ||
        this.hasOpenEditor
      ) return;

      const selectedIndexes = new Set(this.selectedSubscriptionIndexes);
      const subscriptions = this.preview.subscriptions.map(
        (subscription, index) => ({
          ...subscription,
          selectedForImport: selectedIndexes.has(index) &&
            !this.isSkipped(subscription),
          ...(Object.hasOwn(this.descriptionOverrides, index)
            ? { description: this.descriptionOverrides[index] }
            : {}),
          ...(Object.hasOwn(this.categoryOverrides, index)
            ? { categoryName: this.categoryOverrides[index] }
            : {})
        })
      );
      const categoryCounts = new Map();
      for (const subscription of subscriptions) {
        if (!subscription.selectedForImport) continue;
        if (!subscription.categoryName) continue;
        const identity = this.categoryIdentity(subscription.categoryName);
        const existing = categoryCounts.get(identity);
        const category = this.categoryChoices.find(choice =>
          this.categoryIdentity(choice.name) === identity
        );
        categoryCounts.set(identity, {
          name: category?.name || existing?.name || subscription.categoryName,
          subscriptionCount: (existing?.subscriptionCount || 0) + 1
        });
      }

      this.$emit('confirm', {
        ...this.preview,
        subscriptionCount: this.importCount,
        categories: [...categoryCounts.values()],
        categoryOptions: this.categoryChoices,
        subscriptions
      });
    }
  }
};
</script>

<style scoped>
.opml-preview {
  display: grid;
  gap: 1rem;
}

.opml-preview__table-wrapper {
  overflow-x: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-compact);
}

.opml-preview__state {
  display: flex;
  min-height: 16rem;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 0.75rem;
  color: var(--text-secondary);
  text-align: center;
}

.opml-preview__state strong {
  color: var(--text-primary);
  font-size: 1rem;
}

.opml-preview__progress {
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.opml-preview__table {
  width: 100%;
  min-width: 46rem;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.opml-preview__select-column {
  width: 3rem;
}

.opml-preview__name-column {
  width: 30%;
}

.opml-preview__category-column {
  width: 18%;
}

.opml-preview__status-column {
  width: 11rem;
}

.opml-preview__table th,
.opml-preview__table td {
  padding: 0.625rem;
  text-align: left;
  border-bottom: 1px solid var(--border-subtle);
}

.opml-preview__table input[type='checkbox'] {
  width: 1rem;
  height: 1rem;
  accent-color: var(--color-primary);
  cursor: pointer;
}

.opml-preview__table tbody tr:last-child td {
  border-bottom: 0;
}

.opml-preview__name-cell {
  overflow-wrap: anywhere;
}

.opml-preview__name-heading {
  display: flex;
  align-items: baseline;
  gap: 0.375rem;
}

.opml-preview__name-heading strong {
  color: var(--text-primary);
}

.opml-preview__edit-description,
.opml-preview__edit-category,
.opml-preview__description-save,
.opml-preview__description-cancel,
.opml-preview__category-save,
.opml-preview__category-cancel {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.opml-preview__edit-description {
  display: inline-flex;
  width: 1.75rem;
  height: 1.75rem;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: var(--radius-control);
  font-size: 0.875rem;
}

.opml-preview__edit-category {
  display: inline-flex;
  width: 1.75rem;
  height: 1.75rem;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: var(--radius-control);
  font-size: 0.875rem;
}

.opml-preview__description-save:hover,
.opml-preview__description-cancel:hover,
.opml-preview__category-save:hover,
.opml-preview__category-cancel:hover {
  text-decoration: underline;
}

.opml-preview__edit-description:hover,
.opml-preview__edit-category:hover {
  background: var(--surface-control);
}

.opml-preview__edit-description:focus-visible,
.opml-preview__edit-category:focus-visible,
.opml-preview__description-save:focus-visible,
.opml-preview__description-cancel:focus-visible,
.opml-preview__category-save:focus-visible,
.opml-preview__category-cancel:focus-visible,
.opml-preview__description-editor textarea:focus-visible,
.opml-preview__category-editor select:focus-visible,
.opml-preview__category-editor input:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.opml-preview__edit-description:disabled,
.opml-preview__edit-category:disabled,
.opml-preview__category-save:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.opml-preview__description {
  max-width: 28rem;
  margin: 0.25rem 0 0;
  overflow: hidden;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.35;
}

.opml-preview__description--empty {
  color: var(--text-muted);
  font-style: italic;
}

.opml-preview__description-editor {
  display: grid;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.opml-preview__description-editor textarea {
  width: 100%;
  min-height: 4.5rem;
  resize: vertical;
  padding: 0.5rem;
  border: 1px solid var(--border-control);
  border-radius: var(--radius-control);
  background: var(--surface-control);
  color: var(--text-primary);
  font: inherit;
  line-height: 1.4;
}

.opml-preview__description-actions {
  display: flex;
  gap: 0.75rem;
}

.opml-preview__description-cancel {
  color: var(--text-secondary);
}

.opml-preview__category-cell {
  overflow-wrap: anywhere;
}

.opml-preview__category-heading {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.opml-preview__category-editor {
  display: grid;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.opml-preview__category-editor select,
.opml-preview__category-editor input {
  width: 100%;
  min-height: 2.25rem;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--border-control);
  border-radius: var(--radius-control);
  background: var(--surface-control);
  color: var(--text-primary);
  font: inherit;
}

.opml-preview__category-actions {
  display: flex;
  gap: 0.75rem;
}

.opml-preview__category-cancel {
  color: var(--text-secondary);
}

.opml-preview__url {
  overflow-wrap: anywhere;
  color: var(--text-secondary);
}

.opml-preview__row--skipped {
  opacity: 0.65;
}

.opml-preview__status {
  display: inline-flex;
  white-space: nowrap;
  font-weight: 600;
}

.opml-preview__status--available {
  color: var(--settings-success-text);
}

.opml-preview__status--warning {
  color: var(--color-warning);
}

.opml-preview__status--skipped {
  color: var(--text-secondary);
}

.opml-preview__error {
  margin: 0;
  color: var(--color-danger);
}

.opml-preview__error--standalone {
  display: flex;
  min-height: 16rem;
  align-items: center;
  justify-content: center;
  text-align: center;
}

</style>
