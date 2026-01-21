<template>
    <div class="modal" tabindex="-1" role="dialog">
        <div class="modal-dialog" role="document">
            <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Add new feed</h5>
            </div>
              <!-- This piece of code is for adding new feeds -->
              <div class="modal-body">
                <!-- Instead of manipulating the store, we operate on a cloned object -->
                <div v-if="$store.data.categories.length > 0">
                  <input class="form-control"  type="text" placeholder="Enter feed or website url..." v-model="url">
                  <br>
                  <div class="form-group row">
                    <label for="inputFeedDescription" class="col-sm-3 col-form-label">Category</label>
                    <div class="col-sm-9">
                      <select class="form-select" id="category" v-model="selectedCategory" aria-label="Select Category">
                        <option v-for="category in $store.data.categories" :value="category.id" :key="category.id" v-bind:id="category.id">{{ category.name }}</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div v-else>
                  <p>No categories exist at this moment.</p>
                  <p>First create a new category before adding a new feed.</p>
                </div>
                <br>
                <button v-if="$store.data.categories.length > 0" type="submit" class="btn btn-primary mb-2" @click="checkWebsite">Validate feed</button>
                <br>
                <span v-if="ajaxRequest">Please Wait ...</span>
                <br>
                <span class="text-danger" v-if="error_msg">{{ error_msg }}</span>
                <div v-if="feed.feedName">
                  <div class="form-group row">
                    <label for="inputFeedName" class="col-sm-3 col-form-label">Feed name</label>
                    <div class="col-sm-9">
                      <input type="text" class="form-control" v-model="feed.feedName" placeholder="Feed name">
                    </div>
                  </div>
                  <div class="form-group row">
                    <label for="inputFeedDescription" class="col-sm-3 col-form-label">Feed description</label>
                    <div class="col-sm-9">
                      <input type="text" class="form-control" v-model="feed.feedDesc" placeholder="Feed description">
                    </div>
                  </div>
                </div>
              </div>
            <div class="modal-footer">
                <button v-if="feed.feedName" type="button" class="btn btn-primary" @click="newFeed">Save changes</button>
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

#newfeed {
    height: 100%;
    width: 20%;
    float: left;
    text-align: center;
    border-right: 1px solid black;
    border-color: #dcdee0;
}

.text-danger {
    margin-top: 40px;
    margin-bottom: 20px;
    color: red;
}
</style>

<script>
import axios from 'axios';
import helper from '../../services/helper.js';
export default {
    name: 'NewFeed',
    created: function() {
        axios.defaults.headers.common['Authorization'] = `Bearer ${this.$store.auth.token}`;
    },
    data() {
        return {
          ajaxRequest: false,
          error_msg: "",
          url: null,
          category: {},
          feed: {},
          selectedCategory: null
        };
    },
    methods: {
        checkWebsite: function() {
            //set ajaxRequest to true so the please wait shows up the screen
            this.ajaxRequest = true;

            axios
                .post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/feeds/validate", { url: this.url, categoryId:this.selectedCategory })
                .then(
                result => {
                     
                    console.log(result.status);
                     
                    this.error_msg = "";
                    this.feed = result.data;
                },
                response => {
                    this.error_msg = response.response.data.error_msg;
                }
                )
                .catch(err => {
                     
                    console.log(err);
                     
                });

            this.ajaxRequest = false;
        },
        newFeed: function() {
            axios
                .post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/feeds", {
                    categoryId: this.selectedCategory,
                    feedName: this.feed.feedName,
                    feedDesc: this.feed.feedDesc,
                    feedType: this.feed.feedType,
                    url: this.feed.url,
                    rssUrl: this.feed.rssUrl,
                    status: 'active'
                })
                .then(
                result => {
                     
                    console.log(result.status);
                     

                    //overwrite results with results from the database
                    this.feed = result.data.feed;

                    //add missing count properties, since these are populated dynamically on an initial load
                    this.feed.unreadCount = 0;
                    this.feed.readCount = 0;
                    this.feed.starCount = 0;

                    //find the index of the category
                    var index = helper.findIndexById(this.$store.data.categories, this.selectedCategory);

                    //push the new feed to the store
                    this.$store.data.categories[index].feeds.push(this.feed);
                },
                response => {
                     
                    console.log("oops something went wrong", response);
                     
                }
              );

            //send event to refresh the categories. This triggers a re-fetch of the categories and updates the counts
            this.$store.data.increaseRefreshCategories();

            //close modal
            this.$store.data.setShowModal('');
        }
    }
}
</script>