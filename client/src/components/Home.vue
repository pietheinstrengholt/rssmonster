<template>
  <InfiniteScroll :articles="articles" :container="container" :pool="pool" :firstLoad="firstLoad" :currentSelection="this.store.currentSelection.status" :remainingItems="remainingItems" :fetchCount="fetchCount">
  </InfiniteScroll>
</template>

<script>
import InfiniteScroll from "./InfiniteScroll.vue";
import store from "../store";
import axios from 'axios';

export default {
  components: {
    InfiniteScroll
  },
  data() {
    return {
      store: store,
      //distance is used to keep track of the current position in the container
      distance: 0,
      //amount of article leaded at once
      fetchCount: 20,
      //articles containing the article details
      articles: [],
      //container contains a list with all article ids
      container: [],
      //is used to keep track of which articles are already flagged as read
      pool: [],
      firstLoad: false,
      //scroll variables for comparing the scroll positions
      prevScroll: 0,
      scrollDirection: "down"
    };
  },
  computed: {
    //calculate the remaining items in the container
    remainingItems: function() {
      return this.container.length - this.pool.length;
    }
  },
  //watch the currentSelection, fetch articleIds when detecting changes
  watch: {
    "store.currentSelection": {
      handler: function(data) {
        this.fetchArticleIds(data);
      },
      deep: true
    }
  },
  created: function() {
    window.addEventListener("scroll", this.handleScroll);
  },
  unmounted: function() {
    window.removeEventListener("scroll", this.handleScroll);
  },
  beforeCreate() {
    //retrieve settings on initial load with either previous query or default settings. This will trigger the watch to get the articles
    axios.get(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/setting").then(response => {
        return response;
      })
      .then(response => {
        this.store.currentSelection = response.data;
      }
    );
  },
  methods: {
    fetchArticleIds(data) {
      axios
        .get(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/articles", {
          params: {
            //the following arguments are used
            status: data.status,
            categoryId: data.categoryId,
            feedId: data.feedId,
            search: data.search,
            sort: data.sort
          }
        })
        .then(response => {
          return response;
        })
        .then(response => {
          //reset the pool, attach data to container and get first set of article details
          this.resetPool();
          this.container = response.data.itemIds;
          //reset and get new content when the status changes
          if (this.firstLoad) {
            this.getContent();
          } else {
            //enable infinite-loading by setting firstLoad to true
            this.firstLoad = true;
            this.getContent();
          }
        });
    },
    handleScroll: function() {
      //get mobileToolbar element
      var mobileToolbar = document.getElementById('mobile-toolbar');

      //get the curScroll and set default direction
      var curScroll = Math.ceil(window.scrollY) || Math.ceil(document.documentElement.scrollTop);
      var direction = "down";

      //compare the curScroll with the prevScroll and update direction
      if (curScroll > this.prevScroll) { 
        direction = "down";
      } else if (curScroll < this.prevScroll) {
        direction = "up";
      }

      //detect change of scroll direction, show back menu when scrolling up
      if (direction !== this.scrollDirection) {
        if (direction === "up") {
          mobileToolbar.classList.remove('hide');
        }
      }

      //calculate the scroll position and mark items as read when scrolling down
      if (direction === "down") {

        //start hiding the top toolbar when scrolling down and distance is more than 200px
        if (curScroll > 200) { 
          mobileToolbar.classList.add('hide');
        }

        //get new content when the end of bottom page is reached, if the number of remaining items is less than the fetchCount, flush the pool
        if (window.innerHeight + Math.ceil(document.documentElement.scrollTop) >= document.getElementById('main-container').offsetHeight) {
          if (this.remainingItems <= this.fetchCount) {
            this.flushPool();
          } else {
            this.getContent();
          }
        }

        //mark articles as read when scrolling down
        if (document.getElementById('articles')) {
          //set initial screen height to the current scroll position
          var screenHeight = Math.ceil(document.documentElement.scrollTop);
          //loop through all articles and check if they are in the viewport
          for (const child of document.getElementById('articles').children) {
            //check if the article is still in the viewport
            screenHeight = screenHeight - document.getElementById(child.id).offsetHeight;
            //if the article is no longer in the viewport, add it to the pool and mark it as read
            if (screenHeight > 0) {
              if (!this.pool.includes(child.id)) {
                //push articleId to the pool
                if (this.store.currentSelection.status === "unread") {
                  //mark article as read
                  this.markArticleRead(child.id);
                }
              }
            }
          }
        }
      }

      //overwrite the prevScroll and scrollDirection after doing the comparison
      this.prevScroll = curScroll;
      this.scrollDirection = direction;
    },
    getContent() {
      //only fetch article details if the container is filled with items
      if (this.container.length > 0) {
        //get all the article content by using the api. Submit the maximum number of articles to fetch as set by the fetchCount
        axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/manager/details", {
            articleIds: this.container.slice(this.distance, this.distance + this.fetchCount).join(","),
            sort: this.store.currentSelection.sort
          })
          .then(response => {
            if (response.data.length) {
              this.distance = this.distance + response.data.length;
              this.articles = this.articles.concat(response.data);
            //if no articles are returned, flush remaining items in queue and mark all as read
            } else {
              this.flushPool();
            }
          });
        //set state to complete if container is empty
      } else {
        this.flushPool();
      }
    },
    async flushPool() {
      //check if the container has a length
      if (this.container.length) {
        //loop through the container and mark every item that is not part of the pool as read
        for (var i in this.container) {
          if (!this.pool.includes(this.container[i])) {
            this.markArticleRead(this.container[i]);
          }
        }
      }
    },
    async resetPool() {
      //reset the articles, container, pool and distance
      this.articles = [];
      this.container = [];
      this.pool = [];
      this.distance = 0;
    },
    async markArticleRead(articleId) {
      if (!this.pool.includes(articleId)) {
        //make ajax request to change read status
        await axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/manager/marktoread/" + articleId).then(
          response => {
            this.pool.push(articleId);
            //decrease the unread count
            var categoryIndex = this.store.categories.findIndex(
              category => category.id === response.data.feed.categoryId
            );
            //avoid having any negative numbers
            if (this.store.categories[categoryIndex].unreadCount > 0) {
              this.store.categories[categoryIndex].unreadCount = this.store.categories[categoryIndex].unreadCount - 1;
              this.store.categories[categoryIndex].readCount = this.store.categories[categoryIndex].readCount + 1;
            }
            var feedIndex = this.store.categories[categoryIndex].feeds.findIndex(feed => feed.id === response.data.feedId);
            //avoid having any negative numbers
            if (this.store.categories[categoryIndex].feeds[feedIndex].unreadCount > 0) {
              this.store.categories[categoryIndex].feeds[feedIndex].unreadCount = this.store.categories[categoryIndex].feeds[feedIndex].unreadCount - 1;
              this.store.categories[categoryIndex].feeds[feedIndex].readCount = this.store.categories[categoryIndex].feeds[feedIndex].readCount + 1;
            }
            //also increase total count
            if (this.store.unreadCount > 0) {
              this.store.readCount = this.store.readCount + 1;
              this.store.unreadCount = this.store.unreadCount - 1;
            }
          },
          response => {
            /* eslint-disable no-console */
            console.log("oops something went wrong", response);
            /* eslint-enable no-console */
          }
        );
      }
    }
  }
};
</script>