<template>
    <div class="modal" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Delete category</h5>
            </div>
            <div class="modal-body">
                <p>Are you sure to delete this category?</p>
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
import axios from 'axios';
export default {
    name: 'DeleteCategory',
    created: function() {
        axios.defaults.headers.common['Authorization'] = `Bearer ${this.$store.auth.token}`;
    },
    methods: {
        async deleteCategory() {
            //delete category
            await axios.delete(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/categories/" + this.$store.data.currentSelection.categoryId).then(
                () => {
                    //remove the category from the store
                    this.$store.data.categories = this.arrayRemove(this.$store.data.categories, this.findArrayById(this.$store.data.categories, this.$store.data.currentSelection.categoryId));

                    //close the modal
                    this.$store.data.setShowModal('');
                    
                    //set the selection back to all
                    this.$store.data.currentSelection.categoryId = "%";
                    this.$store.data.currentSelection.feedId = "%";
                },
                response => {
                    /* eslint-disable no-console */
                    console.log("oops something went wrong", response);
                    /* eslint-enable no-console */
                    //this.$store.data.setShowModal('')
                }
            );
        },
        arrayRemove(arr, value) {
            //filter function to remove item from an array
            return arr.filter(function(ele) {
                return ele != value;
            });
        },
        // This function finds the array by searching on its id
        findArrayById: function(array, id) {
            var index = -1
            for(var i = 0; i < array.length; i++) {
                if(array[i].id == id) {
                    index = i;
                    break;
                }
            }
            return array[index];
        }
    }
}
</script>