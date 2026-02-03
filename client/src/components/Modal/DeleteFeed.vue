<template>
    <div class="modal" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete feed</h5>
            </div>
            <div class="modal-body">
                <p>Do you really want to delete the feed <b>{{ $store.data.getSelectedFeedDetails?.feed.feedName }}</b>, including all of the related articles and content?</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-primary" @click="deleteFeed">Delete feed</button>
                <button type="button" class="btn btn-secondary" data-dismiss="modal" @click="$store.data.setShowModal('')">Close</button>
            </div>
            </div>
        </div>
    </div>
</template>

<style>
.modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
}

.modal-dialog{
    max-width: 600px;
    width: 100%;
}
</style>

<script>
import { deleteFeed } from '../../api/feeds';
import { setAuthToken } from '../../api/client';
import helper from '../../services/helper.js';
export default {
    name: 'DeleteFeed',
    created: function() {
        setAuthToken(this.$store.auth.token);
    },
    methods: {
        async deleteFeed() {
            console.log("Deleting feed with id: " + this.$store.data.currentSelection.feedId);

            try {
                await deleteFeed(this.$store.data.currentSelection.feedId);
                //find the index of both the category and feed
                const indexCategory = helper.findIndexById(this.$store.data.categories, this.$store.data.currentSelection.categoryId);

                //find the feed using the indexCategory
                this.inputFeed = helper.findArrayById(this.$store.data.categories[indexCategory].feeds, this.$store.data.currentSelection.feedId);

                //remove the feed from the store
                this.$store.data.categories[indexCategory].feeds = helper.arrayRemove(
                    this.$store.data.categories[indexCategory].feeds,
                    this.inputFeed
                );

                //set the feed selection back to all
                this.$store.data.setSelectedFeedId("%");

                //close the modal
                this.$store.data.setShowModal('');
            } catch (error) {
                console.log("oops something went wrong", error);
                this.$store.data.setShowModal('');
            }
        }
    }
}
</script>