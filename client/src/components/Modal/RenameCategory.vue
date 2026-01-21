<template>
    <div class="modal" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Rename category</h5>
            </div>
            <div class="modal-body">
            <div class="alert alert-info mb-3">
                <small>Update your category name below. Changes are saved immediately when you click the Rename button.</small>
            </div>
                <input class="form-control" type="text" placeholder="Enter new category name.." v-model="category.name">
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
import helper from '../../services/helper.js';
export default {
    name: 'DeleteCategory',
    data() {
        return {
            category: {},
            index: -1
        }
    },
    created: function() {
        axios.defaults.headers.common['Authorization'] = `Bearer ${this.$store.auth.token}`;
        //clone the selected feed from the store
        this.index = helper.findIndexById(this.$store.data.categories, this.$store.data.currentSelection.categoryId);
        this.category = this.$store.data.categories[this.index];
    },
    methods: {
        async renameCategory() {
            //rename category
            axios
                .put(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/categories/" + this.$store.data.currentSelection.categoryId, {
                    name: this.category.name
                })
                .then(
                result => {
                    //update the store with the returned name of the category
                    this.$store.data.categories[this.index].name = result.data.name;

                    //close the modal
                    this.$store.data.setShowModal('');
                },
                response => {
                     
                    console.log("oops something went wrong", response);
                     
                    this.$store.data.setShowModal('');
                }
            );
        }
    }
}
</script>