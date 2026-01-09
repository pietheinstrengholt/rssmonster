<template>
  <div class="block" :id="id">
    <div class="article" v-bind:class="{'starred': starInd == 1, 'hot': hotlinks }" v-on:click="articleTouched(id, $event)">    
      <div class="maximal">
        <h5 class="heading">
          <BootstrapIcon v-if="clickedInd == 1" icon="bookmark-fill" class="clicked-icon" />
          <BootstrapIcon v-if="starInd == 1" icon="heart-fill" class="star-icon" />
          <BootstrapIcon v-if="hotlinks" icon="fire" class="hot-icon" />
          <a target="_blank" :href="url" v-text="title" @click="articleClicked(id)"></a>
        </h5>
        <div class="feedname">
          <span class="published_date">{{ formatDate(published) }}</span>
          <span class="break">by</span>
          <span class="feed_name">
            <a target="_blank" :href="mainURL(feed.url)" v-text="author || feed.feedName"></a>
          </span>
          <span v-if="cluster && (cluster.articleCount || 0) > 1" class="cluster"> + {{ cluster.articleCount }} similar articles</span>
        </div>
        <div v-if="tags && tags.length > 0 && $store.data.currentSelection.viewMode !== 'minimal'" class="article-tags">
          <span
            v-for="tag in tags"
            :key="tag.id"
            class="tag"
            v-on:click.stop="selectTag(tag)"
          >{{ tag.name }}</span>
          <span v-if="quality !== undefined" class="score overall-score" :title="'Quality Score: ' + quality">Quality: {{ quality * 100 }}</span>
          <span v-if="advertisementScore !== undefined && advertisementScore > 0" class="score ad-score" :title="'Advertisement Score: ' + advertisementScore">Ad: {{ advertisementScore }}</span>
          <span v-if="sentimentScore !== undefined && sentimentScore !== 50" class="score sentiment-score" :title="'Sentiment Score: ' + sentimentScore">Sentiment: {{ sentimentScore }}</span>
          <span v-if="qualityScore !== undefined && qualityScore !== 50" class="score quality-score" :title="'Quality Score: ' + qualityScore">Writing: {{ qualityScore }}</span>
        </div>
      </div>
      <div v-if="$store.data.currentSelection.viewMode === 'full'" class="article-content">
        <div class="article-body" v-if="contentOriginal !== '<html><head></head><body>null</body></html>'" v-html="contentOriginal"></div>
        <div class="media-content enclosure" v-if="imageUrl && !media">
          <img :src="imageUrl" alt="Image" />
        </div>
      </div>
      <div v-if="$store.data.currentSelection.viewMode === 'summarized'" class="article-content">
        <p class="article-body" v-if="contentOriginal !== '<html><head></head><body>null</body></html>'">{{ stripHTML(contentOriginal) }}</p>
      </div>
      <div v-if="$store.data.currentSelection.viewMode === 'minimal' && showMinimalContent" class="article-content">
        <div class="article-body" v-if="contentOriginal !== '<html><head></head><body>null</body></html>'" v-html="contentOriginal"></div>
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
  max-width: 100% !important;
  height: auto !important;
}

.block .article-content p {
  display: inline !important;
}

