<template>
    <div class="modal" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Add new category</h5>
            </div>
            <div class="modal-body">
                <input class="form-control" type="text" placeholder="Enter new category name.." v-model="categoryName">
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-primary" @click="saveCategory">Add category</button>
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
    name: 'NewCategory',
    created: function() {
        axios.defaults.headers.common['Authorization'] = `Bearer ${this.$store.auth.token}`;
    },
    data() {
        return {
            categoryName: '',
            category: {}
        }
    },
    methods: {
        saveCategory() {
            // Logic to save the new category
            const categoryName = this.$el.querySelector('input').value;
            console.log('New category name:', categoryName);
            //save category when category name is set
            if (categoryName) {
                axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/categories", { name: categoryName }).then(
                result => {
                    //create new local category in data object
                    this.category = result.data;

                    //add missing count properties, since these are populated dynamically
                    this.category.unreadCount = 0;
                    this.category.readCount = 0;
                    this.category.starCount = 0;
                    this.category.feeds = [];

                    //push the new category to categories in store
                    this.$store.data.categories.push(this.category);

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
            }
        }
    }
}
</script>