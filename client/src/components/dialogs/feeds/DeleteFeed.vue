<template>
    <ConfirmDialog
        title="Delete feed"
        confirm-label="Delete feed"
        cancel-label="Close"
        :busy="isPending"
        @confirm="deleteFeed"
        @cancel="closeDialog"
        @close="closeDialog"
    >
        <p>Do you really want to delete the feed <b>{{ overviewStore.selectedFeedDetails?.feed.feedName }}</b>, including all of the related articles and content?</p>
    </ConfirmDialog>
</template>

<script>
import { mapStores } from 'pinia';
import { useSelectionStore } from '../../../store/selection.js';
import { useOverviewStore } from '../../../store/overview.js';
import { useUiStore } from '../../../store/ui.js';
import ConfirmDialog from '../ConfirmDialog.vue';
import { deleteFeed } from '../../../api/feeds';
import { notifyActionError } from '../../../services/actionNotifications.js';

export default {
  computed: {
    ...mapStores(useSelectionStore, useOverviewStore, useUiStore)
  },
    name: 'DeleteFeed',
    components: {
        ConfirmDialog
    },
    // This function tracks whether the selected feed is already being deleted.
    data() {
        return {
            isPending: false
        };
    },
    methods: {
        // This function deletes the selected feed and restores the all-feeds selection.
        async deleteFeed() {
            if (this.isPending) return;

            this.isPending = true;
            try {
                await deleteFeed(this.selectionStore.currentSelection.feedId);
                this.overviewStore.removeFeed(this.selectionStore.currentSelection.feedId);

                //set the feed selection back to all
                this.selectionStore.selectFeed("%");

                //close the modal
                this.uiStore.setShowModal('');
            } catch (error) {
                console.error(`Error deleting feed ${this.selectionStore.currentSelection.feedId}:`, error);
                notifyActionError('Could not delete this feed. Please try again.', error);
            } finally {
                this.isPending = false;
            }
        },
        // This function closes the feed deletion dialog through the existing store contract.
        closeDialog() {
            this.uiStore.setShowModal('');
        }
    }
};
</script>
