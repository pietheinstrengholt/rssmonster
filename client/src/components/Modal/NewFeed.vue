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
                  <label for="Url" class="col-sm-3 col-form-label">Enter url:</label>
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
                <!--Dropdown for selecting the date -->
                <div class="form-group row" v-if="$store.data.categories.length > 0">
                  <label for="crawlSince" class="col-sm-3 col-form-label">Crawl since</label>
                  <div class="col-sm-9">
                    <select id="crawlSince" class="form-select" v-model="crawlSince" aria-label="Select how far back to crawl">
                      <option value="7d">Last 7 days (default)</option>
                      <option value="1m">Last 1 month</option>
                      <option value="3m">Last 3 months</option>
                      <option value="1y">Last 1 year</option>
                      <option value="all">Everything</option>
                    </select>
                  </div>
                </div>
                <br>
                <button v-if="$store.data.categories.length > 0" type="submit" class="btn btn-primary mb-2" @click="checkWebsite">Validate feed</button>
                <br>
                <span v-if="ajaxRequest">Please Wait ...</span>
                <br>
                <span class="text-danger" v-if="error_msg">{{ error_msg }}</span>
                <div v-if="isCloudflare" class="mt-2">
                  <p class="text-muted small mb-2">You can still add this feed manually. The feed will be crawled, but may experience intermittent fetch failures due to bot protection.</p>
                  <button type="button" class="btn btn-warning btn-sm" @click="forceAdd">
                    <i class="bi bi-shield-exclamation"></i> Add feed anyway
                  </button>
                </div>
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
import { validateFeed, createFeed } from '../../api/feeds';
import { setAuthToken } from '../../api/client';
import helper from '../../services/helper.js';
export default {
    name: 'NewFeed',
    created: function() {
        setAuthToken(this.$store.auth.token);
    },
    data() {
        return {
          ajaxRequest: false,
          error_msg: "",
          isCloudflare: false,
          cloudflareUrl: null,
          url: null,
          category: {},
          feed: {},
          selectedCategory: null,
          crawlSince: '7d'
        };
    },
    methods: {
        async checkWebsite() {
            //set ajaxRequest to true so the please wait shows up the screen
            this.ajaxRequest = true;

            try {
                const result = await validateFeed(this.url, this.selectedCategory);
                this.error_msg = "";
                this.isCloudflare = false;
                this.cloudflareUrl = null;
                this.feed = result.data;
            } catch (error) {
                const data = error.response?.data;
                if (data?.cloudflare) {
                    this.isCloudflare = true;
                    this.cloudflareUrl = data.feedUrl || this.url;
                    this.error_msg = data.error_msg;
                } else {
                    this.isCloudflare = false;
                    this.cloudflareUrl = null;
                    this.error_msg = data?.error_msg || "Error validating feed";
                }
                console.log(error);
            } finally {
                this.ajaxRequest = false;
            }
        },
        async forceAdd() {
            try {
                const feedUrl = this.cloudflareUrl || this.url;
                // Extract hostname as feed name
                let feedName;
                try {
                    feedName = new URL(feedUrl).hostname;
                } catch {
                    feedName = feedUrl;
                }

                const result = await createFeed({
                    categoryId: this.selectedCategory,
                    feedName,
                    feedDesc: null,
                    feedType: 'rss',
                    url: feedUrl,
                    status: 'active',
                    crawlSince: this.crawlSince
                });

                this.feed = result.data.feed;
                this.feed.unreadCount = 0;
                this.feed.readCount = 0;
                this.feed.starCount = 0;

                var index = helper.findIndexById(this.$store.data.categories, this.selectedCategory);
                this.$store.data.categories[index].feeds.push(this.feed);
                this.$store.data.increaseRefreshCategories();
                this.$store.data.setShowModal('');
            } catch (error) {
                this.error_msg = error.response?.data?.error || "Error adding feed";
                console.log(error);
            }
        },
        async newFeed() {
            try {
                const result = await createFeed({
                    categoryId: this.selectedCategory,
                    feedName: this.feed.feedName,
                    feedDesc: this.feed.feedDesc,
                    feedType: this.feed.feedType,
                    url: this.feed.url,
                    status: 'active',
                    crawlSince: this.crawlSince
                });

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

                //send event to refresh the categories. This triggers a re-fetch of the categories and updates the counts
                this.$store.data.increaseRefreshCategories();

                //close modal
                this.$store.data.setShowModal('');
            } catch (error) {
                console.log("oops something went wrong", error);
            }
        }
    }
}
</script>