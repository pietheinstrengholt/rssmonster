<template>
  <InfiniteScroll :articles="articles" :container="container" :pool="pool" :currentSelection="$store.data.currentSelection.status" :remainingItems="remainingItems" :fetchCount="fetchCount" :hasLoadedContent="hasLoadedContent" :isFlushed="isFlushed" :distance="distance">
  </InfiniteScroll>
</template>

<script>
import InfiniteScroll from "./InfiniteScroll.vue";
import axios from 'axios';

export default {
  components: {
    InfiniteScroll
  },
  data() {
    return {
      //distance is used to keep track of the current position in the container
      distance: 0,
      //amount of article leaded at once
      fetchCount: 20,
      //articles containing the article details
      articles: [],
      //container contains a list with all article ids
      container: [],
      //is used to keep track of which articles are already flagged as passed
      pool: [],
      //scroll variables for comparing the scroll positions
      prevScroll: 0,
      scrollDirection: "down",
      hasLoadedContent: false,
      isFlushed: false,
      isLoading: false
    };
  },
  computed: {
    //calculate the remaining items in the container
    remainingItems() {
      return this.container.length - this.pool.length;
    }
  },
  //watch the currentSelection, fetch articleIds when detecting changes
  watch: {
    "$store.data.currentSelection": {
      handler: function(data) {
        this.fetchArticleIds(data);
      },
      deep: true
    }
  },
  created() {
    window.addEventListener("scroll", this.handleScroll);
    axios.defaults.headers.common['Authorization'] = `Bearer ${this.$store.auth.token}`;
  },
  unmounted() {
    window.removeEventListener("scroll", this.handleScroll);
  },
  async beforeCreate() {
    //fetch the current selection by triggering the action in the store
    await this.$store.data.fetchCurrentSelection(this.$store.auth.token);
  },
  methods: {
    fetchArticleIds(data) {
      axios.get(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/articles", {
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
          //reset the pool, attach data to container and get first set of article details
          this.resetPool();
          this.container = response.data.itemIds;
          //get content if the container is not empty
          if (this.container.length > 0) {
            this.getContent();
          } else {
            this.hasLoadedContent = true;
          }
        });
    },
    handleScroll() {
      //get mobileToolbar element
      const mobileToolbar = document.getElementById('mobile-toolbar');

      //get the curScroll and set default direction
      const curScroll = Math.ceil(window.scrollY) || Math.ceil(document.documentElement.scrollTop);
      let direction = "down";

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

        //get new content when the end of bottom page is almost reached. If the number of remaining items is less than the fetchCount, flush the pool
        if (window.innerHeight + Math.ceil(document.documentElement.scrollTop) + 150 >= document.getElementById('main-container').offsetHeight) {
          if (!(this.container.length < this.distance)) {
            //prevent function execution twice within multiple triggered scroll events
            if (this.isLoading === false) {
              //set isLoading to true to prevent multiple fetches
              this.isLoading = true;
              this.getContent();
            }
          } else {
            this.flushPool();
          }
        }

        //mark articles as read when scrolling down
        if (document.getElementById('articles')) {
          //set initial screen height to the current scroll position
          let screenHeight = Math.ceil(document.documentElement.scrollTop);
          //loop through all articles and check if they are in the viewport
          for (const child of document.getElementById('articles').children) {
            //check if the article is still in the viewport
            screenHeight = screenHeight - document.getElementById(child.id).offsetHeight;
            //if the article is no longer in the viewport, add it to the pool and mark it as read
            if (screenHeight > 0) {
              //push articleId to the pool
              this.addToPool(child.id);
            }
          }
        }
      }

      //overwrite the prevScroll and scrollDirection after doing the comparison
      this.prevScroll = curScroll;
      this.scrollDirection = direction;
    },
    getContent() {
      //set a timeout to prevent multiple fetches within a short period of time
      setTimeout(() => {
        //only fetch article details if the container is filled with items
        if (this.container.length > 0) {
          //get all the article content by using the api. Submit the maximum number of articles to fetch as set by the fetchCount
          axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/manager/details", {
              articleIds: this.container.slice(this.distance, this.distance + this.fetchCount).join(","),
              sort: this.$store.data.getSelectedSort
            })
            .then(response => {
              //change hasLoadedContent. This removes the loading icon from the front-page
              this.hasLoadedContent = true;
              //increase the distance and append the new articles to the existing list
              if (response.data.length) {
                this.distance = this.distance + this.fetchCount;
                this.articles = this.articles.concat(response.data);
              //if no articles are returned, flush remaining items in the pool
              } else {
                this.flushPool();
              }

              //set isLoading to false to allow new content to be fetched
              this.isLoading = false;
            }
          );
        }
      }, 10);  
    },
    addToPool(articleId) {
      if (!this.pool.includes(articleId)) {
        this.pool.push(articleId);
        if (this.$store.data.getSelectedStatus === "unread") {
          //mark article as read
          this.markArticleRead(articleId);
        }
      }
    },
    async flushPool() {
      //check if the container has a length and if the pool is not flushed yet
      if (this.container.length && this.isFlushed === false) {
        if (this.$store.data.getSelectedStatus === "unread") {
          //loop through the container and mark every item that is not part of the pool as read
          for (const i in this.container) {
            if (!this.pool.includes(this.container[i])) {
              this.markArticleRead(this.container[i]);
            }
          }
        }
      }
      this.isFlushed = true;
    },
    async resetPool() {
      //reset the articles, container, pool, distance and isFlushed
      this.articles = [];
      this.container = [];
      this.pool = [];
      this.distance = 0;
      this.isFlushed = false;
    },
    async markArticleRead(articleId) {
      //make ajax request to change read status
      await axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/manager/marktoread/" + articleId).then(
        response => {
          this.$store.data.increaseReadCount(response.data);
        },
        response => {
          /* eslint-disable no-console */
          console.log("oops something went wrong", response);
          /* eslint-enable no-console */
        }
      );
    }
  }
};
</script>