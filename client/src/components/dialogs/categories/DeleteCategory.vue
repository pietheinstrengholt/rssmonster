<template>
    <ConfirmDialog
        title="Delete category"
        confirm-label="Delete category"
        cancel-label="Close"
        :busy="isPending"
        @confirm="deleteCategory"
        @cancel="closeDialog"
        @close="closeDialog"
    >
        <p>Do you really want to delete the category <b>{{ overviewStore.selectedCategory?.name }}</b>, including all of the related feeds, articles, and content?</p>
    </ConfirmDialog>
</template>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../../store/selection.js';
import { useOverviewStore } from '../../../store/overview.js';
import { useUiStore } from '../../../store/ui.js';
import ConfirmDialog from '../ConfirmDialog.vue';
import { deleteCategory } from '../../../api/categories';
import { notifyActionError } from '../../../services/actionNotifications.js';

export default {
  computed: {
    ...mapStores(useSelectionStore, useOverviewStore, useUiStore)
  },
    name: 'DeleteCategory',
    components: {
        ConfirmDialog
    },
    // This function tracks whether the selected category is already being deleted.
    data() {
        return {
            isPending: false
        };
    },
    methods: {
        // This function deletes the selected category and restores the all-categories selection.
        async deleteCategory() {
            if (this.isPending) return;

            this.isPending = true;
            try {
                await deleteCategory(this.selectionStore.currentSelection.categoryId);
                this.overviewStore.removeCategory(this.selectionStore.currentSelection.categoryId);

                //close the modal
                this.uiStore.setShowModal('');
                
                //set the selection back to all
                this.selectionStore.selectCategory("%");
            } catch (error) {
                console.error(`Error deleting category ${this.selectionStore.currentSelection.categoryId}:`, error);
                notifyActionError('Could not delete this category. Please try again.', error);
            } finally {
                this.isPending = false;
            }
        },
        // This function closes the category deletion dialog through the existing store contract.
        closeDialog() {
            this.uiStore.setShowModal('');
        }
    }
};
</script>
