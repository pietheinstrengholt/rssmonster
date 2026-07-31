<template>
    <BaseDialog
        size="md"
        icon="folder-plus"
        show-close
        close-label="Close category dialog"
        :close-disabled="isPending"
        @close="closeDialog"
    >
        <template #title>Add new category</template>
        <template #description>Create a category to organize related feeds.</template>

        <div class="mb-4">
            <label class="form-label" for="new-category-name">Category name</label>
            <input
                id="new-category-name"
                v-model="categoryName"
                class="form-control"
                type="text"
                placeholder="Enter new category name.."
                :disabled="isPending"
            >
        </div>
        <div>
            <div class="form-label mb-2">Category icon</div>
            <CategoryIconPicker v-model="iconName" :disabled="isPending" />
        </div>

        <template #footer>
            <button type="button" class="base-dialog__button base-dialog__button--secondary btn btn-secondary" :disabled="isPending" @click="closeDialog">
                Close
            </button>
            <button type="button" class="base-dialog__button base-dialog__button--primary btn btn-primary" :disabled="isSaveDisabled" @click="saveCategory">
                Add category
            </button>
        </template>
    </BaseDialog>
</template>

<script>
import { mapStores } from 'pinia';
import { useOverviewStore } from '../../../store/overview.js';
import { useUiStore } from '../../../store/ui.js';
import { useAuthStore } from '../../../store/auth.js';
import BaseDialog from '../BaseDialog.vue';
import CategoryIconPicker from './CategoryIconPicker.vue';
import { DEFAULT_CATEGORY_ICON } from './categoryIconOptions.js';
import { createCategory } from '../../../api/categories';
import { setAuthToken } from '../../../api/client';
import { notifyActionError } from '../../../services/actionNotifications.js';

export default {
    name: 'NewCategory',
    components: {
        BaseDialog,
        CategoryIconPicker
    },
    // This function creates editable category fields and duplicate-save protection.
    data() {
        return {
            categoryName: '',
            iconName: DEFAULT_CATEGORY_ICON,
            category: {},
            isPending: false
        };
    },
    computed: {
      ...mapStores(useOverviewStore, useUiStore, useAuthStore),
        // This function normalizes the category name used for validation and submission.
        trimmedCategoryName() {
            return this.categoryName.trim();
        },
        // This function disables creation for invalid names or an active request.
        isSaveDisabled() {
            return !this.trimmedCategoryName || this.isPending;
        }
    },
    // This function configures the authenticated API client for category creation.
    created: function() {
        setAuthToken(this.authStore.token);
    },
    methods: {
        // This function creates a valid category and reconciles the API response through the store.
        async saveCategory() {
            if (this.isSaveDisabled) return;

            const categoryName = this.trimmedCategoryName;
            this.isPending = true;
            try {
                const result = await createCategory(categoryName, this.iconName);
                this.category = result.data;

                // Reconcile the API response through the store's normalization contract.
                this.overviewStore.addCategory(this.category);
                this.uiStore.setShowModal('');
            } catch (error) {
                console.error(`Error creating category "${categoryName}":`, error);
                notifyActionError('Could not create this category. Please try again.', error);
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
