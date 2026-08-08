<template>
    <ConfirmDialog
        title="Cleanup"
        confirm-label="Cleanup"
        cancel-label="Close"
        variant="warning"
        :busy="isPending"
        @confirm="cleanup"
        @cancel="closeDialog"
        @close="closeDialog"
    >
        <p>Clicking the cleanup button will remove all articles that are not favorited and are older than one week.</p>
        <p>Are you sure you want to proceed with this cleanup?</p>
    </ConfirmDialog>
</template>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../store/selection.js';
import { useUiStore } from '../../store/ui.js';
import ConfirmDialog from './ConfirmDialog.vue';
import { cleanupOldArticles } from '../../api/cleanup';
import { notifyActionError } from '../../services/actionNotifications.js';

export default {
  computed: {
    ...mapStores(useSelectionStore, useUiStore)
  },
    name: 'Cleanup',
    components: {
        ConfirmDialog
    },
    // This function tracks whether a cleanup request is already in progress.
    data() {
        return {
            isPending: false
        };
    },
    methods: {
        // This function removes old non-favorited articles and refreshes the all-articles view.
        async cleanup() {
            if (this.isPending) return;

            this.isPending = true;
            try {
                await cleanupOldArticles();
                //set the selection back to all and refresh the page
                this.selectionStore.selectCategory("%");
                location.reload();
            } catch (error) {
                console.error('Error cleaning up old articles:', error);
                notifyActionError('Could not clean up old articles. Please try again.', error);
            } finally {
                this.isPending = false;
            }
        },
        // This function closes the cleanup dialog through the existing store contract.
        closeDialog() {
            this.uiStore.setShowModal('');
        }
    }
};
</script>
