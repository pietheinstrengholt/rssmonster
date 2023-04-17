<template>
  <div id="main">
    <div id="articles">
      <div :key="article.id" v-bind:id="article.id" class="block" v-for="article in articles">
        <div class="article" v-bind:class="{'starred': article.starInd == 1, 'hot': article.hotlinks }" v-on:click="bookmark(article.id, $event)">
          <div class="maximal">
            <h5 class="heading">
              <a target="_blank" :href="article.url" v-text="article.subject"></a>
            </h5>
            <div class="feedname">
              <span class="published_date">{{ formatDate(article.published) }}</span>
              <span class="break">by</span>
              <span class="feed_name">
                <a target="_blank" :href="article.feed.url" v-text="article.feed.feedName"></a>
              </span>
            </div>
          </div>
          <div v-if="store.filter === 'full'" class="article-content">
            <div class="article-body" v-if="article.content !== '<html><head></head><body>null</body></html>'" v-html="article.content"></div>
          </div>
          <div v-if="store.filter === 'minimal'" class="article-content">
            <p class="article-body" v-if="article.content !== '<html><head></head><body>null</body></html>'">{{ stripHTML(article.content) }}</p>
          </div>
        </div>
      </div>
      <infinite-loading v-if="firstLoad" ref="infiniteLoading" @infinite="infiniteHandler">
        <template v-slot:no-more>
          <p v-if="this.store.currentSelection.status == 'unread'" v-on:click="flushPool()" id="no-more">No more posts for this selection <br><BootstrapIcon icon="check-square-fill" variant="dark" /> Click here to mark all remaining items as read!</p>
          <p v-if="this.store.currentSelection.status != 'unread'" id="no-more">No more posts for this selection. You reached the bottom!</p>
        </template>
        <template v-slot:no-results>
          <p v-on:click="flushPool()" id="no-results">No posts have been found!<br><br></p>
        </template>
      </infinite-loading>
    </div>
  </div>
</template>

<style>
/* Landscape phones and portrait tablets */
@media (max-width: 766px) {
  div#main {
    padding-top: 38px;
  }

  div#articles {
    padding-top: 0px !important;
    background-color: #ddd;
  }

  div.block {
    margin-bottom: 0px;
    padding-top: 2px;
  }

  div.article {
    display: inline-block;
    position: relative;
  }
}

/* Landscape phones and portrait tablets */
@media (min-width: 767px) {
  div.block {
    margin-bottom: 0px;
    padding-top: 6px;
  }
  div#articles {
    margin-left: -10px;
    margin-right: -8px;
  }
}

div.main {
  margin-top: 50px;
}

div.block .article.hot .heading, div.block .article.starred .heading {
  padding-left: 20px;
  background-repeat: no-repeat;
  background-size: 16px 16px;
  background-position: left 0px top 5px;
}

div.block .article.hot {
  background-color: #fffff4;
  border-color: #ffc7c7;
}

div.block .article.hot .heading {
  background-image: url("../assets/fire.png");
}

div.block .article.starred {
  background-color: #fffafa;
  border-color: #ffc7c7;
}

div.block .article.starred .heading {
  background-image: url("../assets/heart_red.png");
}

div.block .article {
  padding-top: 4px;
  padding-left: 5px;
  padding-right: 5px;
  border-color: #e0e0e0;
  border-width: 1px;
  border: 1px solid #ecf0f1;
  border-radius: 4px;
  background-color: #FBFBFB;
  width: 100%;
}

div.block div.article-content {
  color: #1b1f23;
  font-size: 14px;
  margin-bottom: 5px;
  margin-top: 1px;
  margin-left: 0px;
}

div.block div.article-body iframe {
  display: none;
}

div.article-content img, div.article-content div {
  float: none !important;
}

div.article-content iframe {
    width: 100% !important;
    height: auto !important;
}

div.block .article h5 a {
  color: #51556a;
  font-weight: 600;
  font-size: 19px;
}

div.block div.feedname {
  margin-top: -8px !important;
  font-size: 12px;
  padding-top: 1px;
  padding-left: 0px;
  font-weight: bold;
  margin-bottom: 2px;
  color: #51556a;
}

div.block.active {
  background-color: #ffffe5;
}
span.break {
  margin-left: 2px;
  margin-right: 2px;
}

span.badge.badge-danger {
  float: right;
}

div.block div.article-content img {
  max-width: 100%;
  height: auto !important;
}

span.feed_name a {
  color: #51556a;
}

div.block span.favicon img.favicon {
  margin-right: 5px;
  height: 18px;
  width: 18px;
  margin-top: -1px;
}

div#articles {
  padding-top: 40px;
  overflow-x: hidden;
  overflow-y: hidden;
  right: 0;
  left: 0;
}

div.article {
  max-width: 100% !important;
}

div.block div.article-content img, div.block div.article-content figure {
  max-width: 100%;
  height: auto;
}

div.infinite-loading-container {
  display: block;
  min-height: 50px;
  padding-top: 20px;
}

p#no-results {
  margin-top: 10px;
}

