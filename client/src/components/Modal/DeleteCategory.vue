<template>
    <div class="modal" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete category</h5>
            </div>
            <div class="modal-body">
                <p>Do you really want to delete the category <b>{{ $store.data.getSelectedCategory?.name }}</b>, including all of the related feeds, articles, and content?</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-primary" @click="deleteCategory">Delete category</button>
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
import { deleteCategory } from '../../api/categories';
import { setAuthToken } from '../../api/client';
import helper from '../../services/helper.js';
export default {
    name: 'DeleteCategory',
    created: function() {
        setAuthToken(this.$store.auth.token);
    },
    methods: {
        async deleteCategory() {
            try {
                await deleteCategory(this.$store.data.currentSelection.categoryId);
                //remove the category from the store
                this.$store.data.categories = helper.arrayRemove(
                    this.$store.data.categories,
                    helper.findArrayById(this.$store.data.categories, this.$store.data.currentSelection.categoryId)
                );

                //close the modal
                this.$store.data.setShowModal('');
                
                //set the selection back to all
                this.$store.data.setSelectedCategoryId("%");
                this.$store.data.setSelectedFeedId("%");
            } catch (error) {
                console.log("oops something went wrong", error);
                this.$store.data.setShowModal('');
            }
        }
    }
}
</script>