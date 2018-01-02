<template>
    <div id="app">
        <div class="row" style="margin-right:0px;">
            <div class="sidebar col-md-2 col-sm-0" style="position:fixed">
                <app-newfeed></app-newfeed>
                <app-quickbar></app-quickbar>
                <app-sidebar></app-sidebar>
            </div>
            <div class="home col-md-10 offset-md-2 col-sm-12">
                <app-quickbar></app-quickbar>
                <app-home></app-home>
            </div>
        </div>

        <!-- Modal -->
        <div v-if="showModal">
            <div class="modal fade" id="myModal" tabindex="-1" role="dialog" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered" role="document">
                    <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="exampleModalLongTitle">Modal title</h5>
                        <button type="button" class="close" data-dismiss="modal" aria-label="Close" @click="showModal=false">
                        <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        ...
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal" @click="showModal=false">Close</button>
                        <button type="button" class="btn btn-primary" @click="showModal=false">Save changes</button>
                    </div>
                    </div>
                </div>
            </div>
        </div>

        <button id="show-modal" @click="showModal = true">Show Modal</button>

    </div>
</template>

<style>
/* Landscape phones and portrait tablets */
@media (max-width: 766px) {
	div.sidebar {
        display:none;
    }
	div.article {
        display: inline-block;
        position: relative;
        border-bottom: 0px solid #FFF !important;
    }
    div.article:after {
        position: absolute;
        content: '';
        border-bottom: 1px solid #a0a3a8;
        width: 90%;
        transform: translateX(-50%);
        left: 50%;
    }
    div.col-md-10 {
        padding-right: 0px;
    }

    div.main {
        margin-top: 50px;
    }

    .view-toolbar {
        position: fixed;
        z-index: 9999;
    }

    div#main {
        padding-top: 42px;
    }
}

/* Desktop */
@media (min-width: 766px) {
	div.home div.quickbar {
        display:none;
    }

    div.quickbar.view-toolbar {
        margin-top: 40px;
    }

    div.drag {
        margin-top: 81px;
    }
}

#myModal.modal {
    display: inline;
    opacity: 1.0;
}
</style>

<script>
    import Sidebar from './components/Sidebar.vue';
    import Home from './components/Home.vue';
    import Quickbar from './components/Quickbar.vue';
    import Newfeed from './components/Newfeed.vue';
    export default {
        components: {
            appSidebar: Sidebar,
            appHome: Home,
            appQuickbar: Quickbar,
            appNewfeed: Newfeed
        },
        data() {
            return {
                showModal: false
            }
        }
    }
</script>