@media (prefers-color-scheme: dark) {
  #main, #articles, div.block, div.block .article, .article-content, h5.heading, div.block div.feedname, div.infinite-loading-container {
    color: #fff;
    background: #121212;
    border-color: #121212;
    border-bottom-color: #fff;
    background-color: #121212;
  }

  div#app {
    background-color: #000;
  }

  div#articles {
    background-color: #121212;
  }

  div.sidebar {
    background-color: #121212;
  }

  a, div.block .article h5 a, div.block div.article-content, span.feed_name a {
    color: #fff;
  }

  div.block div.bookmark {
    background-image: url("../assets/heart_grey.png");
  }

  div.block div.bookmarked {
    background-image: url("../assets/heart_red.png");
  }

  footer p {
    color: #aaa;
  }

  div.block {
    border-bottom-color: #121212;
    background: black;
  }

  div.article h1.heading, div.article h2.heading {
    color: #fff;
  }

  div.article h1.heading a {
    color: #fff;
  }

  h5.heading a {
    text-decoration: none !important;
    border-bottom: none !important;
  }

  div.article {
    border-bottom-color: black !important;
  }

  div.block .article.hot {
    background-color: #121212;
    border-color: #121212;
  }

  div.block .article.starred {
    background-color: #121212;
    border-color: #121212;
  }

  nav ul li {
    background: #000;
  }

  .divider {
    border-bottom: 1px solid #ddd;
  }

  a:visited, a:active, a:link {
    color: #18bc9c;
  }
}

</style>

<script>
import "waypoints/lib/noframework.waypoints.js";
import InfiniteLoading from "vue-infinite-loading";
import moment from "moment";
import axios from 'axios';

import store from "../store";

