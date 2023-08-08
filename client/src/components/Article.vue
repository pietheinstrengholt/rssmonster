<template>
  <div class="block" :id="id">
    <div class="article" v-bind:class="{'starred': starInd == 1, 'hot': hotlinks }" v-on:click="bookmark(id, $event)">    
      <div class="maximal">
        <h5 class="heading">
          <a target="_blank" :href="url" v-text="subject"></a>
        </h5>
        <div class="feedname">
          <span class="published_date">{{ formatDate(published) }}</span>
          <span class="break">by</span>
          <span class="feed_name">
            <a target="_blank" :href="feed.url" v-text="feed.feedName"></a>
          </span>
        </div>
      </div>
      <div v-if="store.filter === 'full'" class="article-content">
        <div class="article-body" v-if="content !== '<html><head></head><body>null</body></html>'" v-html="content"></div>
      </div>
      <div v-if="store.filter === 'minimal'" class="article-content">
        <p class="article-body" v-if="content !== '<html><head></head><body>null</body></html>'">{{ stripHTML(content) }}</p>
      </div>
    </div>
  </div>
</template>

<style>
.block .article-body iframe {
  display: none;
}

/* Override css that comes from other websites */
.article-content img, .article-content div {
  float: none !important;
}

/* Override css that comes from other websites */
.article-content iframe {
    width: 100% !important;
    height: auto !important;
}

/* Override css that comes from other websites */
.article {
  max-width: 100% !important;
}

.block .article-content img, .block .article-content figure {
  display: block;
  width: 100% !important;
  height: auto !important;
}

.block .article-content p {
  display: inline !important;
}
</style>

<style scoped>
/* Landscape phones and portrait tablets */
@media (max-width: 766px) {
  .block {
    padding-top: 2px;
  }

  .article {
    display: inline-block;
    position: relative;
    margin-top: 2px;
  }
}

/* Landscape phones and portrait tablets */
@media (min-width: 767px) {
  .block {
    padding-top: 4px;
  }
}

.block {
  margin-bottom: 0px;
}

.block .article.hot .heading, .block .article.starred .heading {
  padding-left: 20px;
  background-repeat: no-repeat;
  background-size: 16px 16px;
  background-position: left 0px top 5px;
}

.block .article.hot {
  background-color: #fffff4;
  border-color: #ffc7c7;
}

.block .article.hot .heading {
  background-image: url("../assets/images/fire.png");
}

.block .article.starred {
  background-color: #fffafa;
  border-color: #ffc7c7;
}

.block .article.starred .heading, .block .bookmarked {
  background-image: url("../assets/images/heart_red.png");
}

.block .article {
  padding-top: 2px;
  padding-left: 5px;
  padding-right: 5px;
  border-color: #e0e0e0;
  background-color: #FBFBFB;
  width: 100%;
}

.block .article-content {
  color: #1b1f23;
  font-size: 14px;
  margin-bottom: 5px;
  margin-top: 1px;
  margin-left: 0px;
}

.block .article h5 a {
  color: #51556a;
  font-weight: 600;
  font-size: 19px;
  text-decoration: none;
  border-bottom: none;
}

.block .feedname {
  margin-top: -8px;
  font-size: 12px;
  padding-top: 1px;
  padding-left: 0px;
  font-weight: bold;
  margin-bottom: 2px;
  color: #51556a;
}

.block.active {
  background-color: #ffffe5;
}

.break {
  margin-left: 2px;
  margin-right: 2px;
}

/* Override css that comes from other websites */
.block .article-content img {
  max-width: 100%;
  height: auto !important;
}

span.feed_name a {
  color: #51556a;
}

.block span.favicon img.favicon {
  margin-right: 5px;
  height: 18px;
  width: 18px;
  margin-top: -1px;
}

@media (prefers-color-scheme: light) {
  .block {
  box-shadow: 0 4px 2px -2px gray;
}
}

@media (prefers-color-scheme: dark) {
  .block, .block .article, .article-content, h5.heading, .block .feedname {
    color: #fff;
    background: #121212;
    border-color: #121212;
    border-bottom-color: #fff;
    background-color: #121212;
  }

  a, .block .article h5 a, .block .article-content, span.feed_name a {
    color: #fff;
  }

  .block .bookmark {
    background-image: url("../assets/images/heart_grey.png");
  }

  .block {
    border-bottom-color: #121212;
    background: #424242;
  }

  /* Landscape phones and portrait tablets */
  @media (max-width: 766px) {
    .block {
      background: #424242;
    }
  }

  .article h1.heading, .article h2.heading {
    color: #fff;
  }

  .article h1.heading a {
    color: #fff;
  }

  .block .article {
    border-bottom-color: black;
    border-width: 0px;
    border-radius: 0px;
  }

  .block .article.hot {
    background-color: #121212;
    border-color: #121212;
  }

  .block .article.starred {
    background-color: #121212;
    border-color: #121212;
  }

  nav ul li {
    background: #000;
  }

  a:visited, a:active, a:link {
    color: #18bc9c;
  }
}
</style>

<script>
import moment from "moment";
import store from "../store";
import axios from 'axios';

export default {
  data() {
    return {
      store: store
    };
  },
  props: ['id','url','subject','published','feed','content','hotlinks', 'status', 'starInd', 'imageUrl', 'contentStripped', 'language', 'createdAt', 'updatedAt', 'feedId'],
  computed: {
    formatDate: function() {
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
    stripHTML: function() {
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
  methods: {
    bookmark(articleId, event) {
      //do not bookmark when clicking on hyperlinks
      if (event.srcElement.nodeName != "A") {

        //determine if classname already contains bookmarked, if so, the change is unmark
        if (event.currentTarget.className.indexOf("starred") >= 0) {
          //make ajax request to change bookmark status
          axios
            .post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/manager/markwithstar/" + articleId, { update: "unmark" })
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
            .post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/manager/markwithstar/" + articleId, { update: "mark" })
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
}
</script>