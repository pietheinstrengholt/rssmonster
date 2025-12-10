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

.modal-dialog {
    max-width: 600px;
    width: 100%;
}

.row {
    margin-bottom: 5px;
}

select#category {
    margin-left: 20px;
}
</style>

<script>
import axios from 'axios';
import helper from '../../services/helper.js';
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
            // get the selected categoryId
            var selectedCategoryId = this.feed.categoryId;
            var currentCategoryId = this.selectedFeed.categoryId;
            var currentIndexCategory = helper.findIndexById(this.$store.data.categories, this.selectedFeed.categoryId);           
            var currentIndexFeed = helper.findIndexById(this.$store.data.categories[currentIndexCategory].feeds, this.feed.id);
            var newIndexCategory = helper.findIndexById(this.$store.data.categories, this.feed.categoryId);

            // make the API call to update the feed
            await axios
                .put(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/feeds/" + this.$store.data.getSelectedFeedId, {
                    feedName: this.feed.feedName,
                    feedDesc: this.feed.feedDesc,
                    categoryId: selectedCategoryId,
                    rssUrl: this.feed.rssUrl
                })
                .then(
                //we did change the feed in the backend, but not yet in the frontend. Therefore, we need to manipulate the store with the code below.
                result => {

                    console.log("Feed successfully updated. This is the new categoryId: ", result.data.feed.categoryId);

                    //check if the feed or category is not found
                    if (currentIndexFeed == -1 || currentIndexCategory == -1) {
                        console.log("Manipulating the store failed... Refreshing page.");
                        //location.reload();
                    } else {
                        //update the feed in the store with the results from the api
                        this.$store.data.categories[currentIndexCategory].feeds[currentIndexFeed].feedName = result.data.feed.feedName;
                        this.$store.data.categories[currentIndexCategory].feeds[currentIndexFeed].feedDesc = result.data.feed.feedDesc;

                        //reset error count
                        this.$store.data.categories[currentIndexCategory].feeds[currentIndexFeed].errorCount = 0;

                        //compare the categoryId, if not equal it means that the feed has been moved
                        if (currentCategoryId != result.data.feed.categoryId) {
                            console.log("Feed has been moved to another category. Manipulating the store...");

                            //update the categoryId to the new categoryId
                            this.$store.data.categories[currentIndexCategory].feeds[currentIndexFeed].categoryId = result.data.feed.categoryId;

                            //duplicate the feed into the new category
                            this.$store.data.categories[newIndexCategory].feeds.push(this.$store.data.categories[currentIndexCategory].feeds[currentIndexFeed]);

                            //decrease the counts for the old category
                            this.$store.data.categories[currentIndexCategory].unreadCount = this.$store.data.categories[currentIndexCategory].unreadCount - this.feed.unreadCount;
                            this.$store.data.categories[currentIndexCategory].readCount = this.$store.data.categories[currentIndexCategory].readCount - this.feed.readCount;
                            this.$store.data.categories[currentIndexCategory].starCount = this.$store.data.categories[currentIndexCategory].starCount - this.feed.starCount; 

                            //increase the counts for the new category
                            this.$store.data.categories[newIndexCategory].unreadCount = this.$store.data.categories[newIndexCategory].unreadCount + this.feed.unreadCount;
                            this.$store.data.categories[newIndexCategory].readCount = this.$store.data.categories[newIndexCategory].readCount + this.feed.readCount;
                            this.$store.data.categories[newIndexCategory].starCount = this.$store.data.categories[newIndexCategory].starCount + this.feed.starCount; 

                            //remove the feed from the store from the old category
                            this.$store.data.categories[currentIndexCategory].feeds.splice(currentIndexFeed, 1);

                            //update the selectedCategoryId and selectedFeedId in the store
                            this.$store.data.setSelectedCategoryId(result.data.feed.categoryId);
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
        }
    },
    computed: {
        selectedFeed() {
            return helper.findArrayById(this.selectedCategory.feeds, this.$store.data.getSelectedFeedId);
        },
        selectedCategory() {
            return helper.findArrayById(this.$store.data.categories, this.$store.data.getSelectedCategoryId);
        }
    }
}
</script>