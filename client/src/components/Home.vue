<template>
  <div id="main">
    <div id="articles">
      <div :key="article.id" v-bind:id="article.id" class="block" v-for="article in articles">
        <div class="article">
          <div class="maximal">
            <div
              v-bind:class="{'bookmarked': article.starInd == 1}"
              v-on:click="bookmark(article.id, $event)"
              @click="$event.target.classList.toggle('bookmarked')"
              class="bookmark"
            ></div>
            <span
              v-if="article.hotness_count"
              class="badge badge-pill badge-danger"
            >{{ article.hotness_count }}</span>
            <h5 class="heading">
              <a target="_blank" :href="article.url" v-text="article.subject"></a>
            </h5>
            <div class="feedname">
              <span class="feed_name">
                <a target="_blank" :href="article.feed.url" v-text="article.feed.feedName"></a>
              </span>
              <span class="break">|</span>
              <span class="published_date">{{ article.published | formatDate }}</span>
            </div>
          </div>

          <div v-if="store.filter === 'full'" class="article-content" v-html="article.content"></div>
          <div v-if="store.filter === 'minimal'" class="article-content">
            <p>{{ article.content | stripHTML }}</p>
          </div>
        </div>
      </div>
      <infinite-loading v-if="firstLoad" ref="infiniteLoading" @infinite="infiniteHandler">
        <span slot="no-more">
          <p
            v-on:click="flushPool()"
          >No more posts for this selection - Click here to mark all remaining items as read!</p>
        </span>
        <span slot="no-results">
          <p v-on:click="flushPool()">No posts have been found!</p>
        </span>
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

div.block .article {
  padding-top: 4px;
  padding-left: 5px;
  padding-right: 5px;
  border-color: #e0e0e0;
  border-width: 1px;
  border: 1px solid #ecf0f1;
  border-radius: 2px;
  background-color: #fbfbfb;
  width: 100%;
}

div.block div.article-content {
  color: #51556a;
  font-size: 14px;
  margin-bottom: 5px;
  margin-top: 1px;
  margin-left: 0px;
}

