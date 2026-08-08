<template>
    <BaseDialog
        size="md"
        icon="pencil-square"
        show-close
        close-label="Close category dialog"
        :close-disabled="isPending"
        @close="closeDialog"
    >
        <template #title>Update category</template>
        <template #description>Update the selected category name and icon.</template>

        <div class="category-dialog__name-field">
            <label class="app-form-label" for="category-name">Category name</label>
            <input
                id="category-name"
                v-model="category.name"
                class="app-form-control"
                type="text"
                placeholder="Enter new category name.."
                :disabled="isPending"
            >
        </div>
        <div>
            <div class="app-form-label category-dialog__icon-label">Category icon</div>
            <CategoryIconPicker v-model="category.iconName" :disabled="isPending" />
        </div>

        <template #footer>
            <button type="button" class="app-button app-button--secondary base-dialog__button base-dialog__button--secondary" :disabled="isPending" @click="closeDialog">
                Close
            </button>
            <button type="button" class="app-button app-button--primary base-dialog__button base-dialog__button--primary" :disabled="isSaveDisabled" @click="saveCategory">
                Update category
            </button>
        </template>
    </BaseDialog>
</template>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../../store/selection.js';
import { useOverviewStore } from '../../../store/overview.js';
import { useUiStore } from '../../../store/ui.js';
import BaseDialog from '../BaseDialog.vue';
import CategoryIconPicker from './CategoryIconPicker.vue';
import {
    CATEGORY_ICON_OPTIONS,
    DEFAULT_CATEGORY_ICON
} from './categoryIconOptions.js';
import { updateCategory } from '../../../api/categories';
import helper from '../../../services/helper.js';
import { notifyActionError } from '../../../services/actionNotifications.js';

export default {
    name: 'RenameCategory',
    components: {
        BaseDialog,
        CategoryIconPicker
    },
    // This function creates cloned edit state and duplicate-save protection.
    data() {
        return {
            category: {},
            originalName: '',
            originalIconName: DEFAULT_CATEGORY_ICON,
            index: -1,
            isPending: false
        };
    },
    // This function clones the selected category and normalizes unsupported icons for editing.
    created: function() {
        this.index = helper.findIndexById(this.overviewStore.categories, this.selectionStore.currentSelection.categoryId);
        this.category = JSON.parse(JSON.stringify(this.overviewStore.categories[this.index]));
        this.originalName = this.category.name;
        const hasSupportedIcon = CATEGORY_ICON_OPTIONS.some((icon) => icon.name === this.category.iconName);
        this.category.iconName = hasSupportedIcon
            ? this.category.iconName
            : DEFAULT_CATEGORY_ICON;
        this.originalIconName = this.category.iconName;
    },
    computed: {
      ...mapStores(useSelectionStore, useOverviewStore, useUiStore),
        // This function normalizes the edited category name for validation and submission.
        trimmedCategoryName() {
            return this.category.name?.trim() || '';
        },
        // This function detects whether normalized editable fields still match their originals.
        isCategoryUnchanged() {
            return this.trimmedCategoryName === this.originalName.trim() &&
                this.category.iconName === this.originalIconName;
        },
        // This function disables updates for invalid, unchanged, or currently saving categories.
        isSaveDisabled() {
            return !this.trimmedCategoryName || this.isCategoryUnchanged || this.isPending;
        }
    },
    methods: {
        // This function updates the selected category and reconciles API-backed fields through the store.
        async saveCategory() {
            if (this.isSaveDisabled) return;

            const categoryName = this.trimmedCategoryName;
            this.isPending = true;
            try {
                const result = await updateCategory(
                    this.selectionStore.currentSelection.categoryId,
                    categoryName,
                    this.category.iconName
                );
                // Reconcile the API-backed category fields through the store.
                this.overviewStore.updateCategory(
                    this.selectionStore.currentSelection.categoryId,
                    { ...result.data, iconName: this.category.iconName }
                );

                this.uiStore.setShowModal('');
            } catch (error) {
                console.error(`Error updating category ${this.selectionStore.currentSelection.categoryId}:`, error);
                notifyActionError('Could not save this category. Please try again.', error);
            } finally {
                this.isPending = false;
            }
        },
        // This function closes the category dialog while no save request is active.
        closeDialog() {
            if (this.isPending) return;

            this.uiStore.setShowModal('');
        }
    }
};
</script>

<style scoped>
.category-dialog__name-field {
    margin-bottom: 1.5rem;
}

.category-dialog__icon-label {
    margin-bottom: 0.5rem;
}
</style>