/* Remove position: relative from all elements in article body */
.article-body * {
  position: static !important;
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

.block .article.hot {
  background-color: #fffff4;
  border-color: #ffc7c7;
}

.block .article.starred {
  background-color: #fffafa;
  border-color: #ffc7c7;
}

.star-icon {
  color: #DB2B39;
  margin-right: 4px;
  vertical-align: middle;
}

.clicked-icon {
  color: #2b79c2;
  margin-right: 4px;
  vertical-align: middle;
}


.hot-icon {
  color: #F3A712;
  margin-right: 4px;
  vertical-align: middle;
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

.block .article-tags {
  margin-top: 5px;
  margin-bottom: 5px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.block .article-tags .tag {
  display: inline-block;
  background-color: #e8f4f8;
  color: #2c5aa0;
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}

.block .article-tags .score {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  background-color: #f5f5f5;
  color: #666;
}

.block .article-tags .overall-score {
  background-color: #ffebee;  /* Pale red */
  color: #c62828;             /* Darker red */
}

.block .article-tags .ad-score {
  background-color: #fff3e0;
  color: #e65100;
}

.block .article-tags .sentiment-score {
  background-color: #e8eaf6;
  color: #3f51b5;
}

.block .article-tags .quality-score {
  background-color: #e8f5e9;
  color: #2e7d32;
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

.media-content.enclosure img {
  max-width: 100%;
  height: auto;
  padding-bottom: 5px;
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

  .block .article-tags .tag {
    background-color: #1e3a5f;
    color: #a8c5e8;
  }

  .block .article-tags .score {
    background-color: #2a2a2a;
    color: #ccc;
  }

 .block .article-tags .overall-score {
    background-color: #2d1a1f;  /* Dark reddish-brown */
    color: #ef5350;             /* Bright red */
  }

  .block .article-tags .ad-score {
    background-color: #3d2a1f;
    color: #ffb74d;
  }

  .block .article-tags .sentiment-score {
    background-color: #1a1f3a;
    color: #9fa8da;
  }

  .block .article-tags .quality-score {
    background-color: #1f2e1f;
    color: #81c784;
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
import axios from 'axios';

function timeDifference(current, previous) {
  const msPerMinute = 60 * 1000;
  const msPerHour = msPerMinute * 60;
  const msPerDay = msPerHour * 24;
  const msPerMonth = msPerDay * 30;
  const msPerYear = msPerDay * 365;
  const elapsed = current - previous;
  if (elapsed < msPerMinute) {
    return Math.round(elapsed / 1000) + ' seconds ago';
  } else if (elapsed < msPerHour) {
    return Math.round(elapsed / msPerMinute) + ' minutes ago';
  } else if (elapsed < msPerDay) {
    return Math.round(elapsed / msPerHour) + ' hours ago';
  } else if (elapsed < msPerMonth) {
    return 'approximately ' + Math.round(elapsed / msPerDay) + ' days ago';
  } else if (elapsed < msPerYear) {
    return 'approximately ' + Math.round(elapsed / msPerMonth) + ' months ago';
  } else {
    return 'approximately ' + Math.round(elapsed / msPerYear) + ' years ago';
  }
}

export default {
  emits: ['update-star', 'update-clicked'],
  data() {
    return {
      showMinimalContent: false
    };
  },
  created() {
    axios.defaults.headers.common['Authorization'] = `Bearer ${this.$store.auth.token}`;
  },
  props: ['id', 'url', 'title', 'published', 'feed', 'contentOriginal', 'author', 'hotlinks', 'status', 'starInd', 'clickedInd', 'imageUrl', 'media', 'contentStripped', 'language', 'createdAt', 'updatedAt', 'feedId', 'tags', 'advertisementScore', 'sentimentScore', 'qualityScore', 'quality', 'cluster'],
  computed: {
    formatDate: function() {
      return (value)=> {
        if (value) {
          // Use custom timeDifference instead of moment.js
          const now = Date.now();
          const then = new Date(value).getTime();
          let result = timeDifference(now, then);
          result = result.charAt(0).toUpperCase() + result.slice(1);
          return result;
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
    },
    mainURL: function() {
      return (value)=> {
        try {  
          const urlObject = new URL(value);  
          return `${urlObject.protocol}//${urlObject.host}/`;  
        } catch (error) {  
          console.error("Invalid URL", error);  
          return value;  
        }
      }
    }
  },
  methods: {
    articleTouched(articleId, event) {
      if (this.$store.data.currentSelection.viewMode === 'full' || this.$store.data.currentSelection.viewMode === 'summarized') {
        this.bookmark(articleId, event);
      } else if (this.$store.data.currentSelection.viewMode === 'minimal') {
        // Avoid toggling when clicking actual links
        if (event.srcElement && event.srcElement.nodeName === 'A') return;
        this.showMinimalContent = !this.showMinimalContent;
      }
    },
    bookmark(articleId, event) {
      // do not bookmark when clicking on hyperlinks
      if (event.srcElement.nodeName === "A") return;

      const isStarred = event.currentTarget.className.indexOf("starred") >= 0;
      const updateType = isStarred ? "unmark" : "mark";
      const delta = isStarred ? -1 : 1;
      const newStarInd = isStarred ? 0 : 1;

      axios
        .post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/articles/markwithstar/" + articleId, { update: updateType })
        .then(
          response => {
            const categoryIndex = this.$store.data.categories.findIndex(
              category => category.id === response.data.feed.categoryId
            );

            if (categoryIndex >= 0) {
              this.$store.data.categories[categoryIndex].starCount += delta;

              const feedIndex = this.$store.data.categories[categoryIndex].feeds.findIndex(
                feed => feed.id === response.data.feedId
              );

              if (feedIndex >= 0) {
                this.$store.data.categories[categoryIndex].feeds[feedIndex].starCount += delta;
              }
            }

            if (delta > 0) {
              this.$store.data.increaseStarCount();
            } else {
              this.$store.data.decreaseStarCount();
            }

            // notify parent to update star indicator
            this.$emit('update-star', { id: articleId, starInd: newStarInd });
          },
          response => {
            /* eslint-disable no-console */
            console.log("oops something went wrong", response);
            /* eslint-enable no-console */
          }
        );
    },
    selectTag(tag) {
      const name = tag && tag.name ? tag.name : '';
      // Update the store current selection tag with the tag name
      if (this.$store.data.currentSelection) {
        this.$store.data.currentSelection.tag = name;
      }
    },
    articleClicked(articleId) {
      axios.post(import.meta.env.VITE_VUE_APP_HOSTNAME + "/api/articles/markclicked/" + articleId)
        .then(() => {
          /* eslint-disable no-console */
          console.log("Article marked as clicked");
          /* eslint-enable no-console */
        })
        .catch(error => {
          /* eslint-disable no-console */
          console.error("Error marking article as clicked:", error);
          /* eslint-enable no-console */
        })
        .finally(() => {
          this.$emit('update-clicked', { id: articleId, clickedInd: 1 });
        });
    }
  }
}
</script>