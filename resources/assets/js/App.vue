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
        <div v-if="$store.modal">
            <div class="modal fade" id="myModal" tabindex="-1" role="dialog" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered" role="document">
                    <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="exampleModalLongTitle">Add new feed</h5>
                        <button type="button" class="close" data-dismiss="modal" aria-label="Close" @click="closeModal">
                        <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <input class="form-control form-control-lg" type="text" placeholder="Enter feed or website url..." v-model="url">
                        <br>
                        <button type="submit" class="btn btn-primary mb-2" @click="checkWebsite">Validate feed</button>
                        <br>
                        <span v-if="ajaxRequest">Please Wait ...</span>
                        <br>
                        <span class="error" v-if="error_msg">{{ error_msg }}</span>
                        <div v-if="feed_id">
                            <div class="form-group row">
                                <label for="inputFeedName" class="col-sm-3 col-form-label">Feed name</label>
                                <div class="col-sm-9">
                                    <input type="text" class="form-control" id="inputPassword" v-model="feed_name" placeholder="Feed name">
                                </div>
                            </div>
                            <div class="form-group row">
                                <label for="inputFeedDescription" class="col-sm-3 col-form-label">Feed description</label>
                                <div class="col-sm-9">
                                    <input type="text" class="form-control" id="inputPassword" v-model="feed_desc" placeholder="Feed description">
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal" @click="closeModal">Cancel</button>
                        <button v-if="feed_id" type="button" class="btn btn-primary" @click="saveFeed">Save changes</button>
                    </div>
                    </div>
                </div>
            </div>
        </div>
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

div.modal-dialog {
    max-width: 800px;
}

span.error {
    color: red;
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
        store: {
            modal: 'modal',
            refreshCategories: 'refreshCategories'
        },
        data() {
		    return {
                debug: true,
                domain: '',
                ajaxRequest: false,
                postResults: [],
                feed_name: '',
                feed_desc: '',
                feed_id: '',
                error_msg: ''
            }
        },
        methods: {
            checkWebsite: function() {
                this.ajaxRequest = true;

                this.$http.post('http://localhost/rssmonster/public/api/feeds/newrssfeed?url=' + this.url).then(response => {
                    this.error_msg = '';
                    this.feed_id = response.body.id;
                    this.feed_name = response.body.feed_name;
                    this.feed_desc = response.body.feed_desc;
                }, function (data, status, request) {
                    this.error_msg = data.body.message;
                    this.feed_id = '';
                    this.feed_name = '';
                    this.feed_desc = '';
                });

                this.ajaxRequest = false;
            },
            closeModal: function() {
                this.feed_id = '';
                this.feed_name = '';
                this.feed_desc = '';
                this.error_msg = '';
                this.$store.modal = false;
            },
            saveFeed: function() {

                this.$http.put('http://localhost/rssmonster/public/api/feeds/' + this.feed_id, {feed_name: 'feed_name', feed_desc: 'feed_desc'}).then(response => {
                    // success
                }, response => {
                    // error callback
                });

                //send event to refresh the categories
                this.$store.refreshCategories = this.$store.refreshCategories + 1;

                //close modal
                this.closeModal();
            }
        }
    }
</script>
