<template>
    <div id="app">
        <div class="row" style="margin-right:0px;">
            <div class="sidebar col-md-3 col-sm-0" style="position:fixed">
                <app-quickbar></app-quickbar>
                <app-sidebar></app-sidebar>
            </div>
            <div class="home col-md-9 offset-md-3 col-sm-12">
                <app-quickbar></app-quickbar>
                <app-home></app-home>
            </div>
        </div>

        <!-- Modal for new feed -->
        <div v-if="$store.modal">
            <transition name="modal">
                <div class="modal-mask">
                <div class="modal fade" id="myModal" tabindex="-1" role="dialog" aria-hidden="true">
                    <div class="modal-dialog modal-dialog-centered modal-wrapper" role="document">
                        <div class="modal-content modal-container">
                            <div class="modal-header">
                                <h5 class="modal-title" v-if="$store.modal==='newfeed'">Add new feed</h5>
                                <h5 class="modal-title" v-if="$store.modal==='newcategory'">Add new category</h5>
                                <h5 class="modal-title" v-if="$store.modal==='deletecategory'">Delete category</h5>
                                <h5 class="modal-title" v-if="$store.modal==='renamecategory'">Rename category</h5>
                                <h5 class="modal-title" v-if="$store.modal==='deletefeed'">Delete feed</h5>
                                <h5 class="modal-title" v-if="$store.modal==='renamefeed'">Rename feed</h5>
                                <button type="button" class="close" data-dismiss="modal" aria-label="Close" @click="closeModal">
                                <span aria-hidden="true">&times;</span>
                                </button>
                            </div>
                            <div class="modal-body" v-if="$store.modal==='newfeed'">
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

                                    <div class="form-group row">
                                        <label for="inputFeedDescription" class="col-sm-3 col-form-label">Category</label>
                                        <div class="col-sm-9">
                                            <select class="form-control" id="category" v-model="category">
                                                <option v-for="category in this.$store.categories" :value="category.id" :selected="category.id == 1">{{ category.name }}</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="modal-body" v-if="$store.modal==='newcategory'">
                                <input class="form-control form-control-lg" type="text" placeholder="Enter new category name.." v-model="category">
                                <br>
                            </div>

                            <div class="modal-body" v-if="$store.modal==='deletecategory'">
                                <p>Are you sure to delete this category?</p>
                                <br>
                            </div>

                            <div class="modal-body" v-if="$store.modal==='renamecategory'">
                                <input class="form-control form-control-lg" type="text" placeholder="Enter new category name.." v-model="category_name">
                                <br>
                            </div>

                            <div class="modal-body" v-if="$store.modal==='deletefeed'">
                                <p>Are you sure to delete this feed?</p>
                                <br>
                            </div>

                            <div class="modal-body" v-if="$store.modal==='renamefeed'">
                                <div class="form-group row">
                                    <label for="inputFeedName" class="col-sm-3 col-form-label">Feed name</label>
                                    <div class="col-sm-9">
                                        <input type="text" class="form-control" id="feed_name" v-model="feed_name" placeholder="Feed name">
                                    </div>
                                </div>
                                <div class="form-group row">
                                    <label for="inputFeedDescription" class="col-sm-3 col-form-label">Feed description</label>
                                    <div class="col-sm-9">
                                        <input type="text" class="form-control" id="feed_desc" v-model="feed_desc" placeholder="Feed description">
                                    </div>
                                </div>
                                <div class="form-group row">
                                    <label for="inputFeedDescription" class="col-sm-3 col-form-label">Category</label>
                                    <div class="col-sm-9">
                                        <select class="form-control" id="category" v-model="category">
                                            <option v-for="category in this.$store.categories" :value="category.id" :selected="category.id == $store.data.category">{{ category.name }}</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div class="modal-footer">
                                <button v-if="feed_id" type="button" class="btn btn-primary" @click="saveFeed">Save changes</button>
                                <button v-if="$store.modal==='newcategory'" type="button" class="btn btn-primary" @click="saveCategory">Add new category</button>
                                <button v-if="$store.modal==='deletecategory'" type="button" class="btn btn-primary" @click="deleteCategory">Delete category</button>
                                <button v-if="$store.modal==='renamecategory'" type="button" class="btn btn-primary" @click="renameCategory">Update category</button>
                                <button v-if="$store.modal==='deletefeed'" type="button" class="btn btn-primary" @click="deleteFeed">Delete feed</button>
                                <button v-if="$store.modal==='renamefeed'" type="button" class="btn btn-primary" @click="renameFeed">Update feed</button>
                                <button type="button" class="btn btn-secondary" data-dismiss="modal" @click="closeModal">Cancel</button>
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            </transition>
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
    
    div.col-md-9 {
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

    div.quickbar {
        position: fixed;
    }
}