div.article-content img {
  float: none !important;
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

div.block .active {
  background-color: #ffffe5;
}

span.break {
  margin-left: 2px;
  margin-right: 2px;
}

div.block div.bookmark,
div.block div.bookmarked {
  height: 29px;
  background-repeat: no-repeat;
  float: left;
  width: 32px;
  margin-top: -8px;
  margin-left: -6px;
  cursor: pointer;
  background-size: 18px 18px;
  background-position: 8px 12px;
  color: #111;
}

div.block div.bookmark {
  background-image: url("../assets/heart_unselected.png");
}

div.block div.bookmarked {
  background-image: url("../assets/heart_selected.png");
}

span.badge.badge-danger {
  float: right;
}

div.block div.article-content img {
  max-width: 100%;
  height: auto;
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

div.block div.article-content img {
  max-width: 100%;
  height: auto;
}

div.infinite-loading-container {
  display: block;
  min-height: 50px;
  padding-top: 20px;
}
</style>

<script>
require("waypoints/lib/noframework.waypoints.js");
import InfiniteLoading from "vue-infinite-loading";
import moment from "moment";

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
      firstLoad: false
    };
  },
  computed: {
    remainingItems: function() {
      return this.container.length - this.pool.length;
    }
  },
  //watch the data store, when changing reload the article details
  watch: {
    "store.currentSelection": {
      handler: function(data) {
        this.$http
          .get("api/articles", {
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
            return response.json();
          })
          .then(data => {
            //reset the pool, attach data to container and get first set of article details
            this.resetPool();
            this.container = data.itemIds;
            //reset onInfinite using the new container data
            this.$refs.infiniteLoading.stateChanger.reset();
          });
      },
      deep: true
    }
  },
  created: function() {
    window.addEventListener("scroll", this.handleScroll);
  },
  destroyed: function() {
    window.removeEventListener("scroll", this.handleScroll);
  },
  beforeCreate() {
    //retrieve settings on initial load with either previous query or default settings. This will trigger the watch to get the articles
    this.$http
      .get("api/setting")
      .then(response => {
        return response.json();
      })
      .then(data => {
        this.store.currentSelection = data;
        this.firstLoad = true;
      });
  },
  methods: {
    handleScroll: function() {
      let bottomOfWindow =
        document.documentElement.scrollTop + window.innerHeight ===
        document.documentElement.offsetHeight;

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
        this.$http
          .post("api/manager/details", {
            articleIds: this.container
              .slice(this.distance, this.distance + this.fetchCount)
              .join(","),
            sort: this.store.currentSelection.sort
          })
          .then(res => {
            if (res.data.length) {
              this.distance = this.distance + res.data.length;
              this.articles = this.articles.concat(res.data);
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
              if (res.data.length < this.fetchCount) {
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
    flushPool() {
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
    resetPool() {
      //reset the articles, container and distance
      this.articles = [];
      this.container = [];
      this.distance = 0;
    },
    waypointCreate(article) {
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
    },
    markArticleRead(article) {
      if (this.store.currentSelection.status === "unread") {
        //make ajax request to change read status
        this.$http.post("api/manager/marktoread/" + article).then(
          response => {
            if (!this.pool.includes(article)) {
              //push id to the pool
              this.pool.push(article);

              //decrease the unread count
              var categoryIndex = this.store.categories.findIndex(
                category => category.id === response.body.feed.categoryId
              );
              this.store.categories[categoryIndex].unreadCount =
                this.store.categories[categoryIndex].unreadCount - 1;
              this.store.categories[categoryIndex].readCount =
                this.store.categories[categoryIndex].readCount + 1;
              var feedIndex = this.store.categories[
                categoryIndex
              ].feeds.findIndex(feed => feed.id === response.body.feedId);
              this.store.categories[categoryIndex].feeds[
                feedIndex
              ].unreadCount =
                this.store.categories[categoryIndex].feeds[feedIndex]
                  .unreadCount - 1;
              this.store.categories[categoryIndex].feeds[feedIndex].readCount =
                this.store.categories[categoryIndex].feeds[feedIndex]
                  .readCount + 1;

              //also increase total count
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
    },
    bookmark(article, event) {
      //determine if classname already contains bookmarked, if so, the change is unmark
      if (event.currentTarget.className.indexOf("bookmarked") >= 0) {
        //make ajax request to change bookmark status
        this.$http
          .post("api/manager/markwithstar/" + article, { update: "unmark" })
          .then(
            response => {
              //decrease the star count
              var categoryIndex = this.store.categories.findIndex(
                category => category.id === response.body.feed.categoryId
              );
              this.store.categories[categoryIndex].starCount =
                this.store.categories[categoryIndex].starCount - 1;
              var feedIndex = this.store.categories[
                categoryIndex
              ].feeds.findIndex(feed => feed.id === response.body.feedId);
              this.store.categories[categoryIndex].feeds[feedIndex].starCount =
                this.store.categories[categoryIndex].feeds[feedIndex]
                  .starCount - 1;

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
        this.$http
          .post("api/manager/markwithstar/" + article, { update: "mark" })
          .then(
            response => {
              //increase the star count
              var categoryIndex = this.store.categories.findIndex(
                category => category.id === response.body.feed.categoryId
              );
              this.store.categories[categoryIndex].starCount =
                this.store.categories[categoryIndex].starCount + 1;
              var feedIndex = this.store.categories[
                categoryIndex
              ].feeds.findIndex(feed => feed.id === response.body.feedId);
              this.store.categories[categoryIndex].feeds[feedIndex].starCount =
                this.store.categories[categoryIndex].feeds[feedIndex]
                  .starCount + 1;

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
    }
  },
  filters: {
    capitalize: function(value) {
      if (!value) return "";
      value = value.toString();
      return value.charAt(0).toUpperCase() + value.slice(1);
    },
    stripHTML: function(value) {
      //strip out all HTML
      var str1 = value.replace(/<(.|\n)*?>/g, "");
      //take first 100 words
      var str2 = str1
        .split(/\s+/)
        .slice(0, 100)
        .join(" ");
      return str2;
    },
    formatDate: function(value) {
      if (value) {
        return moment(String(value)).fromNow();
      }
    }
  }
};
</script>
