<template>
  <div id="main-container">
    <div id="articles">
      <Article v-for="article in articles" v-bind="article" :key="article.id"/>
    </div>
    <div id="no-more">
      <p v-if="container.length == 0" id="no-results">No posts found!<br><br></p>
      <p v-if="currentSelection != 'unread' && container.length != 0 && remainingItems < fetchCount">You reached the bottom!</p>
      <p v-if="currentSelection == 'unread' && container.length != pool.length" v-on:click="flushPool()">You reached the bottom! <br>Click here to mark all remaining items as read!</p>
      <p v-if="currentSelection == 'unread' && container.length == pool.length && container.length > 0">All items are marked as read.</p>
    </div>
  </div>
</template>

<script>
import Article from "./Article.vue";

export default {
  components: {
    Article
  },
  props: {
    articles: {
      type: Array,
      required: true
    },
    pool: {
      type: Array,
      required: true
    },
    container: {
      type: Array,
      required: true
    },
    currentSelection: {
      type: String,
      required: true
    },
    remainingItems: {
      type: Number,
      required: true
    },
    fetchCount: {
      type: Number,
      required: true
    }
  },
  methods: {
    flushPool() {
        this.$parent.flushPool();
    }
  }
}
</script>

<style scoped>
/* Landscape phones and portrait tablets */
@media (min-width: 767px) {
  #articles {
    margin-left: -15px;
    margin-right: -12px;
  }
}

#articles {
  padding-top: 38px;
  overflow-x: hidden;
  overflow-y: hidden;
  right: 0;
  left: 0;
}

@media (prefers-color-scheme: dark) {
  #articles {
    color: #fff;
    background: #121212;
    border-color: #121212;
    border-bottom-color: #fff;
    background-color: #121212;
  }
}
</style>

<style>
div.infinite-loading-container {
  display: block;
  min-height: 50px;
  padding-top: 20px;
}

#no-more {
  padding-top: 30px;
  padding-bottom: 30px;
  text-align: center;
}

@media (prefers-color-scheme: dark) {
  div.infinite-loading-container {
    color: #fff;
    background: #121212;
    border-color: #121212;
    border-bottom-color: #fff;
    background-color: #121212;
  }
}
</style>