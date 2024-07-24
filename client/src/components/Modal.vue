<template>
  <div v-if="this.store.showModal">
    <transition name="modal">
      <div class="modal-mask">
        <div class="modal fade" id="myModal" tabindex="-1" role="dialog" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered modal-wrapper" role="document">
            <div class="modal-content modal-container">
              <div class="modal-header">
                <h5 class="modal-title" v-if="this.store.showModal==='newfeed'">Add new feed</h5>
                <h5 class="modal-title" v-if="this.store.showModal==='newcategory'">Add new category</h5>
                <h5 class="modal-title" v-if="this.store.showModal==='deletecategory'">Delete category</h5>
                <h5 class="modal-title" v-if="this.store.showModal==='renamecategory'">Rename category</h5>
                <h5 class="modal-title" v-if="this.store.showModal==='deletefeed'">Delete feed</h5>
                <h5 class="modal-title" v-if="this.store.showModal==='renamefeed'">Rename feed</h5>
                <h5 class="modal-title" v-if="this.store.showModal==='mobile'">Categories</h5>
                <h5 class="modal-title" v-if="this.store.showModal==='cleanup'">Clean up old articles</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close" @click="closeModal">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>

              <!-- This piece of code is for adding new feeds -->
              <div class="modal-body" v-if="this.store.showModal==='newfeed'">
                <!-- Instead of manipulating the store, we operate on a cloned object -->
                <div v-if="this.categories.length > 0">
                  <input class="form-control"  type="text" placeholder="Enter feed or website url..." v-model="url">
                  <br>
                  <div class="form-group row">
                    <label for="inputFeedDescription" class="col-sm-3 col-form-label">Category</label>
                    <div class="col-sm-9">
                      <select class="form-select" id="category" v-model="selectedCategory" aria-label="Select Category">
                        <option v-for="category in this.categories" :value="category.id" :key="category.id" v-bind:id="category.id">{{ category.name }}</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div v-else>
                  <p>No categories exist at this moment.</p>
                  <p>First create a new category before adding a new feed.</p>
                </div>
                <br>
                <button v-if="this.categories.length > 0" type="submit" class="btn btn-primary mb-2" @click="checkWebsite">Validate feed</button>
                <br>
                <span v-if="ajaxRequest">Please Wait ...</span>
                <br>
                <span class="error" v-if="error_msg">{{ error_msg }}</span>
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

              <!-- This piece of code is for adding new categories -->
              <div class="modal-body" v-if="this.store.showModal==='newcategory'">
                <input class="form-control" type="text" placeholder="Enter new category name.." v-model="category.name">
                <br>
              </div>

              <!-- This piece of code is for deleting categories -->
              <div class="modal-body" v-if="this.store.showModal==='deletecategory'">
                <p>Are you sure to delete this category?</p>
                <br>
              </div>

              <!-- This piece of code is for renaming categories -->
              <div class="modal-body" v-if="this.store.showModal==='renamecategory'">
                <input class="form-control" type="text" placeholder="Enter new category name.." v-model="category.name">
                <br>
              </div>

              <!-- This piece of code is for deleting feeds -->
              <div class="modal-body" v-if="this.store.showModal==='deletefeed'">
                <p>Are you sure to delete this feed?</p>
                <br>
              </div>

              <!-- This piece of code is for deleting feeds -->
              <div class="modal-body" v-if="this.store.showModal==='cleanup'">
                <p>Pressing the cleanup button will delete all articles that are not starred and older than one week.</p>
                <p>Are you sure to perform this cleanup?</p>
                <br>
              </div>

              <!-- This piece of code is for renaming feeds -->
              <div class="modal-body" v-if="this.store.showModal==='renamefeed'">
                <div class="form-group row">
                  <label for="inputFeedName" class="col-sm-3 col-form-label">Feed name</label>
                  <div class="col-sm-9">
                    <input class="form-control" type="text" id="feed_name" placeholder="Feed name" v-model="feed.feedName">
                  </div>
                </div>
                <div class="form-group row" v-if="feed.errorCount > 10">
                  <label for="inputFeedUrl" class="col-sm-3 col-form-label">Feed url</label>
                  <div class="col-sm-9">
                    <input class="form-control" type="text" id="rssUrl" placeholder="Feed RSS Url" v-model="feed.rssUrl">
                  </div>
                </div>
                <div v-if="this.categories.length > 0">
                  <div class="form-group row">
                    <label for="inputFeedDescription" class="col-sm-3 col-form-label" >Feed description</label>
                    <div class="col-sm-9">
                      <input class="form-control" type="text" id="feed_desc" placeholder="Feed description" v-model="feed.feedDesc">
                    </div>
                  </div>
                  <div class="form-group row">
                    <label for="inputFeedDescription" class="col-sm-3 col-form-label">Category</label>
                    <div class="col-sm-9">
                      <select class="form-select" id="category" v-model="selectedCategory" aria-label="Select Category">
                        <option v-for="category in this.categories" :selected="this.selectedCategory == category.id" :value="category.id" :key="category.id" v-bind:id="category.id">{{ category.name }}</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <!-- This piece of code is for when viewing using the mobile version -->
              <div class="modal-body" id="mobile" v-if="this.store.showModal==='mobile'">
                <p>Select which category you want to display</p>
                <ul class="categories">
                  <li class="category" v-on:click="store.currentSelection.categoryId = null">
                    <span class="glyphicon">
                      <i class="far fa-folder" data-fa-transform="down-5 shrink-2"></i>
                    </span>
                    <span>Show all categories</span>
                  </li>
                  <li class="category" v-on:click="store.currentSelection.categoryId = category.id" v-for="category in store.categories" :key="category.id" v-bind:id="category.id">
                    <span class="glyphicon">
                      <i class="far fa-folder" data-fa-transform="down-5 shrink-2"></i>
                    </span>
                    <span>{{ category.name }}</span>
                  </li>
                </ul>
                <p>Select how the articles should be displayed</p>
                <button @click="store.filter = 'full'" type="button" class="btn btn-primary content">Full content</button>
                <button @click="store.filter = 'minimal'" type="button" class="btn btn-primary content">Minimal content</button>

                <p>Click the button below to add a new feed</p>
                <button @click="this.store.showModal = 'newfeed'" type="button" class="btn btn-success">Add new feed</button>
              </div>
              <div class="modal-footer">
                <button v-if="feed.feedName && this.store.showModal==='newfeed'" type="button" class="btn btn-primary" @click="newFeed">Save changes</button>
                <button v-if="this.store.showModal==='newcategory'" type="button" class="btn btn-primary" @click="saveCategory">Add new category</button>
                <button v-if="this.store.showModal==='deletecategory'" type="button" class="btn btn-primary" @click="deleteCategory">Delete category</button>
                <button v-if="this.store.showModal==='renamecategory'" type="button" class="btn btn-primary" @click="renameCategory">Update category</button>
                <button v-if="this.store.showModal==='deletefeed'" type="button" class="btn btn-primary" @click="deleteFeed">Delete feed</button>
                <button v-if="this.store.showModal==='renamefeed'" type="button" class="btn btn-primary" @click="renameFeed">Update feed</button>
                <button v-if="this.store.showModal==='cleanup'" type="button" class="btn btn-danger" @click="cleanup">Cleanup</button>
                <button type="button" class="btn btn-secondary" data-dismiss="modal" @click="emitClickEvent('modal',null)">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style>