export default {
  components: {
    InfiniteLoading
  },
  data() {
    return {
      store: store,
      distance: 0,
      //amount of article leaded at once
      fetchCount: 20,
      isActive: false,
      articles: [],
      //container contains a list with all article ids
      container: [],
      //is used to keep track of which articles are already flagged as read
      pool: [],
      //is used to keep track of which articles are already set with the waypoint method
      waypointPool: [],
      firstLoad: false,
      prevScroll: 0,
      prevDirection: "down"
    };
  },
  computed: {
    remainingItems: function() {
      return this.container.length - this.pool.length;
    },
    formatDate: function(){
      return (value)=> {
        if (value) {
          //use fromNow function to calculate time from article published
          value = moment(String(value)).fromNow();
          //uppercase first character of sentence
          value = value.charAt(0).toUpperCase() + value.slice(1);
          return value;
        }
      }
    },
    stripHTML: function(){
      return (value)=> {
        //strip out all HTML
        var str1 = value.replace(/<(.|\n)*?>/g, "");
        //take first 100 words
        var str2 = str1
          .split(/\s+/)
          .slice(0, 100)
          .join(" ");
        return str2;
      }
    }
  },
  //watch the data store, when changing reload the article details
  watch: {
    "store.currentSelection": {
      handler: function(data) {
        this.loadContent(data);
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
    axios
      .get(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/setting")
      .then(response => {
        return response;
      })
      .then(response => {
        this.store.currentSelection = response.data;
        this.firstLoad = true;
      });
  },
  methods: {
    loadContent(data) {
      console.log("Load content");
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
          //reset onInfinite using the new container data
          this.$refs.infiniteLoading.stateChanger.reset();
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

      //start hiding the top toolbar when scrolling down and distance is more than 200px
      if (direction === "down" && curScroll > 200) { 
        mobileToolbar.classList.add('hide');
      }

      //detect change of scroll direction, show back menu when scrolling up
      if (direction !== this.prevDirection) {
        if (direction === "up") {
          mobileToolbar.classList.remove('hide');
        }
      }

      //overwrite the prevScroll and prevDirection after doing the comparison
      this.prevScroll = curScroll;
      this.prevDirection = direction;

      //ceil document.documentElement.scrollTop, because images can have not nicely rounded heights
      let bottomOfWindow = Math.ceil(document.documentElement.scrollTop) + window.innerHeight === document.documentElement.offsetHeight;

      if (bottomOfWindow) {
        //when reaching the bottom of the page and less than 10 articles are in the queue, mark everything as read
        if (this.remainingItems < 10) {
          this.flushPool();
        }
      }
    },
    infiniteHandler($state) {
      //only fetch article details if the container is filled with items
      if (this.container.length > 0) {
        //get all the articles by using the api
        axios
          .post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/manager/details", {
            articleIds: this.container
              .slice(this.distance, this.distance + this.fetchCount)
              .join(","),
            sort: this.store.currentSelection.sort
          })
          .then(response => {
            if (response.data.length) {
              this.distance = this.distance + response.data.length;
              this.articles = this.articles.concat(response.data);
              //set state to loaded
              $state.loaded();
              //add waypoint to every article
              setTimeout(() => {
                for (var key in this.articles) {
                  var article = this.articles[key];
                  //only add triggers if the status is unread
                  if (article.status == "unread") {
                    //make sure only one waypoint per article is set, check the waypointPool for this
                    if (!this.waypointPool.includes(article.id)) {
                      this.waypointCreate(article.id);
                      this.waypointPool.push(article.id);
                    }
                  }
                }
              }, 50);
              //if the returned set has a length of less than fetchCount set the state to complete
              if (response.data.length < this.fetchCount) {
                $state.complete();
              }
              //if no articles are returned, flush remaining items in queue and mark all as read
            } else {
              $state.complete();
              this.flushPool();
            }
          });
        //set state to complete if container is empty
      } else {
        $state.complete();
        this.flushPool();
      }
    },
    async flushPool() {
      //check if the container is present
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
      //reset the articles, container and distance
      this.articles = [];
      this.container = [];
      this.distance = 0;
    },
    waypointCreate(article) {
      //add additional check to fix error: https://stackoverflow.com/questions/40252534/waypoints-no-element-option-passed-to-waypoint-constructor
      if (document.getElementById(article)) {
        // eslint-disable-next-line
        const waypoint = new Waypoint({
          element: document.getElementById(article),
          offset: -150,
          //use the ES2015 arrow syntax to avoid error Cannot read property 'post' of undefined
          handler: direction => {
            if (direction == "down") {
              //make ajax request to change bookmark status
              this.markArticleRead(article);
              //destroy after the article has been marked as read
              waypoint.destroy();
            }
          }
        });
      }
    },
    async markArticleRead(article) {
      if (this.store.currentSelection.status === "unread") {
        //make ajax request to change read status
        await axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/manager/marktoread/" + article).then(
          response => {
            if (!this.pool.includes(article)) {
              //push id to the pool
              this.pool.push(article);

              //decrease the unread count
              var categoryIndex = this.store.categories.findIndex(
                category => category.id === response.data.feed.categoryId
              );
              //avoid having any negative numbers
              if (this.store.categories[categoryIndex].unreadCount != 0) {
                this.store.categories[categoryIndex].unreadCount = this.store.categories[categoryIndex].unreadCount - 1;
                this.store.categories[categoryIndex].readCount = this.store.categories[categoryIndex].readCount + 1;
              }
              var feedIndex = this.store.categories[categoryIndex].feeds.findIndex(feed => feed.id === response.data.feedId);
              //avoid having any negative numbers
              if (this.store.categories[categoryIndex].feeds[feedIndex].unreadCount != 0) {
                this.store.categories[categoryIndex].feeds[feedIndex].unreadCount = this.store.categories[categoryIndex].feeds[feedIndex].unreadCount - 1;
                this.store.categories[categoryIndex].feeds[feedIndex].readCount = this.store.categories[categoryIndex].feeds[feedIndex].readCount + 1;
              }
              //also increase total count
              if (this.store.unreadCount != 0) {
                this.store.readCount = this.store.readCount + 1;
                this.store.unreadCount = this.store.unreadCount - 1;
              }
            }
          },
          response => {
            /* eslint-disable no-console */
            console.log("oops something went wrong", response);
            /* eslint-enable no-console */
          }
        );
      }
    },
    bookmark(article, event) {
      //do not bookmark when clicking on hyperlinks
      if (event.srcElement.nodeName != "A") {

        //determine if classname already contains bookmarked, if so, the change is unmark
        if (event.currentTarget.className.indexOf("starred") >= 0) {
          //make ajax request to change bookmark status
          axios
            .post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/manager/markwithstar/" + article, { update: "unmark" })
            .then(
              response => {
                //decrease the star count
                var categoryIndex = this.store.categories.findIndex(
                  category => category.id === response.data.feed.categoryId
                );
                this.store.categories[categoryIndex].starCount = this.store.categories[categoryIndex].starCount - 1;
                var feedIndex = this.store.categories[categoryIndex].feeds.findIndex(feed => feed.id === response.data.feedId);
                this.store.categories[categoryIndex].feeds[feedIndex].starCount = this.store.categories[categoryIndex].feeds[feedIndex].starCount - 1;

                //also increase total count
                this.store.starCount = this.store.starCount - 1;
              },
              response => {
                /* eslint-disable no-console */
                console.log("oops something went wrong", response);
                /* eslint-enable no-console */
              }
            );
        } else {
          //make ajax request to change bookmark status
          axios
            .post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/manager/markwithstar/" + article, { update: "mark" })
            .then(
              response => {
                //increase the star count
                var categoryIndex = this.store.categories.findIndex(
                  category => category.id === response.data.feed.categoryId
                );
                this.store.categories[categoryIndex].starCount = this.store.categories[categoryIndex].starCount + 1;
                var feedIndex = this.store.categories[categoryIndex].feeds.findIndex(feed => feed.id === response.data.feedId);
                this.store.categories[categoryIndex].feeds[feedIndex].starCount = this.store.categories[categoryIndex].feeds[feedIndex].starCount + 1;

                //also increase total count
                this.store.starCount = this.store.starCount + 1;
              },
              response => {
                /* eslint-disable no-console */
                console.log("oops something went wrong", response);
                /* eslint-enable no-console */
              }
            );
        }
        //toggle div element class
        event.currentTarget.classList.toggle('starred');
      }
    }
  }
};
</script>