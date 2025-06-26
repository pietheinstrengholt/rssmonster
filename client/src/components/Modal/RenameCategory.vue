<template>
    <div class="modal" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Rename category</h5>
            </div>
            <div class="modal-body">
                <input class="form-control" type="text" placeholder="Enter new category name.." v-model="categoryName">
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-primary" @click="renameCategory">Rename category</button>
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
    data() {
        return {
            categoryName: ''
        }
    },
    created: function() {
        axios.defaults.headers.common['Authorization'] = `Bearer ${this.$store.auth.token}`;
    },
    methods: {
        async renameCategory() {
            //rename category
            axios
                .put(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/categories/" + this.$store.data.currentSelection.categoryId, {
                name: this.categoryName
                })
                .then(
                result => {
                    //find the index of the category
                    var index = this.findIndexById(this.$store.data.categories, this.$store.data.currentSelection.categoryId);

                    //update the store with the returned name of the category
                    this.$store.data.categories[index].name = result.data.name;

                    //close the modal
                    this.$store.data.setShowModal('')
                },
                response => {
                    /* eslint-disable no-console */
                    console.log("oops something went wrong", response);
                    /* eslint-enable no-console */
                    this.$store.data.setShowModal('')
                }
            );
        },
        // This function finds the index of an object in an array by its id
        findIndexById: function(array, id) {
            var index = -1
            for(var i = 0; i < array.length; i++) {
                if(array[i].id == id) {
                    index = i;
                    break;
                }
            }
            return index;
        }
    }
}
</script>