/* Desktop */
@media (min-width: 766px) {
	div.home div.quickbar {
        display:none;
    }

    div.quickbar {
        display:none;
    }

    div.sidebar {
        height: 100%;
        background-color: #4E57A3;
        overflow-y: auto;
    }
}

body {
    background-color: #F9F9F9;
}

#myModal.modal {
    display: inline;
    opacity: 1.0;
}

div.modal-dialog {
    max-width: 800px;
}

.modal-mask {
    position: fixed;
    z-index: 9998;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, .5);
    display: table;
    transition: opacity .3s ease;
}

.modal-container {
    margin: 0px auto;
    padding: 20px 30px;
    background-color: #fff;
    border-radius: 2px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, .33);
    transition: all .3s ease;
    color: #111;
}

.modal-enter {
    opacity: 0;
}

.modal-leave-active {
    opacity: 0;
}

.modal-enter .modal-container,
.modal-leave-active .modal-container {
    -webkit-transform: scale(1.1);
    transform: scale(1.1);
}

button.close span {
    color: #111;
}

span.error {
    color: red;
}

</style>

<script>
    import Sidebar from './components/Sidebar.vue';
    import Home from './components/Home.vue';
    import Quickbar from './components/Quickbar.vue';
    export default {
        components: {
            appSidebar: Sidebar,
            appHome: Home,
            appQuickbar: Quickbar
        },
        store: {
            data: 'data',
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
                error_msg: '',
                category_name: null
            }
        },
        methods: {
            checkWebsite: function() {
                this.ajaxRequest = true;

                this.$http.post('feeds/newrssfeed?url=' + this.url).then(response => {
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
            saveCategory: function() {
                //save category when category name is set
                if (this.category) {
                    this.$http.post('categories', {name: this.category}).then(response => {
                        console.log(response.status);
                        //send event to refresh the categories
                        this.$store.refreshCategories++;
                        this.closeModal();
                    }, response => {
                        this.closeModal();
                    });
                }
            },
            deleteCategory: function() {
                //delete category
                this.$http.delete('categories/' + this.$store.data.category).then(response => {
                    console.log(response.status);
                    //send event to refresh the categories
                    this.$store.refreshCategories++;
                    this.closeModal();
                }, response => {
                    this.closeModal();
                });
            },
            renameCategory: function() {
                //rename category
                this.$http.put('categories/' + this.$store.data.category, {name: this.category_name}).then(response => {
                    console.log(response.status);
                    this.$store.refreshCategories++;
                    this.closeModal();
                }, response => {
                    this.closeModal();
                });
            },
            deleteFeed: function() {
                //delete category
                this.$http.delete('feeds/' + this.$store.data.feed).then(response => {
                    console.log(response.status);
                    //send event to refresh the categories
                    this.$store.refreshCategories++;
                    this.closeModal();
                }, response => {
                    this.closeModal();
                });
            },
            renameFeed: function() {
                //rename category
                this.$http.put('feeds/' + this.$store.data.feed, {name: this.feed_name, feed_desc: this.feed_desc, category_id: this.category}).then(response => {
                    console.log(response.status);
                    this.$store.refreshCategories++;
                    this.closeModal();
                }, response => {
                    this.closeModal();
                });
            },
            saveFeed: function() {
                this.$http.put('feeds/' + this.feed_id, {feed_name: this.feed_name, feed_desc: this.feed_desc, category_id: this.category}).then(response => {
                    console.log(response.status);
                }, response => {
                    // error callback
                });

                //send event to refresh the categories
                this.$store.refreshCategories++;

                //close modal
                this.closeModal();
            },
            lookupFeedById: function(feed_id) {
                for (var x=0; x<this.$store.categories.length; x++) {
                    for (var i=0; i<this.$store.categories[x].feeds.length; i++) {
                        if (this.$store.categories[x].feeds[i].id === feed_id) {
                            return this.$store.categories[x].feeds[i];
                        }
                    }
                }
            }
        },
        //watch the store.data.category, update the category name, needed for model input dialog
        watch: {
            '$store.data': {
                handler: function(data) {
                    //lookup category name based on the category_id received
                    if (data.category) {
                        var item = this.$store.categories.filter(function(a){ return a.id == data.category })[0];
                        this.category_name = item.name;
                    }
                    //lookup feed name based on the feed_id
                    if (data.feed) {
                        var feed = this.lookupFeedById(data.feed)
                        this.feed_name = feed.feed_name;
                        this.feed_desc = feed.feed_desc;
                    }
                },
                deep: true
            }
        }
    }
</script>
