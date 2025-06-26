<template>
    <div class="modal" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
            <div>{{ selectedFeed }}</div>
            <div class="modal-header">
                <h5 class="modal-title">Rename feed</h5>
            </div>
            <div class="modal-body">
              <!-- This piece of code is for renaming feeds -->
                <div class="form-group row">
                  <label for="inputFeedName" class="col-sm-3 col-form-label">Feed name</label>
                  <div class="col-sm-9">
                    <input class="form-control" type="text" id="feed_name" placeholder="Feed name" v-model="feedName">
                  </div>
                </div>
                <div class="form-group row" v-if="selectedFeed.errorCount > 10">
                  <label for="inputFeedUrl" class="col-sm-3 col-form-label">Feed url</label>
                  <div class="col-sm-9">
                    <input class="form-control" type="text" id="rssUrl" placeholder="Feed RSS Url" v-model="rssUrl">
                  </div>
                </div>
                <div v-if="$store.data.categories.length > 0">
                  <div class="form-group row">
                    <label for="inputFeedDescription" class="col-sm-3 col-form-label" >Feed description</label>
                    <div class="col-sm-9">
                      <input class="form-control" type="text" id="feed_desc" placeholder="Feed description" v-model="feedDesc">
                    </div>
                  </div>
                  <div class="form-group row">
                    <label for="inputFeedDescription" class="col-sm-3 col-form-label">Category</label>
                    <div class="col-sm-9">
                      <select class="form-select" id="category" v-model="selectedCategory" aria-label="Select Category">
                        <option v-for="category in $store.data.categories" :selected="$store.data.getSelectedCategoryId == category.id" :value="category.id" :key="category.id" v-bind:id="category.id">{{ category.name }}</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-primary" @click="renameFeed">Rename feed</button>
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
    name: 'DeleteFeed',
    data() {
        return {
            feedName: ''
        }
    },
    created: function() {
        axios.defaults.headers.common['Authorization'] = `Bearer ${this.$store.auth.token}`;
    },
    methods: {
        async renameFeed() {
            //find indexes of the category and feed
            var indexCategory = this.findIndexById(this.$store.data.categories, this.$store.data.getSelectedCategoryId);
            var indexFeed = this.findIndexById(this.$store.data.categories[indexCategory].feeds, this.$store.data.getSelectedFeedId);

            //rename feed
            axios
                .put(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/feeds/" + this.$store.data.getSelectedFeedId, {
                    feedName: this.feedName,
                    feedDesc: this.$store.data.categories[indexCategory].feeds[indexFeed].feedDesc,
                    categoryId: this.$store.data.categories[indexCategory].feeds[indexFeed].categoryId,
                    rssUrl: this.$store.data.categories[indexCategory].feeds[indexFeed].rssUrl
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
                        if (this.inputFeed.categoryId != result.data.categoryId) {
                            //update the categoryId to the new categoryId
                            this.$store.data.categories[indexCategory].feeds[indexFeed].categoryId = result.data.categoryId;

                            //lookup the new categoryIndex
                            var indexCategoryNew = this.findIndexById(this.$store.data.categories, result.data.categoryId);

                            //duplicate the feed into the new category
                            this.$store.data.categories[indexCategoryNew].feeds.push(this.$store.data.categories[indexCategory].feeds[indexFeed]);

                            //decrease the counts for the old category
                            this.$store.data.categories[indexCategory].unreadCount = this.$store.data.categories[indexCategory].unreadCount - this.inputFeed.unreadCount;
                            this.$store.data.categories[indexCategory].readCount = this.$store.data.categories[indexCategory].readCount - this.inputFeed.readCount;
                            this.$store.data.categories[indexCategory].starCount = this.$store.data.categories[indexCategory].starCount - this.inputFeed.starCount; 

                            //increase the counts for the new category
                            this.$store.data.categories[indexCategoryNew].unreadCount = this.$store.data.categories[indexCategoryNew].unreadCount + this.inputFeed.unreadCount;
                            this.$store.data.categories[indexCategoryNew].readCount = this.$store.data.categories[indexCategoryNew].readCount + this.inputFeed.readCount;
                            this.$store.data.categories[indexCategoryNew].starCount = this.$store.data.categories[indexCategoryNew].starCount + this.inputFeed.starCount; 

                            //remove the feed from the store from the old category
                            this.$store.data.categories[indexCategory].feeds = this.arrayRemove(this.$store.data.categories[indexCategory].feeds,this.inputFeed);
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