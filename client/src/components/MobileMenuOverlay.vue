<template>
  <div id="mobile-container" v-if="mobile" class="overlay">
    <h5 class="mobile-title">Options</h5>
    <div class="overlay-content" id="mobile">
      <p class="content-header">Select which category you want to display</p>
      <ul class="categories">
        <li class="category" @click="selectCategory('%')"
        v-bind:class="{'selected': $store.data.currentSelection.categoryId == '%'}">
          <span class="glyphicon">
            <i class="far fa-folder" data-fa-transform="down-5 shrink-2"></i>
          </span>
          <span>Show all categories</span>
        </li>
        <li
          class="category"
          @click="selectCategory(category.id)"
          v-bind:class="{'selected': $store.data.currentSelection.categoryId === category.id}"
          v-for="category in $store.data.categories"
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
      <button @click="selectViewMode('full')" type="button" class="btn btn-primary content">Full content</button>
      <button @click="selectViewMode('summarized')" type="button" class="btn btn-primary content">Summarized content</button>
      <button @click="selectViewMode('minimal')" type="button" class="btn btn-primary content">Minimal content</button>

      <p class="content-header">Refresh feeds</p>
      <button @click="refreshFeeds()" type="button" class="btn btn-danger">Refresh feeds</button>
      <br>      

      <p class="content-header">Click the button below to add a new feed</p>
      <button @click="showNewFeed()" type="button" class="btn btn-primary">Add new feed</button>
      <br>

      <p class="content-header">Click the button below to enable notifications</p>
      <button @click="subscribeNotifications()" type="button" class="btn btn-danger">Subscribe to notifications</button>
      <br>

      <div v-if="$store.data.currentSelection.AIEnabled">
        <p class="content-header">Chat assistant</p>
        <button @click="chatAssistant()" type="button" class="btn btn-primary">{{ $store.data.chatAssistantOpen ? 'Close Chat' : 'Open Chat' }}</button>
        <br><br><br>
      </div>

      <button @click="emitClickEvent('mobile', null);" type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
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

button.btn.btn-primary.content {
  margin-bottom: 10px;
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
  padding-left: 10px;
  padding-right: 10px;
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
  width: 100%;
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

.btn-primary.content {
  margin-right: 5px;
}

.overlay-content .btn {
  width: 100%;
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
export default {
  props: ["mobile"],
  methods: {
    emitClickEvent(eventType, value) {
      this.$emit(eventType, value);
    },
    showNewFeed() {
      this.emitClickEvent("mobile", null);
      this.$store.data.setShowModal('NewFeed');
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
    },
    chatAssistant() {
      this.$store.data.chatAssistantOpen = !this.$store.data.chatAssistantOpen;
      this.emitClickEvent('mobile', null);
    },
    selectCategory(categoryId) {
      this.$store.data.currentSelection.categoryId = categoryId;
      this.$store.data.currentSelection.feedId = '%';
      setTimeout(() => {
        this.emitClickEvent('mobile', null);
      }, 150);
    },
    selectViewMode(mode) {
      this.$store.data.currentSelection.viewMode = mode;
      setTimeout(() => {
        this.emitClickEvent('mobile', null);
      }, 150);
    }
  }
};
</script>