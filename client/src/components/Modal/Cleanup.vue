<template>
    <div class="modal" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Cleanup</h5>
            </div>
            <div class="modal-body">
                <p>Clicking the cleanup button will remove all articles that are not starred and are older than one week.</p>
                <p>Are you sure you want to proceed with this cleanup?</p>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-primary" @click="cleanup">Cleanup</button>
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
    name: 'Cleanup',
    created: function() {
        axios.defaults.headers.common['Authorization'] = `Bearer ${this.$store.auth.token}`;
    },
    methods: {
        cleanup() {
            axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/cleanup").then(
                () => {
                    //set the selection back to all and refresh the page
                    this.$store.data.setSelectedCategoryId("%");
                    this.$store.data.setSelectedFeedId("%");
                    location.reload();
                },
                response => {
                     
                    console.log("oops something went wrong", response);
                     
                    this.$store.data.setShowModal('')
                }
            );
        }
    }
}
</script>