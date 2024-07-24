<template>
  <div id="mobile-container" v-if="mobile" class="overlay">
    <h5 class="mobile-title">Options</h5>
    <div class="close" data-dismiss="modal" aria-label="Close" @click="closeModal">
      <span class="glyphicon">
        <BootstrapIcon icon="x-square-fill" variant="light" />
      </span>
    </div>
    <div class="overlay-content" id="mobile">
      <p class="content-header">Select which category you want to display</p>
      <ul class="categories">
        <li class="category" v-on:click="store.currentSelection.categoryId = '%'; store.currentSelection.feedId = '%';"
        v-bind:class="{'selected': store.currentSelection.categoryId == '%'}">
          <span class="glyphicon">
            <i class="far fa-folder" data-fa-transform="down-5 shrink-2"></i>
          </span>
          <span>Show all categories</span>
        </li>
        <li
          class="category"
          v-on:click="store.currentSelection.categoryId = category.id; store.currentSelection.feedId = '%';"
          v-bind:class="{'selected': store.currentSelection.categoryId === category.id}"
          v-for="category in store.categories"
          :key="category.id"
          v-bind:id="category.id"
        >
          <span class="glyphicon">
            <i class="far fa-folder" data-fa-transform="down-5 shrink-2"></i>
          </span>
          <span>{{ category.name }}</span>
        </li>
      </ul>
      <p class="content-header">Select how the articles should be displayed</p>
      <button @click="store.filter = 'full'" type="button" class="btn btn-primary content">Full content</button>
      <button @click="store.filter = 'minimal'" type="button" class="btn btn-primary content">Minimal content</button>

      <p class="content-header">Refresh feeds</p>
      <button @click="refreshFeeds()" type="button" class="btn btn-danger">Refresh feeds</button>
      <br>      

      <p class="content-header">Click the button below to add a new feed</p>
      <button @click="showNewFeed()" type="button" class="btn btn-primary">Add new feed</button>
      <br>

      <p class="content-header">Click the button below to enable notifications</p>
      <button @click="subscribeNotifications()" type="button" class="btn btn-danger">Subscribe to notifications</button>
      <br><br>

      <button @click="closeModal()" type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      <br><br>
    </div>
  </div>
</template>

<style scoped>
@media screen and (max-height: 450px) {
  .overlay a {
    font-size: 20px;
  }
}

.overlay {
  height: 100%;
  width: 100%;
  position: fixed;
  z-index: 9999;
  left: 0;
  top: 0;
  background-color: white;
  overflow-x: hidden;
}

.mobile-title {
  padding: 10px;
  background-color: #31344B;
  color: #FFF;
}

.overlay-content {
  position: relative;
  width: 100%;
  text-align: left;
  margin-top: 5px;
  margin-left: 10px;
  margin-right: 10px;
}

.close {
  position: fixed;
  top: 12px;
  right: 20px;
}

span.close {
  color: #FFF;
  opacity: none;
}

.overlay-content .categories {
  list-style-type: none;
  text-indent: 4px;
  padding-left: 0px;
  width: 95%;
}

.overlay-content li.category {
  background-color: #9f9f9f;
  border-radius: 4px;
  color: #fff;
  padding: 0px;
  margin-bottom: 6px;
}

div.close span {
  color: white;
}

p.content-header {
  margin-top: 10px;
  margin-bottom: 3px;
}

.overlay-content li.category.selected {
  background-color: #3b4651;
}

@media (prefers-color-scheme: dark) {
  .overlay {
    background-color: #121212;
  }

  p.content-header {
    color: white;
  }

  .overlay-content li.category {
      background-color: #323232;
  }

  .overlay-content li.category.selected {
      background-color: #606060;
  }
}
</style>

<script>
import store from "../store";

export default {
  props: ["mobile"],
  data() {
    return {
      store: store
    };
  },
  methods: {
    closeModal: function() {
      this.emitClickEvent("mobile", null);
    },
    emitClickEvent(eventType, value) {
      this.$emit(eventType, value);
    },
    showNewFeed() {
      this.emitClickEvent("mobile", null);
      this.$emit("modal", "newfeed");
    },
    refreshFeeds() {
      this.$emit('refresh');
    },
    subscribeNotifications() {
      //register service worker
      Notification.requestPermission().then(function(permission) {
        if (permission !== 'granted') {
          throw new Error('Permission not granted for Notification')
        }
      });
    }
  }
};
</script>