.btn.btn-primary.content {
  margin-right: 7px;
}
</style>

<style scoped>
/* Landscape phones and portrait tablets */
@media (max-width: 766px) {
  #myModal {
    padding-top: 100px;
  }

  div.modal-body p {
    margin-bottom: 3px;
  }
}

/* Desktop */
@media (min-width: 766px) {
  .modal-container {
    padding: 20px 30px;
  }
}

#myModal.modal {
  display: inline;
  opacity: 1;
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
  background-color: #000000;
  display: table;
  transition: opacity 0.3s ease;
}

.modal-container {
  margin: 0px auto;
  background-color: #fff;
  border-radius: 2px;
  box-shadow: 0 2px 8px #000000;
  transition: all 0.3s ease;
  color: #111;
}

.modal-enter, .modal-leave-active {
  opacity: 0;
}

.modal-enter .modal-container,
.modal-leave-active .modal-container {
  -webkit-transform: scale(1.1);
  -moz-transform: scale(1.1);
  -ms-transform: scale(1.1);
  -o-transform: scale(1.1);
  transform: scale(1.1);
}

#newfeed {
  height: 100%;
  width: 20%;
  float: left;
  text-align: center;
  border-right: 1px solid black;
  border-color: #dcdee0;
}

span.error, .form-control.red {
  color: red;
}

