<template>
    <div class="modal" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Update feed</h5>
            </div>
            <div class="modal-body">
              <!-- This piece of code is for renaming feeds -->
                <div class="form-group row">
                  <label for="feedName" class="col-sm-3 col-form-label">Feed name</label>
                  <div class="col-sm-9">
                    <input class="form-control" type="text" id="feed_name" placeholder="Feed name" v-model="feed.feedName">
                  </div>
                </div>
                <div class="form-group row" v-if="feed.errorCount > 10">
                  <label for="feedUrl" class="col-sm-3 col-form-label">Feed url</label>
                  <div class="col-sm-9">
                    <input class="form-control" type="text" id="rssUrl" placeholder="Feed RSS Url" v-model="feed.rssUrl">
                  </div>
                </div>
                <div v-if="$store.data.categories.length > 0">
                  <div class="form-group row">
                    <label for="feedDescription" class="col-sm-3 col-form-label" >Feed description</label>
                    <div class="col-sm-9">
                      <input class="form-control" type="text" id="feed_desc" placeholder="Feed description" v-model="feed.feedDesc">
                    </div>
                  </div>
                  <div class="form-group row">
                    <label for="feedDescription" class="col-sm-3 col-form-label">Category</label>
                    <div class="col-sm-9">
                      <select class="form-select" id="category" v-model="feed.categoryId" aria-label="Select Category">
                        <option v-for="category in $store.data.categories" :value="category.id" :key="category.id" v-bind:id="category.id">{{ category.name }}</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-primary" @click="updateFeed">Update feed</button>
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

.row {
    margin-bottom: 5px;
}
</style>

<script>
import axios from 'axios';
export default {
    name: 'UpdateFeed',
    data() {
        return {
            feed: {}
        }
    },
    created: function() {
        axios.defaults.headers.common['Authorization'] = `Bearer ${this.$store.auth.token}`;

        //clone the selected feed from the store
        this.feed = JSON.parse(JSON.stringify(this.selectedFeed));
    },

    methods: {
        async updateFeed() {
            //find indexes of the category and feed
            var indexCategory = this.findIndexById(this.$store.data.categories, this.$store.data.getSelectedCategoryId);
            var indexFeed = this.findIndexById(this.$store.data.categories[indexCategory].feeds, this.$store.data.getSelectedFeedId);

            //rename feed
            axios
                .put(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/feeds/" + this.$store.data.getSelectedFeedId, {
                    feedName: this.feed.feedName,
                    feedDesc: this.feed.feedDesc,
                    categoryId: this.feed.categoryId,
                    rssUrl: this.feed.rssUrl
                })
                .then(
                //we did change the feed in the backend, but not yet in the frontend. Therefore, we need to manipulate the store with the code below.
                result => {

                    //check if the feed or category is not found
                    if (indexFeed == -1 || indexCategory == -1) {
                        console.log("Manipulating the store failed... Refreshing page.");
                        location.reload();
                    } else {
                        //update the feed in the store with the results from the api
                        this.$store.data.categories[indexCategory].feeds[indexFeed].feedName = result.data.feedName;
                        this.$store.data.categories[indexCategory].feeds[indexFeed].feedDesc = result.data.feedDesc;

                        //reset error count
                        this.$store.data.categories[indexCategory].feeds[indexFeed].errorCount = 0;

                        //compare the categoryId, if not equal it means that the feed has been moved
                        if (this.feed.categoryId != result.data.categoryId) {
                            //update the categoryId to the new categoryId
                            this.$store.data.categories[indexCategory].feeds[indexFeed].categoryId = result.data.categoryId;

                            //lookup the new categoryIndex
                            var indexCategoryNew = this.findIndexById(this.$store.data.categories, result.data.categoryId);

                            //duplicate the feed into the new category
                            this.$store.data.categories[indexCategoryNew].feeds.push(this.$store.data.categories[indexCategory].feeds[indexFeed]);

                            //decrease the counts for the old category
                            this.$store.data.categories[indexCategory].unreadCount = this.$store.data.categories[indexCategory].unreadCount - this.feed.unreadCount;
                            this.$store.data.categories[indexCategory].readCount = this.$store.data.categories[indexCategory].readCount - this.feed.readCount;
                            this.$store.data.categories[indexCategory].starCount = this.$store.data.categories[indexCategory].starCount - this.feed.starCount; 

                            //increase the counts for the new category
                            this.$store.data.categories[indexCategoryNew].unreadCount = this.$store.data.categories[indexCategoryNew].unreadCount + this.feed.unreadCount;
                            this.$store.data.categories[indexCategoryNew].readCount = this.$store.data.categories[indexCategoryNew].readCount + this.feed.readCount;
                            this.$store.data.categories[indexCategoryNew].starCount = this.$store.data.categories[indexCategoryNew].starCount + this.feed.starCount; 

                            //remove the feed from the store from the old category
                            this.$store.data.categories[indexCategory].feeds = this.arrayRemove(this.$store.data.categories[indexCategory].feeds,this.feed);
                        }
                    }

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
    },
    computed: {
        selectedFeed() {
            return this.findArrayById(this.selectedCategory.feeds, this.$store.data.getSelectedFeedId);
        },
        selectedCategory() {
            return this.findArrayById(this.$store.data.categories, this.$store.data.getSelectedCategoryId);
        }
    }
}
</script>