@media (prefers-color-scheme: dark) {
  .modal-container {
    background-color: #323232;
    color: white;
  }

  .modal-body input, .modal-body input:focus {
    background-color: #191919 !important;
    color: white !important;
  }

  ::placeholder {
    color: #717171 !important;
  }

  input, input:placeholder, input:focus{
    color: white;
  }

  .btn-secondary {
    background-color: #464646 !important;
  }

  select {
    background-color: #191919 !important;
    color: white !important;
  }

  span.error, .form-control.red {
    color: #ffb1b1;
  }
}
</style>

<style>
div.close, button.close {
  visibility: hidden;
}
</style>

<script>
import store from "../store";
import axios from 'axios';

export default {
  props: ["inputCategory", "inputFeed"],
  data() {
    return {
      store: store,
      ajaxRequest: false,
      error_msg: "",
      url: null,
      category: {},
      categories: {},
      feed: {},
      selectedCategory: null
    };
  },
  //watchers are used to avoid two way binding.
  //a copy of the data used and only the central store is updated, once we know for sure the api has returned a 200 status.
  watch: {
    "store.categories": {
      handler: function(data) {
        this.categories = data;
      },
      deep: true
    },
    "store.showModal": {
      handler: function(data) {
        this.categories = JSON.parse(JSON.stringify(this.store.categories));
        this.selectedCategory = this.store.currentSelection.categoryId;

        //get initial starting values (copied data)
        this.categories = JSON.parse(JSON.stringify(this.store.categories));
        this.selectedCategory = this.store.currentSelection.categoryId;
        //Fetch category data from store, because on initial load the cloned category doesn't exist yet.
        if (this.store.currentSelection.categoryId) {
          for (var x = 0; x < this.store.categories.length; x++) {
            if (this.store.categories[x].id == this.store.currentSelection.categoryId) {
              this.category = JSON.parse(JSON.stringify(this.store.categories[x]));
              //and also try to find the feed
              for (var i = 0; i < this.store.categories[x].feeds.length; i++) {
                if (this.store.categories[x].feeds[i].id === this.store.currentSelection.feedId) {
                  this.feed = JSON.parse(JSON.stringify( this.store.categories[x].feeds[i]));
                }
              }
            }
          }
        }
      },
    },
    inputCategory() {
      if (this.inputCategory) {
        this.category = JSON.parse(JSON.stringify(this.inputCategory));
        this.selectedCategory = this.category.id;
      }
    },
    inputFeed() {
      if (this.inputFeed) {
        this.feed = JSON.parse(JSON.stringify(this.inputFeed));
      }
    }
  },
  methods: {
    checkWebsite: function() {
      //set ajaxRequest to true so the please wait shows up the screen
      this.ajaxRequest = true;

      axios
        .post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/feeds/validate", { url: this.url, categoryId:this.selectedCategory })
        .then(
          result => {
            /* eslint-disable no-console */
            console.log(result.status);
            /* eslint-enable no-console */
            this.error_msg = "";
            this.feed = result.data;
          },
          response => {
            this.error_msg = response.response.data.error_msg;
          }
        )
        .catch(err => {
          /* eslint-disable no-console */
          console.log(err);
          /* eslint-enable no-console */
        });

      this.ajaxRequest = false;
    },
    closeModal: function() {
      //set error_msg and url back to normal
      this.error_msg = "";
      this.url = "";
      this.emitClickEvent("modal", null);
    },
    emitClickEvent(eventType, value) {
      this.$emit(eventType, value);
    },
    newFeed: function() {
      axios
        .post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/feeds", {
          categoryId: this.selectedCategory,
          feedName: this.feed.feedName,
          feedDesc: this.feed.feedDesc,
          url: this.feed.url,
          rssUrl: this.feed.rssUrl
        })
        .then(
          result => {
            /* eslint-disable no-console */
            console.log(result.status);
            /* eslint-enable no-console */

            //overwrite results with results from the database
            this.feed = result.data;

            //add missing count properties, since these are populated dynamically on an initial load
            this.feed.unreadCount = 0;
            this.feed.readCount = 0;
            this.feed.starCount = 0;

            //find the index of the category
            var index = this.findIndexById(this.store.categories, this.inputCategory.id);

            //push the new feed to the store
            this.store.categories[index].feeds.push(this.feed);
          },
          response => {
            /* eslint-disable no-console */
            console.log("oops something went wrong", response);
            /* eslint-enable no-console */
          }
        );

      //send event to refresh the categories
      this.store.refreshCategories++;

      //close modal
      this.closeModal();
    },
    saveFeed: function() {
      axios
        .put(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/feeds/" + this.feed.id, {
          categoryId: this.category.id,
          feedName: this.feed.feedName,
          feedDesc: this.feed.feedDesc,
          rssUrl: this.feed.rssUrl,
          url: this.feed.url,
          favicon: this.feed.favicon
        })
        .then(
          result => {
            /* eslint-disable no-console */
            console.log(result.status);
            /* eslint-enable no-console */
          },
          response => {
            /* eslint-disable no-console */
            console.log("oops something went wrong", response);
            /* eslint-enable no-console */
          }
        );

      //send event to refresh the categories
      this.store.refreshCategories++;

      //close modal
      this.closeModal();
    },
    saveCategory: function() {
      //save category when category name is set
      if (this.category) {
        axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/categories", { name: this.category.name }).then(
          result => {
            //create new local category in data object
            this.category = result.data;

            //add missing count properties, since these are populated dynamically
            this.category.unreadCount = 0;
            this.category.readCount = 0;
            this.category.starCount = 0;
            this.category.feeds = [];

            //push the new category to categories in store
            this.store.categories.push(result.data);

            //close the modal
            this.closeModal();
          },
          response => {
            /* eslint-disable no-console */
            console.log("oops something went wrong", response);
            /* eslint-enable no-console */
            this.closeModal();
          }
        );
      }
    },
    deleteCategory: function() {
      //delete category
      axios.delete(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/categories/" + this.category.id).then(
        () => {
          //remove the category from the store
          this.store.categories = this.arrayRemove(this.store.categories, this.inputCategory);
          //close the modal
          this.closeModal();
          //set the selection back to all
          this.store.currentSelection.categoryId = "%";
          this.store.currentSelection.feedId = "%";
        },
        response => {
          /* eslint-disable no-console */
          console.log("oops something went wrong", response);
          /* eslint-enable no-console */
          this.closeModal();
        }
      );
    },
    arrayRemove(arr, value) {
      //filter function to remove item from an array
      return arr.filter(function(ele) {
        return ele != value;
      });
    },
    cleanup: function() {
      axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/cleanup").then(
        () => {
          //set the selection back to all and refresh the page
          this.store.currentSelection.categoryId = "%";
          this.store.currentSelection.feedId = "%";
          location.reload();
        },
        response => {
          /* eslint-disable no-console */
          console.log("oops something went wrong", response);
          /* eslint-enable no-console */
          this.closeModal();
        }
      );
    },
    renameCategory: function() {
      //rename category
      axios
        .put(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/categories/" + this.store.currentSelection.categoryId, {
          name: this.category.name
        })
        .then(
          result => {
            //find the index of the category
            var index = this.findIndexById(this.store.categories, this.inputCategory.id);

            //update the store with the returned name of the category
            this.store.categories[index].name = result.data.name;

            //close the modal
            this.closeModal();
          },
          response => {
            /* eslint-disable no-console */
            console.log("oops something went wrong", response);
            /* eslint-enable no-console */
            this.closeModal();
          }
        );
    },
    deleteFeed: function() {
      //delete category
      axios.delete(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/feeds/" + this.store.currentSelection.feedId).then(
        () => {
          //find the index of both the category and feed
          var indexCategory = this.findIndexById(this.store.categories, this.inputCategory.id);

          //remove the feed from the store
          this.store.categories[indexCategory].feeds = this.arrayRemove(
            this.store.categories[indexCategory].feeds,
            this.inputFeed
          );

          //set the feed selection back to all
          this.store.currentSelection.feedId = "%";

          //close the modal
          this.closeModal();
        },
        response => {
          /* eslint-disable no-console */
          console.log("oops something went wrong", response);
          /* eslint-enable no-console */
          this.closeModal();
        }
      );
    },
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
    renameFeed: function() {
      //rename feed
      axios
        .put(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/feeds/" + this.feed.id, {
          feedName: this.feed.feedName,
          feedDesc: this.feed.feedDesc,
          categoryId: this.selectedCategory,
          rssUrl: this.feed.rssUrl
        })
        .then(
          //we did change the feed in the backend, but not yet in the frontend. Therefore, we need to manipulate the store with the code below.
          result => {

            //find indexes of the category and feed
            var indexCategory = this.findIndexById(this.store.categories, this.inputFeed.categoryId);
            var indexFeed = this.findIndexById(this.store.categories[indexCategory].feeds, this.inputFeed.id);

            //check if the feed or category is not found
            if (indexFeed == -1 || indexCategory == -1) {
              console.log("Manipulating the store failed... Refreshing page.");
              location.reload();
            } else {
              //update the feed in the store with the results from the api
              this.store.categories[indexCategory].feeds[indexFeed].feedName = result.data.feedName;
              this.store.categories[indexCategory].feeds[indexFeed].feedDesc = result.data.feedDesc;

              //reset error count
              this.store.categories[indexCategory].feeds[indexFeed].errorCount = 0;

              //compare the categoryId, if not equal it means that the feed has been moved
              if (this.inputFeed.categoryId != result.data.categoryId) {
                //update the categoryId to the new categoryId
                this.store.categories[indexCategory].feeds[indexFeed].categoryId = result.data.categoryId;

                //lookup the new categoryIndex
                var indexCategoryNew = this.findIndexById(this.store.categories, result.data.categoryId);

                //duplicate the feed into the new category
                this.store.categories[indexCategoryNew].feeds.push(this.store.categories[indexCategory].feeds[indexFeed]);

                //decrease the counts for the old category
                this.store.categories[indexCategory].unreadCount = this.store.categories[indexCategory].unreadCount - this.inputFeed.unreadCount;
                this.store.categories[indexCategory].readCount = this.store.categories[indexCategory].readCount - this.inputFeed.readCount;
                this.store.categories[indexCategory].starCount = this.store.categories[indexCategory].starCount - this.inputFeed.starCount; 

                //increase the counts for the new category
                this.store.categories[indexCategoryNew].unreadCount = this.store.categories[indexCategoryNew].unreadCount + this.inputFeed.unreadCount;
                this.store.categories[indexCategoryNew].readCount = this.store.categories[indexCategoryNew].readCount + this.inputFeed.readCount;
                this.store.categories[indexCategoryNew].starCount = this.store.categories[indexCategoryNew].starCount + this.inputFeed.starCount; 

                //remove the feed from the store from the old category
                this.store.categories[indexCategory].feeds = this.arrayRemove(this.store.categories[indexCategory].feeds,this.inputFeed);

                //change current selection
                this.store.currentSelection.categoryId = this.selectedCategory;
                this.store.currentSelection.feedId = this.inputFeed.id;
              }
            }

            //close the modal
            this.closeModal();
          },
          response => {
            /* eslint-disable no-console */
            console.log("oops something went wrong", response);
            /* eslint-enable no-console */
            this.closeModal();
          }
        );
    }
  }
};
</script>